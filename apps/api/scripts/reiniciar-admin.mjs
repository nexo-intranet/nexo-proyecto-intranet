/**
 * Recuperación de acceso de un administrador.
 *
 * Le asigna una contraseña temporal nueva y borra su registro de 2FA, para que
 * vuelva a entrar y configure ambos desde cero. Es la salida cuando **no queda
 * ningún administrador con acceso** — el caso que el panel no puede resolver,
 * porque para reiniciarle la contraseña a alguien hay que estar dentro.
 *
 * No borra ni crea usuarios. Borrar al administrador sembrado es imposible por
 * diseño: el audit log referencia sus acciones y no acepta DELETE ni UPDATE.
 *
 * Uso, dentro del contenedor del API:
 *
 *   cd /app/apps/api
 *   node scripts/reiniciar-admin.mjs
 *   node scripts/reiniciar-admin.mjs otro@correo.com
 *
 * La contraseña se imprime **una sola vez** y no queda guardada en ninguna parte.
 */

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

/** Sin caracteres ambiguos: nada de 0/O ni 1/l/I, que se dictan mal por teléfono. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function passwordTemporal(longitud = 16) {
  const bytes = randomBytes(longitud);
  let salida = '';
  for (let i = 0; i < longitud; i += 1) salida += ALFABETO[bytes[i] % ALFABETO.length];
  return salida;
}

const email = process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@nexoadministracion.com';

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

try {
  const clave = passwordTemporal();
  const hash = await argon2.hash(clave, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const actualizado = await cliente.query(
    `UPDATE "Usuario"
        SET "passwordHash" = $1,
            "debeCambiarPassword" = true,
            "totpActivado" = false,
            "totpSecretCifrado" = NULL,
            "ultimoTotpUsado" = NULL,
            "ultimoTotpEn" = NULL,
            "intentosFallidos" = 0,
            "bloqueadoHasta" = NULL,
            "activo" = true,
            "updatedAt" = now()
      WHERE email = $2
        AND "deletedAt" IS NULL
   RETURNING id, email`,
    [hash, email],
  );

  if (actualizado.rowCount === 0) {
    console.error(`No existe un usuario activo con el correo ${email}.`);
    process.exitCode = 1;
  } else {
    const usuario = actualizado.rows[0];

    // Reiniciar el acceso de un administrador es una acción privilegiada hecha por
    // fuera de la aplicación. Que quede registrada no es opcional: si no, sería la
    // única forma de tomar una cuenta sin dejar rastro.
    const nexo = await cliente.query(
      `SELECT id FROM "EmpresaAdministrada" WHERE "esNexo" = true LIMIT 1`,
    );

    await cliente.query(
      `INSERT INTO "AuditLog" ("empresaId","usuarioId","accion","entidad","entidadId","valorNuevo","ruta")
       VALUES ($1,$2,'ACTUALIZAR','Usuario',$3,$4,'scripts/reiniciar-admin.mjs')`,
      [
        nexo.rows[0]?.id ?? null,
        usuario.id,
        usuario.id,
        JSON.stringify({ passwordReiniciada: true, totpReiniciado: true, origen: 'consola' }),
      ],
    );

    // Las sesiones abiertas se cierran: si alguien tenía una, deja de tenerla ahora.
    await cliente.query(
      `UPDATE "SesionRefresh" SET "revocadaEn" = now()
        WHERE "usuarioId" = $1 AND "revocadaEn" IS NULL`,
      [usuario.id],
    );

    await cliente.query(`DELETE FROM "CodigoRespaldo" WHERE "usuarioId" = $1`, [usuario.id]);

    console.warn('');
    console.warn(`  Acceso reiniciado para ${usuario.email}`);
    console.warn('');
    console.warn(`  Contraseña temporal: ${clave}`);
    console.warn('');
    console.warn('  Se muestra una sola vez. Al entrar, el sistema pedirá cambiarla');
    console.warn('  y volver a registrar la verificación en dos pasos.');
    console.warn('');
  }
} finally {
  await cliente.end();
}
