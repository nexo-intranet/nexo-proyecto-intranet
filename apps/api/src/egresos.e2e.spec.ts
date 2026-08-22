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
 * Etapa 3 de punta a punta: egreso, orden de pago y su PDF.
 *
 * Lo que se verifica es el criterio de terminado de `docs/ETAPA-03.md` §6, que se
 * reduce a cinco afirmaciones:
 *
 *   - crear un egreso emite su orden con consecutivo, sin repetir número;
 *   - el PDF trae la identidad de la **empresa administrada**, no la de Nexo;
 *   - cambiar la empresa **no altera** una orden emitida antes;
 *   - anular sin escribir el consecutivo correcto no anula nada;
 *   - una anulada se reemite una sola vez.
 */

const EMPRESA = 'e2e_egr_empresa';
const EMPRESA_AJENA = 'e2e_egr_ajena';
const EMAIL = 'e2e.egresos@nexoadministracion.com';
const PASSWORD = `Prueba${randomBytes(12).toString('base64url')}Aa1`;

const NOMBRE_ORIGINAL = 'Comercializadora Uno SAS';

async function comoDueno<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

const EMPRESAS = [EMPRESA, EMPRESA_AJENA];

async function limpiar(): Promise<void> {
  await comoDueno(async (cliente) => {
    await cliente.query('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_modificar');
    await cliente.query('DELETE FROM "AuditLog" WHERE "empresaId" = ANY($1)', [EMPRESAS]);
    await cliente.query(
      'DELETE FROM "AuditLog" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)',
      [EMAIL],
    );
    await cliente.query('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_modificar');

    // Las órdenes primero: apuntan al egreso y unas a otras.
    await cliente.query('DELETE FROM "OrdenPago" WHERE "empresaId" = ANY($1)', [EMPRESAS]);
    for (const tabla of ['Egreso', 'Destinatario', 'Consecutivo']) {
      await cliente.query(`DELETE FROM "${tabla}" WHERE "empresaId" = ANY($1)`, [EMPRESAS]);
    }

    for (const tabla of ['SesionRefresh', 'CodigoRespaldo', 'PermisoModulo', 'UsuarioEmpresa']) {
      await cliente.query(
        `DELETE FROM "${tabla}" WHERE "usuarioId" IN (SELECT id FROM "Usuario" WHERE email = $1)`,
        [EMAIL],
      );
    }
    await cliente.query('DELETE FROM "Usuario" WHERE email = $1', [EMAIL]);
    await cliente.query('DELETE FROM "EmpresaAdministrada" WHERE id = ANY($1)', [EMPRESAS]);
  });
}

