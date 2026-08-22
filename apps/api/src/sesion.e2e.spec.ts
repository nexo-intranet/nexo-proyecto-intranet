import { randomBytes } from 'node:crypto';
import { config as cargarEnv } from 'dotenv';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from './app.module';

cargarEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Renovación de sesión: rotación del token de refresco y detección de reuso.
 *
 * El token de acceso dura quince minutos y el de refresco siete días. Que la
 * aplicación no eche a nadie a mitad de la jornada depende por completo de que este
 * mecanismo funcione, y hasta ahora no lo probaba nada.
 *
 * Lo que se verifica:
 *
 *   - refrescar con una cookie válida devuelve una sesión nueva;
 *   - el token **rota**: el que se usó no vuelve a servir;
 *   - reusar uno ya consumido **revoca toda la familia**, porque eso es lo que
 *     parece un token robado;
 *   - después de cerrar sesión, refrescar ya no sirve.
 */

const EMAIL = 'e2e.sesion@nexoadministracion.com';
const PASSWORD = `Prueba${randomBytes(12).toString('base64url')}Aa1`;

async function comoDueno<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

async function limpiar(): Promise<void> {
  await comoDueno(async (cliente) => {
    await cliente.query('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_modificar');
    await cliente.query(
      'DELETE FROM "AuditLog" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_modificar');

    for (const tabla of ['SesionRefresh', 'CodigoRespaldo', 'PermisoModulo', 'UsuarioEmpresa']) {
      await cliente.query(
        `DELETE FROM "${tabla}" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)`,
        [EMAIL],
      );
    }
    await cliente.query('DELETE FROM "Usuario" WHERE email = $1', [EMAIL]);
  });
}

/** Extrae el valor de una cookie de los encabezados `set-cookie`. */
function valorCookie(cabeceras: string[], nombre: string): string | undefined {
  return cabeceras
    .find((cookie) => cookie.startsWith(`${nombre}=`))
    ?.split(';')[0]
    ?.replace(`${nombre}=`, '');
}

describe('Renovación de sesión', () => {
  let app: INestApplication;
  let cookiesIniciales: string[];

  beforeAll(async () => {
    await limpiar();

    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');

      await cliente.query(
        `INSERT INTO "Rol" ("id","nombre","descripcion")
         VALUES ('e2e_rol_ses','EQUIPO_INTERNO','Acceso según los permisos asignados')
         ON CONFLICT ("nombre") DO NOTHING`,
      );
      const rol = await cliente.query<{ id: string }>(
        `SELECT id FROM "Rol" WHERE nombre = 'EQUIPO_INTERNO'`,
      );

      const hash = await argon2.hash(PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });

      await cliente.query(
        'INSERT INTO "Usuario" ("id","nombre","email","passwordHash","rolId","activo",' +
          '"debeCambiarPassword","updatedAt") ' +
          "VALUES ('e2e_usuario_ses','Sesión de prueba',$1,$2,$3,true,false,now())",
        [EMAIL, hash, rol.rows[0]!.id],
      );
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    const ingreso = await request(app.getHttpServer())
      .post('/api/v1/auth/ingresar')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const tokenReto = ingreso.body.tokenReto as string;

    const registro = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/iniciar')
      .send({ tokenReto })
      .expect(200);

    const confirmacion = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/confirmar')
      .send({ tokenReto, codigo: authenticator.generate(registro.body.secreto as string) })
      .expect(200);

    cookiesIniciales = (confirmacion.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(valorCookie(cookiesIniciales, 'nexo_refresco')).toBeDefined();
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await limpiar();
  });

  it('refrescar con la cookie válida devuelve una sesión nueva', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/auth/refrescar')
      .set('Cookie', cookiesIniciales)
      .expect(200);

    expect(respuesta.body.ok).toBe(true);

    const nuevas = (respuesta.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(valorCookie(nuevas, 'nexo_acceso')).toBeDefined();
    expect(valorCookie(nuevas, 'nexo_refresco')).toBeDefined();
  });

  it('el token de refresco rota: el anterior deja de servir', async () => {
    // Segundo intento con la MISMA cookie del ingreso, que ya se consumió arriba.
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/auth/refrescar')
      .set('Cookie', cookiesIniciales)
      .expect(401);

    // `TOKEN_EXPIRADO` y no `NO_AUTENTICADO`: la diferencia importa. Uno dice «no
    // traías cookie»; el otro, «traías una que ya no sirve». El navegador reacciona
    // igual —a la pantalla de ingreso— pero en el audit log no dicen lo mismo.
    expect(respuesta.body.error.codigo).toBe('TOKEN_EXPIRADO');
  });

  /**
   * Reusar un token consumido revoca **toda la familia**, no solo ese token.
   *
   * Es la razón por la que el navegador tiene que renovar de a una: si cinco
   * peticiones caducadas pidieran su renovación a la vez, cuatro llegarían con un
   * token ya usado y el servidor —con razón— cerraría la sesión entera.
   */
  it('reusar un token consumido revoca la familia completa', async () => {
    const sesiones = await comoDueno((cliente) =>
      cliente.query<{ activas: string }>(
        `SELECT count(*)::text AS activas
           FROM "SesionRefresh" s
           JOIN "Usuario" u ON u.id = s."usuarioId"
          WHERE u.email = $1 AND s."revocadaEn" IS NULL`,
        [EMAIL],
      ),
    );

    // El reuso del test anterior ya revocó la familia: no queda ninguna viva.
    expect(sesiones.rows[0]?.activas).toBe('0');
  });

  it('sin cookie de refresco responde 401, no un error interno', async () => {
    const respuesta = await request(app.getHttpServer()).post('/api/v1/auth/refrescar').expect(401);

    expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('después de cerrar sesión, la renovación ya no sirve', async () => {
    // Sesión nueva y limpia, porque la anterior quedó revocada.
    const ingreso = await request(app.getHttpServer())
      .post('/api/v1/auth/ingresar')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    // El 2FA ya quedó registrado en el beforeAll; aquí solo hay que responderlo.
    const secreto = await secretoDe(app);

    const confirmacion = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/confirmar')
      .send({
        tokenReto: ingreso.body.tokenReto as string,
        codigo: authenticator.generate(secreto),
      })
      .expect(200);

    const cookies = (confirmacion.headers['set-cookie'] as unknown as string[]) ?? [];
    const csrf = valorCookie(cookies, 'nexo_csrf') ?? '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/salir')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .expect(200);

    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/auth/refrescar')
      .set('Cookie', cookies)
      .expect(401);

    expect(respuesta.body.error.codigo).toBe('TOKEN_EXPIRADO');
  });
});

/** El secreto TOTP ya registrado, para poder volver a entrar en la misma prueba. */
async function secretoDe(app: INestApplication): Promise<string> {
  const { CifradoService } = await import('./core/crypto/cifrado.service');
  const cifrado = app.get(CifradoService);

  const fila = await comoDueno((cliente) =>
    cliente.query<{ totpSecretCifrado: string }>(
      'SELECT "totpSecretCifrado" FROM "Usuario" WHERE email = $1',
      [EMAIL],
    ),
  );

  return cifrado.descifrar(fila.rows[0]!.totpSecretCifrado);
}
