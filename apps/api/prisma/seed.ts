import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Datos mínimos para que el sistema arranque.
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada. Solo crea la
 * contraseña temporal la primera vez, y la imprime una única vez —no queda
 * guardada en ningún lado en claro.
 *
 * Corre con DIRECT_URL, el rol dueño, porque tiene que escribir antes de que
 * exista cualquier sesión.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? '' }),
});

// TODO [CONFIRMAR] NIT real de Nexo Administración Integral. El de abajo es un
// marcador con dígito de verificación consistente, para no bloquear el arranque.
const NEXO = {
  nombre: 'Nexo Administración Integral',
  nit: '901234567',
  digitoVerificacion: 7,
  municipio: 'Medellín',
  codigoDaneMunicipio: '05001',
} as const;

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function passwordTemporal(longitud = 16): string {
  const bytes = randomBytes(longitud);
  let salida = '';
  for (let i = 0; i < longitud; i += 1) salida += ALFABETO[bytes[i]! % ALFABETO.length];
  return salida;
}

async function main(): Promise<void> {
  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? 'admin@nexoadministracion.com';

  // ── Roles ──────────────────────────────────────────────────────────────────
  const [rolAdministrador] = await Promise.all([
    prisma.rol.upsert({
      where: { nombre: 'ADMINISTRADOR' },
      update: {},
      create: { nombre: 'ADMINISTRADOR', descripcion: 'Acceso completo a todos los módulos' },
    }),
    prisma.rol.upsert({
      where: { nombre: 'EQUIPO_INTERNO' },
      update: {},
      create: { nombre: 'EQUIPO_INTERNO', descripcion: 'Acceso según los permisos asignados' },
    }),
  ]);

  // ── Nexo: primera fila de EmpresaAdministrada (decisión #1 del brief) ──────
  const nexo = await prisma.empresaAdministrada.upsert({
    where: { nit: NEXO.nit },
    update: {},
    create: {
      nombre: NEXO.nombre,
      nit: NEXO.nit,
      digitoVerificacion: NEXO.digitoVerificacion,
      tipoContribuyente: 'PERSONA_JURIDICA',
      municipio: NEXO.municipio,
      codigoDaneMunicipio: NEXO.codigoDaneMunicipio,
      esNexo: true,
      activa: true,
    },
  });

  // ── Usuario administrador ─────────────────────────────────────────────────
  const existente = await prisma.usuario.findUnique({ where: { email: emailAdmin } });
  let temporal: string | null = null;

  if (!existente) {
    temporal = passwordTemporal();
    const usuario = await prisma.usuario.create({
      data: {
        nombre: 'Administrador',
        email: emailAdmin,
        passwordHash: await argon2.hash(temporal, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
        rolId: rolAdministrador.id,
        debeCambiarPassword: true,
        activo: true,
      },
    });

    // El rol ADMINISTRADOR llega a todas las empresas sin filas en UsuarioEmpresa,
    // pero se deja la de Nexo explícita para que el selector no arranque vacío.
    await prisma.usuarioEmpresa.create({
      data: { usuarioId: usuario.id, empresaId: nexo.id },
    });
  }

  // ── Consecutivos de Nexo ──────────────────────────────────────────────────
  // Consecutivo tiene RLS con FORCE, que aplica incluso al dueño de la tabla, así
  // que hay que fijar la empresa activa aunque este script no pase por la API.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.empresa_id', ${nexo.id}, TRUE)`;

    for (const tipo of ['ORDEN_PAGO', 'FACTURA', 'RECIBO_NOMINA'] as const) {
      await tx.consecutivo.upsert({
        where: { empresaId_tipo: { empresaId: nexo.id, tipo } },
        update: {},
        create: { empresaId: nexo.id, tipo, prefijo: '', ultimoValor: 0 },
      });
    }
  });

  console.warn('\nDatos iniciales listos.');
  console.warn(`  Empresa: ${nexo.nombre} (${nexo.nit}-${nexo.digitoVerificacion})`);
  console.warn(`  Usuario: ${emailAdmin}`);

  if (temporal) {
    console.warn(`\n  Contraseña temporal: ${temporal}`);
    console.warn('  Se muestra una sola vez. Hay que cambiarla en el primer ingreso,');
    console.warn('  y el sistema pedirá registrar la verificación en dos pasos.\n');
  } else {
    console.warn('\n  El usuario ya existía: no se cambió su contraseña.\n');
  }
}

main()
  .catch((error) => {
    console.error('Falló la carga de datos iniciales:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
