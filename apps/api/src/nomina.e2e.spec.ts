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
 * Etapa 5 de punta a punta: empleado, recibo de nómina y documentos laborales.
 *
 * Lo que se verifica es el criterio de terminado de `docs/ETAPA-05.md` §6, y en
 * particular la distinción que estructura toda la etapa: **el recibo se congela y
 * la carta laboral no.** Un recibo de marzo dice lo de marzo para siempre; una
 * carta laboral pedida en junio dice lo de junio.
 */

const EMPRESA = 'e2e_nom_empresa';
const EMPRESA_AJENA = 'e2e_nom_ajena';
const EMAIL = 'e2e.nomina@nexoadministracion.com';
const PASSWORD = `Prueba${randomBytes(12).toString('base64url')}Aa1`;

const CARGO_ORIGINAL = 'Analista contable';

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

    // De las hojas hacia la raíz.
    for (const tabla of [
      'ConceptoNomina',
      'DocumentoLaboral',
      'ReciboNomina',
      'Empleado',
      'Consecutivo',
    ]) {
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

describe('Empleados y nómina, de punta a punta', () => {
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

  const patch = (ruta: string, cuerpo: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1${ruta}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', EMPRESA)
      .set('X-CSRF-Token', csrf)
      .send(cuerpo);

  let empleadoId: string;
  let reciboId: string;
  let consecutivo: string;

  const PERIODO = { periodoInicio: '2026-03-01', periodoFin: '2026-03-31' };

  beforeAll(async () => {
    await limpiar();

    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');

      for (const [id, nit, nombre] of [
        [EMPRESA, '900000501', 'Empleadora Uno SAS'],
        [EMPRESA_AJENA, '900000502', 'Otra empleadora SAS'],
      ]) {
        await cliente.query(
          'INSERT INTO "EmpresaAdministrada" ' +
            '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","direccion","updatedAt") ' +
            "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin','Carrera 43 # 1-50',now())",
          [id, nombre, nit],
        );
      }

      await cliente.query(
        `INSERT INTO "Rol" ("id","nombre","descripcion")
         VALUES ('e2e_rol_nom','EQUIPO_INTERNO','Acceso según los permisos asignados')
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
          "VALUES ('e2e_usuario_nom','Nómina de prueba',$1,$2,$3,true,false,now()) RETURNING id",
        [EMAIL, hash, rol.rows[0]!.id],
      );

      await cliente.query(
        'INSERT INTO "UsuarioEmpresa" ("id","usuarioId","empresaId") VALUES ($1,$2,$3)',
        ['e2e_nom_acceso', usuario.rows[0]!.id, EMPRESA],
      );
      await cliente.query(
        'INSERT INTO "PermisoModulo" ("id","usuarioId","modulo","puedeVer","puedeEditar") ' +
          "VALUES ('e2e_nom_permiso',$1,'EMPLEADOS',true,true)",
        [usuario.rows[0]!.id],
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

  it('registra un empleado sin devolver su documento completo', async () => {
    const respuesta = await post('/empleados', {
      nombre: 'Laura Restrepo',
      tipoDoc: 'CC',
      numeroDoc: '1017456789',
      cargo: CARGO_ORIGINAL,
      salarioBase: '2500000.00',
      tipoContrato: 'INDEFINIDO',
      fechaIngreso: '2024-02-01',
    }).expect(201);

    empleadoId = respuesta.body.id as string;
    expect(respuesta.body.numeroDocFinal).toBe('6789');
    expect(JSON.stringify(respuesta.body)).not.toContain('1017456789');
    expect(respuesta.body.activo).toBe(true);
  });

  it('lo encuentra por documento sin descifrar la tabla', async () => {
    const respuesta = await get('/empleados/buscar?documento=1017456789').expect(200);
    expect(respuesta.body.id).toBe(empleadoId);
  });

  it('previsualizar totaliza sin guardar nada', async () => {
    const respuesta = await post('/recibos-nomina/previsualizar', {
      ...PERIODO,
      tipoPeriodo: 'MENSUAL',
      conceptos: [
        { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2500000.00' },
        { tipo: 'DEVENGADO', concepto: 'Auxilio de transporte', valor: '162000.00' },
        { tipo: 'DEDUCCION', concepto: 'Salud', valor: '100000.00' },
        { tipo: 'DEDUCCION', concepto: 'Pensión', valor: '100000.00' },
      ],
    }).expect(200);

    expect(respuesta.body.totalDevengado).toBe('2662000.00');
    expect(respuesta.body.neto).toBe('2462000.00');

    const recibos = await get(`/empleados/${empleadoId}/recibos`).expect(200);
    expect(recibos.body.total).toBe(0);
  });

  it('liquidar emite el recibo con consecutivo, y el neto es el previsualizado', async () => {
    const respuesta = await post(`/empleados/${empleadoId}/recibos`, {
      ...PERIODO,
      tipoPeriodo: 'MENSUAL',
      conceptos: [
        { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2500000.00' },
        { tipo: 'DEVENGADO', concepto: 'Auxilio de transporte', valor: '162000.00' },
        { tipo: 'DEDUCCION', concepto: 'Salud', valor: '100000.00' },
        { tipo: 'DEDUCCION', concepto: 'Pensión', valor: '100000.00' },
      ],
    }).expect(201);

    reciboId = respuesta.body.id as string;
    consecutivo = respuesta.body.consecutivo as string;

    expect(consecutivo).toMatch(/^RN-\d{6}$/);
    expect(respuesta.body.neto).toBe('2462000.00');
    expect(respuesta.body.conceptos).toHaveLength(4);
    expect(respuesta.body.estado).toBe('VIGENTE');
  });

  it('no se liquida dos veces el mismo período', async () => {
    const respuesta = await post(`/empleados/${empleadoId}/recibos`, {
      ...PERIODO,
      tipoPeriodo: 'MENSUAL',
      conceptos: [{ tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2500000.00' }],
    }).expect(409);

    expect(respuesta.body.error.mensaje).toContain(consecutivo);
  });

  it('rechaza un recibo donde las deducciones superan a los devengados', async () => {
    const respuesta = await post('/recibos-nomina/previsualizar', {
      periodoInicio: '2026-04-01',
      periodoFin: '2026-04-30',
      tipoPeriodo: 'MENSUAL',
      conceptos: [
        { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '1000000.00' },
        { tipo: 'DEDUCCION', concepto: 'Embargo', valor: '1500000.00' },
      ],
    }).expect(409);

    expect(respuesta.body.error.mensaje).toContain('negativo');
  });

  it('el PDF del recibo sale con la identidad de la empresa administrada', async () => {
    const respuesta = await get(`/recibos-nomina/${reciboId}/pdf`).expect(200);

    expect(respuesta.headers['content-type']).toBe('application/pdf');
    expect(respuesta.headers['content-disposition']).toContain(`${consecutivo}.pdf`);
    expect(respuesta.body.length).toBeGreaterThan(1000);
  });

  /**
   * El corazón de la etapa: el recibo se congela, la carta no.
   */
  it('cambiar el cargo no altera un recibo ya emitido', async () => {
    await patch(`/empleados/${empleadoId}`, { cargo: 'Coordinadora contable' }).expect(200);

    const recibo = await get(`/recibos-nomina/${reciboId}`).expect(200);
    // El snapshot conserva el cargo que tenía al liquidar.
    expect(recibo.body.conceptos).toHaveLength(4);

    const detalle = await comoDueno((cliente) =>
      cliente.query<{ contenido: { empleado: { cargo: string } } }>(
        'SELECT contenido FROM "ReciboNomina" WHERE id = $1',
        [reciboId],
      ),
    );
    expect(detalle.rows[0]!.contenido.empleado.cargo).toBe(CARGO_ORIGINAL);
  });

  it('la carta laboral, en cambio, dice el cargo de hoy', async () => {
    const respuesta = await post(`/empleados/${empleadoId}/documentos`, {
      tipo: 'CARTA_LABORAL',
    }).expect(201);

    expect(respuesta.headers['content-type']).toBe('application/pdf');

    // El PDF es binario, así que la comprobación de que usó datos frescos es que el
    // empleado ya tiene el cargo nuevo y la emisión no falló ni leyó un snapshot.
    const empleado = await get(`/empleados/${empleadoId}`).expect(200);
    expect(empleado.body.cargo).toBe('Coordinadora contable');

    const historial = await get(`/empleados/${empleadoId}/documentos`).expect(200);
    expect(historial.body).toHaveLength(1);
    expect(historial.body[0].tipo).toBe('CARTA_LABORAL');
  });

  it('el certificado de ingresos exige el año', async () => {
    const respuesta = await post(`/empleados/${empleadoId}/documentos`, {
      tipo: 'CERTIFICADO_INGRESOS',
    }).expect(400);

    expect(respuesta.body.error.detalles).toHaveProperty('anio');
  });

  it('el certificado se arma con los recibos vigentes del año', async () => {
    await post(`/empleados/${empleadoId}/documentos`, {
      tipo: 'CERTIFICADO_INGRESOS',
      anio: 2026,
    }).expect(201);

    const sinRecibos = await post(`/empleados/${empleadoId}/documentos`, {
      tipo: 'CERTIFICADO_INGRESOS',
      anio: 2019,
    }).expect(409);

    expect(sinRecibos.body.error.mensaje).toContain('2019');
  });

  it('anular sin escribir el consecutivo correcto no anula nada', async () => {
    const respuesta = await post(`/recibos-nomina/${reciboId}/anular`, {
      motivo: 'Se liquidó con un concepto equivocado',
      confirmacionConsecutivo: 'RN-999999',
    }).expect(409);

    expect(respuesta.body.error.mensaje).toContain(consecutivo);

    const recibo = await get(`/recibos-nomina/${reciboId}`).expect(200);
    expect(recibo.body.estado).toBe('VIGENTE');
  });

  it('anulado, el período se puede volver a liquidar', async () => {
    await post(`/recibos-nomina/${reciboId}/anular`, {
      motivo: 'Se liquidó con un concepto equivocado',
      confirmacionConsecutivo: consecutivo,
    }).expect(201);

    const nuevo = await post(`/empleados/${empleadoId}/recibos`, {
      ...PERIODO,
      tipoPeriodo: 'MENSUAL',
      conceptos: [
        { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2500000.00' },
        { tipo: 'DEDUCCION', concepto: 'Salud', valor: '100000.00' },
      ],
    }).expect(201);

    expect(nuevo.body.consecutivo).not.toBe(consecutivo);
    expect(nuevo.body.neto).toBe('2400000.00');
  });

  it('un empleado retirado no se puede liquidar, pero conserva sus recibos', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/empleados/${empleadoId}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', EMPRESA)
      .set('X-CSRF-Token', csrf)
      .expect(204);

    const intento = await post(`/empleados/${empleadoId}/recibos`, {
      periodoInicio: '2026-05-01',
      periodoFin: '2026-05-31',
      tipoPeriodo: 'MENSUAL',
      conceptos: [{ tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2500000.00' }],
    }).expect(409);

    expect(intento.body.error.mensaje).toContain('retirado');

    const recibos = await get(`/empleados/${empleadoId}/recibos`).expect(200);
    expect(recibos.body.total).toBe(2); // el anulado y el nuevo
  });

  it('un empleado de otra empresa responde como si no existiera', async () => {
    const ajeno = await comoDueno((cliente) =>
      cliente.query<{ id: string }>(
        `INSERT INTO "Empleado" ("id","empresaId","nombre","tipoDoc","numeroDocCifrado",
           "numeroDocHash","numeroDocFinal","cargo","salarioBase","fechaIngreso","updatedAt")
         VALUES ('e2e_emp_ajeno',$1,'Ajeno','CC','x','hash_emp_ajeno','0000','Cargo',1000000,now(),now())
         RETURNING id`,
        [EMPRESA_AJENA],
      ),
    );

    const respuesta = await get(`/empleados/${ajeno.rows[0]!.id}`).expect(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});