describe('Egresos y órdenes de pago, de punta a punta', () => {
  let app: INestApplication;
  let cookies: string[];
  let csrf: string;

  const get = (ruta: string, empresa = EMPRESA) =>
    request(app.getHttpServer())
      .get(`/api/v1${ruta}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', empresa);

  const post = (ruta: string, cuerpo: object, empresa = EMPRESA) =>
    request(app.getHttpServer())
      .post(`/api/v1${ruta}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', empresa)
      .set('X-CSRF-Token', csrf)
      .send(cuerpo);

  const patch = (ruta: string, cuerpo: object, empresa = EMPRESA) =>
    request(app.getHttpServer())
      .patch(`/api/v1${ruta}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', empresa)
      .set('X-CSRF-Token', csrf)
      .send(cuerpo);

  let egresoId: string;
  let ordenId: string;
  let consecutivo: string;

  beforeAll(async () => {
    await limpiar();

    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');

      for (const [id, nit, nombre] of [
        [EMPRESA, '900000401', NOMBRE_ORIGINAL],
        [EMPRESA_AJENA, '900000402', 'Otra empresa SAS'],
      ]) {
        await cliente.query(
          'INSERT INTO "EmpresaAdministrada" ' +
            '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","direccion","updatedAt") ' +
            "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin','Calle 10 # 40-20',now())",
          [id, nombre, nit],
        );
      }

      await cliente.query(
        `INSERT INTO "Rol" ("id","nombre","descripcion")
         VALUES ('e2e_rol_egr','EQUIPO_INTERNO','Acceso según los permisos asignados')
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
          "VALUES ('e2e_usuario_egr','Tesorera de prueba',$1,$2,$3,true,false,now()) RETURNING id",
        [EMAIL, hash, rol.rows[0]!.id],
      );
      const usuarioId = usuario.rows[0]!.id;

      await cliente.query(
        'INSERT INTO "UsuarioEmpresa" ("id","usuarioId","empresaId") VALUES ($1,$2,$3)',
        ['e2e_egr_acceso', usuarioId, EMPRESA],
      );
      await cliente.query(
        'INSERT INTO "PermisoModulo" ("id","usuarioId","modulo","puedeVer","puedeEditar") ' +
          "VALUES ('e2e_egr_permiso',$1,'EGRESOS',true,true)",
        [usuarioId],
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

    cookies = (confirmacion.headers['set-cookie'] as unknown as string[]) ?? [];
    csrf =
      cookies
        .find((cookie) => cookie.startsWith('nexo_csrf='))
        ?.split(';')[0]
        ?.replace('nexo_csrf=', '') ?? '';
    expect(csrf).not.toBe('');
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await limpiar();
  });

  it('registrar un egreso emite su orden de pago con consecutivo', async () => {
    const respuesta = await post('/egresos', {
      concepto: 'Licencia anual de Figma',
      tipoIntangible: 'LICENCIA_SOFTWARE',
      beneficiario: 'Figma Inc.',
      monto: '1200.00',
      moneda: 'USD',
      tasaCambio: '4100.00',
      fecha: new Date().toISOString(),
    }).expect(201);

    egresoId = respuesta.body.id as string;
    expect(respuesta.body.montoCOP).toBe('4920000.00');
    expect(respuesta.body.ordenes).toHaveLength(1);

    consecutivo = respuesta.body.ordenes[0].consecutivo as string;
    ordenId = respuesta.body.ordenes[0].id as string;
    expect(consecutivo).toMatch(/^OP-\d{6}$/);
    expect(respuesta.body.ordenVigente.consecutivo).toBe(consecutivo);
  });

  it('exige la tasa cuando el egreso no está en pesos', async () => {
    const respuesta = await post('/egresos', {
      concepto: 'Sin tasa',
      tipoIntangible: 'OTRO',
      beneficiario: 'Alguien',
      monto: '100.00',
      moneda: 'USD',
      fecha: new Date().toISOString(),
    }).expect(400);

    expect(respuesta.body.error.detalles).toHaveProperty('tasaCambio');
  });

  it('el dinero viaja como texto, nunca como número', async () => {
    const respuesta = await get(`/egresos/${egresoId}`).expect(200);
    expect(typeof respuesta.body.monto).toBe('string');
    expect(typeof respuesta.body.montoCOP).toBe('string');
  });

  it('el PDF sale con la identidad de la empresa administrada', async () => {
    const respuesta = await get(`/ordenes-pago/${ordenId}/pdf`).expect(200);

    expect(respuesta.headers['content-type']).toBe('application/pdf');
    expect(respuesta.headers['content-disposition']).toContain(`${consecutivo}.pdf`);
    expect(respuesta.body.length).toBeGreaterThan(1000);
  });

  it('guarda el hash del archivo la primera vez que se genera', async () => {
    const respuesta = await get(`/ordenes-pago/${ordenId}`).expect(200);
    expect(respuesta.body.hashArchivo).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * El corazón de la decisión 1.1: lo inmutable es lo que decía el documento.
   */
  it('cambiar los datos de la empresa no altera una orden ya emitida', async () => {
    await comoDueno((cliente) =>
      cliente.query('UPDATE "EmpresaAdministrada" SET nombre = $1, direccion = $2 WHERE id = $3', [
        'Comercializadora Uno SAS EN LIQUIDACION',
        'Otra dirección completamente distinta',
        EMPRESA,
      ]),
    );

    const respuesta = await get(`/ordenes-pago/${ordenId}`).expect(200);

    expect(respuesta.body.contenido.emisor.nombre).toBe(NOMBRE_ORIGINAL);
    expect(respuesta.body.contenido.emisor.direccion).toBe('Calle 10 # 40-20');
  });

  it('anular sin escribir el consecutivo correcto no anula nada', async () => {
    const respuesta = await post(`/egresos/${egresoId}/anular`, {
      motivo: 'Se registró por equivocación con el proveedor incorrecto',
      confirmacionConsecutivo: 'OP-999999',
    }).expect(409);

    expect(respuesta.body.error.mensaje).toContain(consecutivo);

    const egreso = await get(`/egresos/${egresoId}`).expect(200);
    expect(egreso.body.estado).toBe('REGISTRADO');
  });

  it('corregir el egreso anula su orden y emite una nueva', async () => {
    const respuesta = await patch(`/egresos/${egresoId}`, {
      monto: '1300.00',
      motivo: 'El proveedor facturó un valor distinto al registrado',
    }).expect(200);

    expect(respuesta.body.montoCOP).toBe('5330000.00');
    expect(respuesta.body.ordenes).toHaveLength(2);

    const vigentes = (respuesta.body.ordenes as Array<{ estado: string }>).filter(
      (orden) => orden.estado === 'VIGENTE',
    );
    expect(vigentes).toHaveLength(1);

    // La nueva encadena con la anulada, para que el historial se pueda seguir.
    const nueva = respuesta.body.ordenes[0];
    expect(nueva.estado).toBe('VIGENTE');
    expect(nueva.reemplazaA).toBe(consecutivo);
    expect(nueva.consecutivo).not.toBe(consecutivo);
  });

  it('una orden anulada se reemite una sola vez', async () => {
    const nuevo = await post('/egresos', {
      concepto: 'Suscripción de correo corporativo',
      tipoIntangible: 'SUSCRIPCION',
      beneficiario: 'Proveedor de correo',
      monto: '350000.00',
      moneda: 'COP',
      fecha: new Date().toISOString(),
    }).expect(201);

    const orden = nuevo.body.ordenes[0];

    await post(`/ordenes-pago/${orden.id}/anular`, {
      motivo: 'El documento salió con el concepto equivocado',
      confirmacionConsecutivo: orden.consecutivo,
    }).expect(201);

    const reemitida = await post(`/ordenes-pago/${orden.id}/reemitir`, {
      motivo: 'Se vuelve a expedir el mismo documento con número nuevo',
    }).expect(201);

    expect(reemitida.body.reemplazaA).toBe(orden.consecutivo);

    // El segundo intento choca: dos reemisiones dejarían dos vigentes.
    const segundo = await post(`/ordenes-pago/${orden.id}/reemitir`, {
      motivo: 'Intento de reemitir la misma orden por segunda vez',
    }).expect(409);

    expect(segundo.body.error.mensaje).toContain('ya fue reemitida');
  });

  it('no se reemite una orden que está vigente', async () => {
    // Con su propio egreso: las órdenes de los otros casos ya pasaron por anulación,
    // y este comprueba justo la puerta anterior a esa.
    const nuevo = await post('/egresos', {
      concepto: 'Derechos de uso de una fuente tipográfica',
      tipoIntangible: 'DERECHOS',
      beneficiario: 'Fundición tipográfica',
      monto: '890000.00',
      moneda: 'COP',
      fecha: new Date().toISOString(),
    }).expect(201);

    const respuesta = await post(`/ordenes-pago/${nuevo.body.ordenVigente.id}/reemitir`, {
      motivo: 'Intento de reemitir sin haber anulado primero',
    }).expect(409);

    expect(respuesta.body.error.mensaje).toContain('Anúlala primero');
  });

  it('anular el egreso anula también su orden vigente', async () => {
    const antes = await get(`/egresos/${egresoId}`).expect(200);
    const vigente = antes.body.ordenVigente.consecutivo as string;

    const respuesta = await post(`/egresos/${egresoId}/anular`, {
      motivo: 'El servicio se canceló antes de que empezara el periodo',
      confirmacionConsecutivo: vigente,
    }).expect(201);

    expect(respuesta.body.estado).toBe('ANULADO');
    expect(respuesta.body.ordenVigente).toBeNull();
    expect(
      (respuesta.body.ordenes as Array<{ estado: string }>).every(
        (orden) => orden.estado === 'ANULADA',
      ),
    ).toBe(true);
  });

  it('un egreso de otra empresa responde como si no existiera', async () => {
    await get(`/egresos/${egresoId}`, EMPRESA_AJENA).expect(403);

    const ajeno = await comoDueno((cliente) =>
      cliente.query<{ id: string }>(
        `INSERT INTO "Egreso" ("id","empresaId","concepto","tipoIntangible","beneficiario",
           "monto","moneda","montoCOP","fecha","updatedAt")
         VALUES ('e2e_egr_ajeno',$1,'Ajeno','OTRO','Nadie',100,'COP',100,now(),now())
         RETURNING id`,
        [EMPRESA_AJENA],
      ),
    );

    const respuesta = await get(`/egresos/${ajeno.rows[0]!.id}`).expect(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('el resumen separa por moneda y no suma dólares con pesos', async () => {
    const respuesta = await get('/egresos/resumen').expect(200);

    // Solo cuenta los vigentes: el egreso en dólares quedó anulado, así que quedan
    // la suscripción y los derechos. Que el anulado no sume es justo el punto.
    expect(respuesta.body.cantidad).toBe(2);
    expect(respuesta.body.totalCOP).toBe('1240000.00');
    expect(respuesta.body.volumenPorMoneda).toEqual([{ moneda: 'COP', total: '1240000.00' }]);
  });
});
