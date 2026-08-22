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
 * Etapa 2 de punta a punta: operación, ganancia y dispersión.
 *
 * Levanta la aplicación completa y entra por la puerta real. Lo que se verifica no
 * son los endpoints uno por uno, sino las cuatro reglas que el brief pone por
 * encima de todo lo demás:
 *
 *   - la ganancia se calcula con las tasas del momento y **queda guardada**;
 *   - el buscador por hash encuentra por prefijo, y solo dentro de la empresa;
 *   - una dispersión que no cuadre al centavo no se guarda;
 *   - una operación conciliada ya no se edita, y una con giros hechos no se anula.
 */

const EMPRESA = 'e2e_ops_empresa';
const EMPRESA_AJENA = 'e2e_ops_ajena';
const EMAIL = 'e2e.operaciones@nexoadministracion.com';
const PASSWORD = `Prueba${randomBytes(12).toString('base64url')}Aa1`;

/** Hash real en forma, inventado en contenido. El prefijo es lo que se busca. */
const HASH = '0x7c19ab4d2e5f8a0b3c6d9e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b';
const HASH_AJENO = '0x7c19ab4dffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

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

    // De las hojas hacia la raíz: cada tabla cuelga de la anterior.
    for (const tabla of [
      'DispersionDestino',
      'Dispersion',
      'ReglaDispersionDestino',
      'ReglaDispersion',
      'Destinatario',
      'Operacion',
      'Cliente',
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

describe('Operaciones y dispersión, de punta a punta', () => {
  let app: INestApplication;
  let cookies: string[];
  let csrf: string;

  /** Petición autenticada sobre la empresa de la prueba. */
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

  let clienteId: string;
  let operacionId: string;
  let destinoAId: string;
  let destinoBId: string;

  beforeAll(async () => {
    await limpiar();

    await comoDueno(async (cliente) => {
      const argon2 = await import('argon2');

      for (const [id, nit] of [
        [EMPRESA, '900000301'],
        [EMPRESA_AJENA, '900000302'],
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
         VALUES ('e2e_rol_ops','EQUIPO_INTERNO','Acceso según los permisos asignados')
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
          "VALUES ('e2e_usuario_ops','Operador de prueba',$1,$2,$3,true,false,now()) RETURNING id",
        [EMAIL, hash, rol.rows[0]!.id],
      );
      const usuarioId = usuario.rows[0]!.id;

      // Acceso a una sola empresa. La otra existe justamente para no poder verla.
      await cliente.query(
        'INSERT INTO "UsuarioEmpresa" ("id","usuarioId","empresaId") VALUES ($1,$2,$3)',
        ['e2e_ops_acceso', usuarioId, EMPRESA],
      );
      for (const modulo of ['OPERACIONES', 'CLIENTES']) {
        await cliente.query(
          'INSERT INTO "PermisoModulo" ("id","usuarioId","modulo","puedeVer","puedeEditar") ' +
            'VALUES ($1,$2,$3,true,true)',
          [`e2e_ops_permiso_${modulo}`, usuarioId, modulo],
        );
      }

      // Una operación de la empresa ajena, con un hash que comparte prefijo con la
      // nuestra: si el aislamiento fallara, el buscador la devolvería.
      await cliente.query(
        'INSERT INTO "Cliente" ("id","empresaId","nombre","tipo","tipoDoc",' +
          '"numeroDocCifrado","numeroDocHash","numeroDocFinal","updatedAt") ' +
          "VALUES ('e2e_cliente_ajeno',$1,'Cliente ajeno','PERSONA_NATURAL','CC','x','hash_ajeno','9999',now())",
        [EMPRESA_AJENA],
      );
      await cliente.query(
        'INSERT INTO "Operacion" ("id","empresaId","clienteId","hash","valorCompra","monedaCompra",' +
          '"valorVenta","monedaVenta","gananciaCOP","estado","fechaOperacion","updatedAt") ' +
          "VALUES ('e2e_op_ajena',$1,'e2e_cliente_ajeno',$2,100,'COP',200,'COP',100,'REGISTRADA',now(),now())",
        [EMPRESA_AJENA, HASH_AJENO],
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

  it('crea un cliente y no devuelve el documento completo', async () => {
    const respuesta = await post('/clientes', {
      nombre: 'Comercializadora del Poblado',
      tipo: 'PERSONA_JURIDICA',
      tipoDoc: 'NIT',
      numeroDoc: '901458327',
      municipio: 'Medellín',
    }).expect(201);

    clienteId = respuesta.body.id as string;
    expect(respuesta.body.numeroDocFinal).toBe('8327');
    expect(JSON.stringify(respuesta.body)).not.toContain('901458327');
    // El último dígito del NIT ordena el calendario tributario de la Etapa 6.
    expect(respuesta.body.ultimoDigitoNit).toBe(7);
  });

  it('encuentra al cliente por su documento, comparando el HMAC', async () => {
    const respuesta = await get('/clientes/buscar?documento=901458327').expect(200);
    expect(respuesta.body.id).toBe(clienteId);

    // Un documento que no existe responde 404, no una lista vacía.
    await get('/clientes/buscar?documento=999999999').expect(404);
  });

  it('registra una operación y guarda la ganancia calculada con sus tasas', async () => {
    // 1.000 USDT comprados a 4.000 y vendidos a 4.200: 200.000 de ganancia.
    const respuesta = await post('/operaciones', {
      clienteId,
      hash: HASH,
      red: 'TRON',
      cantidad: '1000',
      monedaActivo: 'USDT',
      valorCompra: '1000.00',
      monedaCompra: 'USDT',
      tasaCompra: '4000.00',
      valorVenta: '1000.00',
      monedaVenta: 'USDT',
      tasaVenta: '4200.00',
      fechaOperacion: new Date().toISOString(),
    }).expect(201);

    operacionId = respuesta.body.id as string;
    expect(respuesta.body.gananciaCOP).toBe('200000.00');
    expect(respuesta.body.estado).toBe('REGISTRADA');
  });

  it('el dinero viaja como texto, nunca como número', async () => {
    const respuesta = await get(`/operaciones/${operacionId}`).expect(200);
    expect(typeof respuesta.body.gananciaCOP).toBe('string');
    expect(typeof respuesta.body.valorCompra).toBe('string');
  });

  it('rechaza una moneda distinta de peso sin su tasa', async () => {
    const respuesta = await post('/operaciones', {
      clienteId,
      valorCompra: '1000.00',
      monedaCompra: 'USDT',
      valorVenta: '4200000.00',
      monedaVenta: 'COP',
      fechaOperacion: new Date().toISOString(),
    }).expect(400);

    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(respuesta.body.error.detalles).toHaveProperty('tasaCompra');
  });

  it('no admite el mismo hash dos veces en la empresa', async () => {
    const respuesta = await post('/operaciones', {
      clienteId,
      hash: HASH,
      valorCompra: '100.00',
      monedaCompra: 'COP',
      valorVenta: '200.00',
      monedaVenta: 'COP',
      fechaOperacion: new Date().toISOString(),
    }).expect(409);

    expect(respuesta.body.error.codigo).toBe('CONFLICTO');
  });

  it('el buscador encuentra por prefijo del hash', async () => {
    const respuesta = await get(`/operaciones/buscar?hash=${HASH.slice(0, 12)}`).expect(200);

    const ids = (respuesta.body as Array<{ id: string }>).map((fila) => fila.id);
    expect(ids).toContain(operacionId);
  });

  it('el buscador no cruza la frontera de la empresa', async () => {
    // El prefijo lo comparten las dos operaciones; solo la propia debe aparecer.
    const respuesta = await get('/operaciones/buscar?hash=0x7c19ab4d').expect(200);

    const ids = (respuesta.body as Array<{ id: string }>).map((fila) => fila.id);
    expect(ids).toContain(operacionId);
    expect(ids).not.toContain('e2e_op_ajena');
  });

  it('forzar el id de una operación ajena responde como si no existiera', async () => {
    const respuesta = await get('/operaciones/e2e_op_ajena').expect(404);
    expect(respuesta.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un prefijo demasiado corto no se acepta', async () => {
    await get('/operaciones/buscar?hash=0x7c').expect(400);
  });

  describe('dispersión', () => {
    let reglaId: string;
    let dispersionId: string;
    let destinoCId: string;

    beforeAll(async () => {
      const creados: string[] = [];

      for (const [nombre, doc, cuenta] of [
        ['Socio A', '1017234567', '98765431'],
        ['Socio B', '1017234568', '98765432'],
        ['Socio C', '1017234569', '98765433'],
      ]) {
        const respuesta = await post('/destinatarios', {
          nombre,
          tipoDoc: 'CC',
          numeroDoc: doc,
          banco: 'Bancolombia',
          tipoCuenta: 'AHORROS',
          cuenta,
        }).expect(201);

        creados.push(respuesta.body.id as string);
      }

      [destinoAId, destinoBId, destinoCId] = creados as [string, string, string];
    });

    it('el catálogo no devuelve la cuenta completa', async () => {
      const respuesta = await get('/destinatarios').expect(200);
      const socio = (respuesta.body.datos as Array<{ nombre: string; cuentaFinal: string }>).find(
        (fila) => fila.nombre === 'Socio A',
      );

      expect(socio?.cuentaFinal).toHaveLength(4);
      expect(JSON.stringify(respuesta.body)).not.toContain('9876543');
    });

    it('rechaza una regla de porcentajes que no sume 100', async () => {
      const respuesta = await post('/reglas-dispersion', {
        nombre: 'Regla mal armada',
        tipoReparto: 'PORCENTAJE',
        destinos: [
          { destinatarioId: destinoAId, porcentaje: '40', orden: 0 },
          { destinatarioId: destinoBId, porcentaje: '40', orden: 1 },
        ],
      }).expect(409);

      expect(respuesta.body.error.mensaje).toContain('100');
    });

    it('guarda una regla de tres tercios', async () => {
      const respuesta = await post('/reglas-dispersion', {
        nombre: 'Reparto entre socios',
        tipoReparto: 'PORCENTAJE',
        destinos: [
          { destinatarioId: destinoAId, porcentaje: '33.3333', orden: 0 },
          { destinatarioId: destinoBId, porcentaje: '33.3333', orden: 1 },
          { destinatarioId: destinoCId, porcentaje: '33.3334', orden: 2 },
        ],
      }).expect(201);

      reglaId = respuesta.body.id as string;
      expect(respuesta.body.destinos).toHaveLength(3);
    });

    it('previsualiza el reparto y el residuo cae en el destino de mayor orden', async () => {
      const respuesta = await post(`/operaciones/${operacionId}/dispersion/previsualizar`, {
        reglaId,
      }).expect(201);

      expect(respuesta.body.cuadra).toBe(true);
      expect(respuesta.body.total).toBe('200000.00');

      const montos = (respuesta.body.destinos as Array<{ monto: string }>).map(
        (destino) => destino.monto,
      );
      const suma = montos.reduce((acumulado, monto) => acumulado + Number(monto), 0);
      expect(suma).toBeCloseTo(200000, 2);

      const ultimo = respuesta.body.destinos.at(-1);
      expect(Number(ultimo.ajuste)).toBeGreaterThanOrEqual(0);
    });

    it('no guarda un reparto a mano que no cuadre', async () => {
      const respuesta = await post(`/operaciones/${operacionId}/dispersion`, {
        destinos: [
          { destinatarioId: destinoAId, monto: '100000.00', orden: 0 },
          { destinatarioId: destinoBId, monto: '50000.00', orden: 1 },
        ],
      }).expect(409);

      expect(respuesta.body.error.codigo).toBe('CONFLICTO');
      expect(respuesta.body.error.mensaje).toContain('no cuadra');
    });

    it('guarda la dispersión por regla', async () => {
      const respuesta = await post(`/operaciones/${operacionId}/dispersion`, { reglaId }).expect(
        201,
      );

      dispersionId = respuesta.body.id as string;
      expect(respuesta.body.estado).toBe('PENDIENTE');
      expect(respuesta.body.diferencia).toBe('0.00');
      expect(respuesta.body.destinos).toHaveLength(3);
      // El histórico guarda su propia copia, y de la cuenta solo los cuatro finales.
      expect(respuesta.body.destinos[0].nombreSnapshot).toBe('Socio A');
      expect(respuesta.body.destinos[0].cuentaSnapshot).toHaveLength(4);
    });

    it('una operación no admite dos dispersiones', async () => {
      await post(`/operaciones/${operacionId}/dispersion`, { reglaId }).expect(409);
    });

    it('ejecutar un giro deja la dispersión parcial', async () => {
      const dispersion = await get(`/dispersiones/${dispersionId}`).expect(200);
      const primero = dispersion.body.destinos[0].id as string;

      const respuesta = await post(`/dispersiones/${dispersionId}/destinos/${primero}/ejecutar`, {
        referenciaPago: 'TRF-00012',
      }).expect(201);

      expect(respuesta.body.estado).toBe('PARCIAL');
    });

    it('un giro de otra dispersión no se puede tocar desde esta ruta', async () => {
      const dispersion = await get(`/dispersiones/${dispersionId}`).expect(200);
      const giro = dispersion.body.destinos[1].id as string;

      await post(`/dispersiones/${operacionId}/destinos/${giro}/ejecutar`, {
        referenciaPago: 'TRF-00013',
      }).expect(404);
    });

    it('con todos los giros hechos, la operación queda conciliada', async () => {
      const dispersion = await get(`/dispersiones/${dispersionId}`).expect(200);

      for (const destino of dispersion.body.destinos as Array<{ id: string; estado: string }>) {
        if (destino.estado === 'EJECUTADO') continue;
        await post(`/dispersiones/${dispersionId}/destinos/${destino.id}/ejecutar`, {
          referenciaPago: `TRF-${destino.id.slice(-5)}`,
        }).expect(201);
      }

      const final = await get(`/dispersiones/${dispersionId}`).expect(200);
      expect(final.body.estado).toBe('EJECUTADA');

      const operacion = await get(`/operaciones/${operacionId}`).expect(200);
      expect(operacion.body.estado).toBe('CONCILIADA');
    });

    it('el resumen del período no cuenta dos veces ni suma monedas distintas', async () => {
      const respuesta = await get('/operaciones/resumen').expect(200);

      expect(respuesta.body.cantidad).toBe(1);
      expect(respuesta.body.gananciaCOP).toBe('200000.00');
      expect(respuesta.body.porEstado.CONCILIADA).toBe(1);
      expect(respuesta.body.volumenPorMoneda).toEqual([
        { moneda: 'USDT', compra: '1000.00', venta: '1000.00' },
      ]);
      expect(respuesta.body.dispersionesPendientes).toBe(0);
    });

    it('devolver un giro reabre la operación', async () => {
      const dispersion = await get(`/dispersiones/${dispersionId}`).expect(200);
      const giro = dispersion.body.destinos[0].id as string;

      const respuesta = await post(`/dispersiones/${dispersionId}/destinos/${giro}/revertir`, {
        motivo: 'La cuenta destino estaba cerrada y el banco devolvió el giro',
      }).expect(201);

      expect(respuesta.body.estado).toBe('PARCIAL');

      const operacion = await get(`/operaciones/${operacionId}`).expect(200);
      expect(operacion.body.estado).toBe('REGISTRADA');

      // Y se puede volver a ejecutar: conciliar no es de una sola dirección.
      await post(`/dispersiones/${dispersionId}/destinos/${giro}/ejecutar`, {
        referenciaPago: 'TRF-00012-B',
      }).expect(201);

      const reconciliada = await get(`/operaciones/${operacionId}`).expect(200);
      expect(reconciliada.body.estado).toBe('CONCILIADA');
    });

    it('no se rehace el reparto de una dispersión que ya tiene giros', async () => {
      const respuesta = await patch(`/dispersiones/${dispersionId}`, {
        destinos: [{ destinatarioId: destinoAId, monto: '200000.00', orden: 0 }],
      }).expect(409);

      expect(respuesta.body.error.mensaje).toContain('Devuélvelos');
    });

    it('una operación conciliada ya no se edita', async () => {
      const respuesta = await patch(`/operaciones/${operacionId}`, {
        observaciones: 'Intento de edición tardía',
      }).expect(409);

      expect(respuesta.body.error.mensaje).toContain('conciliada');
    });

    it('tampoco se anula si ya se giró la plata', async () => {
      const respuesta = await post(`/operaciones/${operacionId}/anular`, {
        motivo: 'Se registró con el cliente equivocado',
      }).expect(409);

      expect(respuesta.body.error.mensaje).toContain('ejecutados');
    });
    /**
     * El formulario deja fuera los campos opcionales que la persona no llenó, en vez
     * de mandarlos como cadena vacía. Esta prueba fija ese contrato: si algún día el
     * esquema deja de aceptar la ausencia de `hash`, `red` o `cantidad`, se entera
     * aquí y no en producción con un formulario que se niega a enviarse.
     */
    it('acepta una operación con solo lo obligatorio', async () => {
      const respuesta = await post('/operaciones', {
        clienteId,
        valorCompra: '500000.00',
        monedaCompra: 'COP',
        valorVenta: '650000.00',
        monedaVenta: 'COP',
        fechaOperacion: new Date().toISOString(),
        estado: 'REGISTRADA',
      }).expect(201);

      expect(respuesta.body.gananciaCOP).toBe('150000.00');
      expect(respuesta.body.hash).toBeNull();
      expect(respuesta.body.red).toBeNull();
      expect(respuesta.body.dispersion).toBeNull();
    });

    /**
     * El formulario de reglas manda `porcentaje` u `montoFijo`, nunca los dos, y
     * omite el que no aplica en vez de mandarlo vacío. Nada probaba el camino de
     * monto fijo hasta ahora.
     */
    it('guarda una regla por monto fijo sin porcentajes', async () => {
      const respuesta = await post('/reglas-dispersion', {
        nombre: 'Comisión fija del gestor',
        tipoReparto: 'MONTO_FIJO',
        activa: true,
        destinos: [
          { destinatarioId: destinoAId, montoFijo: '150000.00', orden: 0 },
          { destinatarioId: destinoBId, montoFijo: '50000.00', orden: 1 },
        ],
      }).expect(201);

      expect(respuesta.body.tipoReparto).toBe('MONTO_FIJO');
      expect(respuesta.body.destinos).toHaveLength(2);
      expect(respuesta.body.destinos[0].montoFijo).toBe('150000.00');
      expect(respuesta.body.destinos[0].porcentaje).toBeNull();
    });
  });
});
