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
 * Etapa 6a de punta a punta: gastos con soporte, calendario tributario y
 * solicitudes de documento.
 *
 * Lo que más se verifica es lo que más puede salir mal:
 *
 *   · un archivo se valida por su **contenido**, no por su extensión;
 *   · un soporte de otra empresa no se alcanza ni con el id correcto;
 *   · el calendario cruza por último dígito, tipo de contribuyente y —solo en ICA—
 *     municipio, y **Clientes lo consulta sin duplicar la regla**.
 */

const EMPRESA = 'e2e_cont_empresa';
const EMPRESA_AJENA = 'e2e_cont_ajena';
const EMAIL = 'e2e.contabilidad@nexoadministracion.com';
const PASSWORD = `Prueba${randomBytes(12).toString('base64url')}Aa1`;

const ANIO = 2031; // lejos de cualquier calendario real que alguien cargue

/** Un PDF mínimo pero válido: empieza por %PDF, que es lo que se comprueba. */
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
]);

/** Un PNG mínimo: los ocho bytes de firma bastan para el detector. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

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

    for (const tabla of ['SolicitudDocumento', 'Gasto', 'Cliente']) {
      await cliente.query(`DELETE FROM "${tabla}" WHERE "empresaId" = ANY($1)`, [EMPRESAS]);
    }

    // El calendario no tiene empresaId: se limpia por año.
    await cliente.query('DELETE FROM "CalendarioTributario" WHERE anio = $1', [ANIO]);
    await cliente.query('DELETE FROM "ImportacionCalendario" WHERE anio = $1', [ANIO]);

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

describe('Contabilidad 6a, de punta a punta', () => {
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

  const subir = (ruta: string, archivo: Buffer, nombre: string) =>
    request(app.getHttpServer())
      .post(`/api/v1${ruta}`)
      .set('Cookie', cookies)
      .set('X-Empresa-Id', EMPRESA)
      .set('X-CSRF-Token', csrf)
      .attach('archivo', archivo, nombre);

  let gastoId: string;
  let clienteId: string;

  beforeAll(async () => {
    await limpiar();

    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');

      for (const [id, nit] of [
        [EMPRESA, '900000601'],
        [EMPRESA_AJENA, '900000602'],
      ]) {
        await cliente.query(
          'INSERT INTO "EmpresaAdministrada" ' +
            '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","updatedAt") ' +
            "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin',now())",
          [id, `Empresa ${id}`, nit],
        );
      }

      await cliente.query(
        `INSERT INTO "Rol" ("id","nombre","descripcion")
         VALUES ('e2e_rol_cont','EQUIPO_INTERNO','Acceso según los permisos asignados')
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
          "VALUES ('e2e_usuario_cont','Contadora de prueba',$1,$2,$3,true,false,now()) RETURNING id",
        [EMAIL, hash, rol.rows[0]!.id],
      );

      await cliente.query(
        'INSERT INTO "UsuarioEmpresa" ("id","usuarioId","empresaId") VALUES ($1,$2,$3)',
        ['e2e_cont_acceso', usuario.rows[0]!.id, EMPRESA],
      );
      for (const modulo of ['CONTABILIDAD', 'CLIENTES', 'ADMINISTRACION']) {
        await cliente.query(
          'INSERT INTO "PermisoModulo" ("id","usuarioId","modulo","puedeVer","puedeEditar") ' +
            'VALUES ($1,$2,$3,true,true)',
          [`e2e_cont_permiso_${modulo}`, usuario.rows[0]!.id, modulo],
        );
      }
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

  describe('gastos y soportes', () => {
    it('registra un gasto en dólares con su equivalente en pesos', async () => {
      const respuesta = await post('/gastos', {
        categoria: 'TECNOLOGIA',
        concepto: 'Servidor de la intranet',
        proveedor: 'Proveedor de nube',
        monto: '120.00',
        moneda: 'USD',
        tasaCambio: '4100.00',
        fecha: '2026-03-15',
      }).expect(201);

      gastoId = respuesta.body.id as string;
      expect(respuesta.body.montoCOP).toBe('492000.00');
      expect(respuesta.body.soporte).toBeNull();
    });

    it('exige la tasa cuando el gasto no está en pesos', async () => {
      const respuesta = await post('/gastos', {
        categoria: 'OTRO',
        concepto: 'Sin tasa',
        monto: '100.00',
        moneda: 'USD',
        fecha: '2026-03-15',
      }).expect(400);

      expect(respuesta.body.error.detalles).toHaveProperty('tasaCambio');
    });

    /**
     * La comprobación que de verdad importa del manejo de archivos.
     */
    it('rechaza un archivo cuyo contenido no es lo que dice la extensión', async () => {
      const respuesta = await subir(
        `/gastos/${gastoId}/soporte`,
        Buffer.from('esto no es un pdf, es texto plano'),
        'factura.pdf',
      ).expect(400);

      expect(respuesta.body.error.mensaje).toContain('PDF, JPG o PNG');
    });

    it('acepta un PDF de verdad y lo devuelve al descargarlo', async () => {
      const subida = await subir(`/gastos/${gastoId}/soporte`, PDF, 'factura-marzo.pdf').expect(
        201,
      );

      expect(subida.body.soporte.nombre).toBe('factura-marzo.pdf');
      expect(subida.body.soporte.tipo).toBe('application/pdf');

      const descarga = await get(`/gastos/${gastoId}/soporte`).expect(200);
      expect(descarga.headers['content-type']).toContain('application/pdf');
      expect(descarga.body.length).toBe(PDF.length);
    });

    it('la clave del archivo no sale del servidor', async () => {
      const respuesta = await get(`/gastos/${gastoId}`).expect(200);

      // Solo el nombre y el tipo: con la clave, alguien podría intentar armar una
      // ruta al bucket.
      expect(Object.keys(respuesta.body.soporte)).toEqual(['nombre', 'tipo']);
      expect(JSON.stringify(respuesta.body)).not.toContain(EMPRESA + '/gastos/');
    });

    it('acepta un PNG y reemplaza el soporte anterior', async () => {
      const respuesta = await subir(`/gastos/${gastoId}/soporte`, PNG, 'recibo.png').expect(201);
      expect(respuesta.body.soporte.tipo).toBe('image/png');
    });

    it('el resumen cuenta aparte los gastos sin soporte', async () => {
      await post('/gastos', {
        categoria: 'PAPELERIA',
        concepto: 'Resma de papel',
        monto: '35000.00',
        moneda: 'COP',
        fecha: '2026-03-20',
      }).expect(201);

      const respuesta = await get('/gastos/resumen').expect(200);

      expect(respuesta.body.cantidad).toBe(2);
      expect(respuesta.body.totalCOP).toBe('527000.00');
      // Un gasto sin soporte no es deducible ante la DIAN: hay que poder buscarlos.
      expect(respuesta.body.sinSoporte).toBe(1);
    });

    /**
     * El filtro que devolvia lo contrario de lo pedido.
     *
     * `z.coerce.boolean()` convierte la cadena `'false'` en `true`, asi que
     * `?conSoporte=false` listaba justo los gastos que si tenian soporte. Se prueba
     * por HTTP y no en el esquema porque el error solo existe cuando el valor llega
     * como texto en una URL.
     */
    it('el filtro «sin soporte» devuelve los que no tienen, no los que si', async () => {
      const sinSoporte = await get('/gastos?conSoporte=false').expect(200);
      expect(sinSoporte.body.total).toBe(1);
      expect(sinSoporte.body.datos[0].soporte).toBeNull();

      const conSoporte = await get('/gastos?conSoporte=true').expect(200);
      expect(conSoporte.body.total).toBe(1);
      expect(conSoporte.body.datos[0].soporte).not.toBeNull();
    });

    it('un gasto de otra empresa responde como si no existiera', async () => {
      const ajeno = await comoDueno((cliente) =>
        cliente.query<{ id: string }>(
          `INSERT INTO "Gasto" ("id","empresaId","categoria","concepto","monto","moneda",
             "montoCOP","fecha","updatedAt")
           VALUES ('e2e_gasto_ajeno',$1,'OTRO','Ajeno',100,'COP',100,now(),now())
           RETURNING id`,
          [EMPRESA_AJENA],
        ),
      );

      await get(`/gastos/${ajeno.rows[0]!.id}`).expect(404);
      await get(`/gastos/${ajeno.rows[0]!.id}/soporte`).expect(404);
    });
  });

  describe('calendario tributario', () => {
    it('previsualiza la importación antes de aplicarla', async () => {
      const respuesta = await post('/calendario/previsualizar', {
        anio: ANIO,
        filas: [
          { tipoObligacion: 'RENTA', ultimoDigito: 7, fechaLimite: `${ANIO}-04-15` },
          { tipoObligacion: 'RETENCIONES', ultimoDigito: 7, fechaLimite: `${ANIO}-02-10` },
        ],
      }).expect(200);

      expect(respuesta.body.filas).toBe(2);
      expect(respuesta.body.reemplaza).toBeNull();

      // Previsualizar no escribe: el calendario sigue vacío.
      const fechas = await get(`/calendario?anio=${ANIO}&ultimoDigito=7`).expect(200);
      expect(fechas.body).toHaveLength(0);
    });

    it('importa y devuelve las fechas del último dígito', async () => {
      await post('/calendario/importar', {
        anio: ANIO,
        nota: 'Carga inicial de prueba',
        filas: [
          { tipoObligacion: 'RENTA', ultimoDigito: 7, fechaLimite: `${ANIO}-04-15` },
          { tipoObligacion: 'RENTA', ultimoDigito: 3, fechaLimite: `${ANIO}-04-20` },
          {
            tipoObligacion: 'ICA',
            ultimoDigito: 7,
            codigoDaneMunicipio: '05001',
            fechaLimite: `${ANIO}-05-30`,
          },
          {
            tipoObligacion: 'ICA',
            ultimoDigito: 7,
            codigoDaneMunicipio: '76001',
            fechaLimite: `${ANIO}-06-15`,
          },
        ],
      }).expect(201);

      const respuesta = await get(`/calendario?anio=${ANIO}&ultimoDigito=7`).expect(200);

      // Sin municipio no se puede decidir cuál ICA aplica, así que no aparece ninguno.
      const obligaciones = (respuesta.body as Array<{ tipoObligacion: string }>).map(
        (fila) => fila.tipoObligacion,
      );
      expect(obligaciones).toContain('RENTA');
      expect(obligaciones).not.toContain('ICA');
    });

    it('el ICA solo aparece con el municipio que corresponde', async () => {
      const medellin = await get(
        `/calendario?anio=${ANIO}&ultimoDigito=7&codigoDaneMunicipio=05001`,
      ).expect(200);

      const ica = (medellin.body as Array<{ tipoObligacion: string; fechaLimite: string }>).filter(
        (fila) => fila.tipoObligacion === 'ICA',
      );

      expect(ica).toHaveLength(1);
      expect(ica[0]!.fechaLimite).toContain(`${ANIO}-05-30`);
    });

    it('reimportar versiona en vez de borrar, y se puede volver atrás', async () => {
      const historialAntes = await get(`/calendario/importaciones?anio=${ANIO}`).expect(200);
      const primera = historialAntes.body[0].id as string;

      await post('/calendario/importar', {
        anio: ANIO,
        nota: 'Corrección',
        filas: [{ tipoObligacion: 'RENTA', ultimoDigito: 7, fechaLimite: `${ANIO}-04-25` }],
      }).expect(201);

      const corregido = await get(`/calendario?anio=${ANIO}&ultimoDigito=7`).expect(200);
      expect(corregido.body[0].fechaLimite).toContain(`${ANIO}-04-25`);

      // La anterior sigue ahí, solo que no vigente.
      await post(`/calendario/importaciones/${primera}/restaurar`, {}).expect(201);

      const restaurado = await get(`/calendario?anio=${ANIO}&ultimoDigito=7`).expect(200);
      expect(restaurado.body[0].fechaLimite).toContain(`${ANIO}-04-15`);
    });

    /** El pendiente que arrastrábamos desde la etapa 4. */
    it('la ficha del cliente muestra su calendario sin duplicar la regla', async () => {
      const cliente = await post('/clientes', {
        nombre: 'Comercializadora del Sur',
        tipo: 'PERSONA_JURIDICA',
        tipoDoc: 'NIT',
        numeroDoc: '901458327',
        tipoContribuyente: 'PERSONA_JURIDICA',
        codigoDaneMunicipio: '05001',
      }).expect(201);

      clienteId = cliente.body.id as string;
      expect(cliente.body.ultimoDigitoNit).toBe(7);

      const respuesta = await get(`/clientes/${clienteId}/calendario?anio=${ANIO}`).expect(200);

      const obligaciones = (respuesta.body as Array<{ tipoObligacion: string }>).map(
        (fila) => fila.tipoObligacion,
      );
      expect(obligaciones).toContain('RENTA');
      expect(obligaciones).toContain('ICA');
    });

    it('un cliente sin último dígito no inventa fechas', async () => {
      const persona = await post('/clientes', {
        nombre: 'Persona natural sin NIT',
        tipo: 'PERSONA_NATURAL',
        tipoDoc: 'CC',
        numeroDoc: '1017999888',
      }).expect(201);

      expect(persona.body.ultimoDigitoNit).toBeNull();

      const respuesta = await get(`/clientes/${persona.body.id}/calendario?anio=${ANIO}`).expect(
        200,
      );
      expect(respuesta.body).toHaveLength(0);
    });
  });

  describe('solicitudes de documento', () => {
    let solicitudId: string;

    it('se crea con su plazo', async () => {
      const respuesta = await post('/solicitudes-documento', {
        clienteId,
        documento: 'Certificado de existencia y representación legal',
        fechaLimite: '2030-12-31',
      }).expect(201);

      solicitudId = respuesta.body.id as string;
      expect(respuesta.body.estado).toBe('SOLICITADO');
    });

    it('recibir el documento la cierra', async () => {
      const respuesta = await subir(
        `/solicitudes-documento/${solicitudId}/recibir`,
        PDF,
        'camara-comercio.pdf',
      ).expect(201);

      expect(respuesta.body.estado).toBe('RECIBIDO');
      expect(respuesta.body.recibidoEn).not.toBeNull();

      await get(`/solicitudes-documento/${solicitudId}/archivo`).expect(200);
    });

    it('no se recibe dos veces', async () => {
      const respuesta = await subir(
        `/solicitudes-documento/${solicitudId}/recibir`,
        PDF,
        'otra.pdf',
      ).expect(409);

      expect(respuesta.body.error.mensaje).toContain('ya está recibida');
    });

    /**
     * El vencimiento no se guarda: se deriva de la fecha al leer. Una solicitud
     * vencida a las 00:01 no es distinta de una vencida a las 09:00.
     */
    it('una solicitud con la fecha pasada se lee como vencida', async () => {
      const vencida = await post('/solicitudes-documento', {
        clienteId,
        documento: 'RUT actualizado',
        fechaLimite: '2020-01-31',
      }).expect(201);

      expect(vencida.body.estado).toBe('VENCIDO');

      const filtradas = await get('/solicitudes-documento?estado=VENCIDO').expect(200);
      const ids = (filtradas.body.datos as Array<{ id: string }>).map((fila) => fila.id);
      expect(ids).toContain(vencida.body.id);
    });
  });
});
