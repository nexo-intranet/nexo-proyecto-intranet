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
 * Criterio de terminado de la Etapa 1 (brief §8):
 *
 *   "no puede ver datos de una empresa a la que no tiene acceso
 *    ni forzando el id en la URL"
 *
 * Esta prueba levanta la aplicación completa —guards, extensión de Prisma y RLS— y
 * entra por la puerta real: contraseña, segundo factor y cookies. Después intenta,
 * con una sesión legítima, alcanzar datos de una empresa ajena.
 */

const EMPRESA_PROPIA = 'e2e_empresa_propia';
const EMPRESA_AJENA = 'e2e_empresa_ajena';
const EMAIL = 'e2e.equipo@nexoadministracion.com';
// Se genera en cada corrida en vez de quedar escrita: una credencial fija en el
// repositorio, aunque sea de prueba, es exactamente lo que gitleaks debe marcar.
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
    await cliente.query(
      'DELETE FROM "SesionRefresh" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query(
      'DELETE FROM "CodigoRespaldo" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query(
      'DELETE FROM "PermisoModulo" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query(
      'DELETE FROM "UsuarioEmpresa" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query('DELETE FROM "Usuario" WHERE email = $1', [EMAIL]);
    await cliente.query('DELETE FROM "Consecutivo" WHERE "empresaId" = ANY($1)', [
      [EMPRESA_PROPIA, EMPRESA_AJENA],
    ]);
    await cliente.query('DELETE FROM "EmpresaAdministrada" WHERE "id" = ANY($1)', [
      [EMPRESA_PROPIA, EMPRESA_AJENA],
    ]);
  });
}

describe('Aislamiento entre empresas, de punta a punta', () => {
  let app: INestApplication;
  let cookies: string[];

  beforeAll(async () => {
    await limpiar();

    // Dos empresas y un usuario de equipo interno con acceso a una sola de ellas.
    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');
      for (const [id, nit] of [
        [EMPRESA_PROPIA, '900000201'],
        [EMPRESA_AJENA, '900000202'],
      ]) {
        await cliente.query(
          'INSERT INTO "EmpresaAdministrada" ' +
            '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","updatedAt") ' +
            "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin',now())",
          [id, `Empresa ${id}`, nit],
        );
      }

      // La prueba no asume que la base esté sembrada: crea el rol si falta. En un
      // entorno limpio —como el de CI— no hay nada cargado todavía.
      await cliente.query(
        `INSERT INTO "Rol" ("id","nombre","descripcion")
         VALUES ('e2e_rol_equipo','EQUIPO_INTERNO','Acceso según los permisos asignados')
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

      const usuario = await cliente.query<{ id: string }>(
        'INSERT INTO "Usuario" ("id","nombre","email","passwordHash","rolId","activo",' +
          '"debeCambiarPassword","updatedAt") ' +
          "VALUES ('e2e_usuario','Equipo de prueba',$1,$2,$3,true,false,now()) RETURNING id",
        [EMAIL, hash, rol.rows[0]!.id],
      );

      await cliente.query(
        'INSERT INTO "UsuarioEmpresa" ("id","usuarioId","empresaId") VALUES ($1,$2,$3)',
        ['e2e_acceso', usuario.rows[0]!.id, EMPRESA_PROPIA],
      );
      await cliente.query(
        'INSERT INTO "PermisoModulo" ("id","usuarioId","modulo","puedeVer","puedeEditar") ' +
          "VALUES ('e2e_permiso',$1,'ADMINISTRACION',true,false)",
        [usuario.rows[0]!.id],
      );
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    // Ingreso por la puerta real: contraseña, registro del segundo factor y sesión.
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

    cookies = (confirmacion.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.length).toBeGreaterThan(0);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await limpiar();
  });

  it('la sesión quedó abierta y ve solo su empresa', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/auth/yo')
      .set('Cookie', cookies)
      .expect(200);

    const empresas = respuesta.body.empresas as Array<{ id: string }>;
    expect(empresas).toHaveLength(1);
    expect(empresas[0]?.id).toBe(EMPRESA_PROPIA);
  });

  it('forzar el id de otra empresa en la URL responde como si no existiera', async () => {
    const respuesta = await request(app.getHttpServer())
      .get(`/api/v1/empresas/${EMPRESA_AJENA}`)
      .set('Cookie', cookies)
      .expect(404);

    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('su propia empresa sí la puede consultar', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/empresas/${EMPRESA_PROPIA}`)
      .set('Cookie', cookies)
      .expect(200);
  });

  it('enviar el encabezado de una empresa ajena devuelve 403', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/auditoria')
      .set('Cookie', cookies)
      .set('X-Empresa-Id', EMPRESA_AJENA)
      .expect(403);

    expect(respuesta.body.error.codigo).toBe('EMPRESA_NO_AUTORIZADA');
  });

  it('sin encabezado de empresa, una ruta que la necesita lo pide', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/api/v1/auditoria')
      .set('Cookie', cookies)
      .expect(400);

    expect(respuesta.body.error.codigo).toBe('EMPRESA_NO_SELECCIONADA');
  });

  it('con su empresa, el audit log responde', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auditoria')
      .set('Cookie', cookies)
      .set('X-Empresa-Id', EMPRESA_PROPIA)
      .expect(200);
  });

  it('sin permiso de edición no puede crear una empresa', async () => {
    const csrf = cookies
      .find((cookie) => cookie.startsWith('nexo_csrf='))
      ?.split(';')[0]
      ?.replace('nexo_csrf=', '');

    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/empresas')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf ?? '')
      .send({
        nombre: 'Intento no autorizado',
        nit: '890903938',
        digitoVerificacion: 8,
        tipoContribuyente: 'PERSONA_JURIDICA',
        municipio: 'Medellín',
      })
      .expect(403);

    expect(respuesta.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('una mutación sin el token CSRF se rechaza', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/v1/empresas')
      .set('Cookie', cookies)
      .send({ nombre: 'Sin CSRF' })
      .expect(403);

    expect(respuesta.body.error.codigo).toBe('CSRF_INVALIDO');
  });
});
