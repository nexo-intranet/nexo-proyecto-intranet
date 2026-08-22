import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';

cargarEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Aislamiento por empresa en la capa de PostgreSQL (docs/SEGURIDAD.md §1, capa 3).
 *
 * Estas pruebas NO pasan por la aplicación: se conectan por SQL directo con el rol
 * `nexo_app`, igual que lo haría alguien con la cadena de conexión en la mano. Si
 * el guard y la extensión de Prisma fallaran por completo, esto es lo único que
 * quedaría en pie — y es exactamente lo que se está verificando.
 */

const URL_DUENO = process.env.DIRECT_URL;
const URL_APP = process.env.DATABASE_URL;

const EMPRESA_A = 'rlstest_empresa_a';
const EMPRESA_B = 'rlstest_empresa_b';

/**
 * Tablas que tienen `empresaId` pero deliberadamente **no** llevan RLS.
 *
 * `UsuarioEmpresa` es la que define a qué empresas entra cada quien. Aplicarle la
 * política sería circular: para leer tus propios accesos habría que tener ya una
 * empresa fijada, y la fijación depende justamente de esa lectura. Su control es
 * RBAC en el backend, y está documentada así en docs/SEGURIDAD.md §1.
 *
 * La lista es corta a propósito. Agregar algo aquí es renunciar a una capa de
 * defensa, y tiene que costar una explicación.
 */
const EXCEPCIONES_SIN_RLS = ['UsuarioEmpresa'];

/** Se conecta como dueño del esquema: solo para preparar y limpiar los datos. */
async function comoDueno<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: URL_DUENO });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

/** Se conecta como la aplicación: sin BYPASSRLS y sin ser dueño de nada. */
async function comoApp<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: URL_APP });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

async function crearEmpresa(cliente: Client, id: string, nit: string): Promise<void> {
  await cliente.query(
    'INSERT INTO "EmpresaAdministrada" ' +
      '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","updatedAt") ' +
      "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin',now()) ON CONFLICT (\"id\") DO NOTHING",
    [id, `Empresa de prueba ${id}`, nit],
  );
  await cliente.query(
    'INSERT INTO "Consecutivo" ("id","empresaId","tipo","prefijo","ultimoValor","updatedAt") ' +
      "VALUES ($1,$2,'ORDEN_PAGO','',0,now()) ON CONFLICT (\"id\") DO NOTHING",
    [`${id}_consecutivo`, id],
  );
}

async function limpiar(): Promise<void> {
  await comoDueno(async (cliente) => {
    // El trigger bloquea DELETE sobre AuditLog, así que la limpieza lo desactiva a
    // propósito: es la única forma de borrar, y solo la tiene el dueño del esquema.
    await cliente.query('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_modificar');
    await cliente.query('DELETE FROM "AuditLog" WHERE "entidad" = $1', ['PruebaRls']);
    await cliente.query('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_modificar');
    await cliente.query('DELETE FROM "Consecutivo" WHERE "empresaId" = ANY($1)', [
      [EMPRESA_A, EMPRESA_B],
    ]);
    await cliente.query('DELETE FROM "EmpresaAdministrada" WHERE "id" = ANY($1)', [
      [EMPRESA_A, EMPRESA_B],
    ]);
  });
}

describe('Aislamiento por empresa en PostgreSQL', () => {
  beforeAll(async () => {
    await limpiar();
    await comoDueno(async (cliente) => {
      await crearEmpresa(cliente, EMPRESA_A, '900000001');
      await crearEmpresa(cliente, EMPRESA_B, '900000002');
      await cliente.query(
        'INSERT INTO "AuditLog" ("empresaId","accion","entidad","entidadId") ' +
          "VALUES ($1,'CREAR','PruebaRls','rls')",
        [EMPRESA_A],
      );
    });
  });

  afterAll(limpiar);

  /**
   * Esta es la prueba que más va a durar.
   *
   * No verifica una tabla concreta: le pregunta al catálogo de PostgreSQL cuáles
   * tienen `empresaId` y exige que **todas** lleven RLS habilitada, forzada y con
   * política. Así, la próxima tabla que alguien agregue sin su política falla aquí
   * sin que nadie tenga que acordarse de venir a actualizar el test.
   *
   * Es el ítem del checklist de docs/SEGURIDAD.md §7, automatizado.
   */
  it('toda tabla con empresaId tiene RLS habilitada, forzada y con política', async () => {
    const desprotegidas = await comoDueno((cliente) =>
      cliente.query<{ tabla: string }>(
        `SELECT c.relname AS tabla
           FROM pg_class c
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresaId' AND a.attnum > 0
          WHERE c.relkind = 'r'
            AND c.relnamespace = 'public'::regnamespace
            AND c.relname <> ALL($1::text[])
            AND NOT (c.relrowsecurity AND c.relforcerowsecurity
                     AND (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) > 0)`,
        [EXCEPCIONES_SIN_RLS],
      ),
    );

    // El mensaje nombra las tablas: quien rompa esto tiene que saber cuáles son.
    expect(desprotegidas.rows.map((fila) => fila.tabla)).toEqual([]);
  });

  it('las tablas de negocio con empresaId son las que esperamos', async () => {
    const tablas = await comoDueno((cliente) =>
      cliente.query<{ relname: string }>(
        `SELECT c.relname
           FROM pg_class c
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresaId' AND a.attnum > 0
          WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
          ORDER BY c.relname`,
      ),
    );

    // Si esta lista cambia, es porque se agregó o quitó una tabla de negocio.
    // Actualizarla a conciencia es parte de revisar que su RLS quedó bien.
    expect(tablas.rows.map((fila) => fila.relname)).toEqual([
      'AuditLog',
      'Cliente',
      'Consecutivo',
      'Destinatario',
      'Dispersion',
      'DispersionDestino',
      'Egreso',
      'Operacion',
      'OrdenPago',
      'ReglaDispersion',
      'ReglaDispersionDestino',
      'UsuarioEmpresa',
    ]);
  });

  it('el rol de la aplicación no puede saltarse las políticas', async () => {
    const roles = await comoApp((cliente) =>
      cliente.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
      ),
    );

    expect(roles.rows[0]?.rolsuper).toBe(false);
    expect(roles.rows[0]?.rolbypassrls).toBe(false);
  });

  it('sin empresa fijada no devuelve ninguna fila', async () => {
    const filas = await comoApp((cliente) => cliente.query('SELECT "id" FROM "Consecutivo"'));
    expect(filas.rowCount).toBe(0);
  });

  it('solo ve las filas de la empresa activa', async () => {
    const filas = await comoApp(async (cliente) => {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('app.empresa_id', $1, TRUE)", [EMPRESA_A]);
      const resultado = await cliente.query<{ empresaId: string }>(
        'SELECT "empresaId" FROM "Consecutivo"',
      );
      await cliente.query('COMMIT');
      return resultado;
    });

    expect(filas.rowCount).toBe(1);
    expect(filas.rows[0]?.empresaId).toBe(EMPRESA_A);
  });

  it('buscar por el id de otra empresa devuelve vacío, no la fila', async () => {
    const filas = await comoApp(async (cliente) => {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('app.empresa_id', $1, TRUE)", [EMPRESA_A]);
      const resultado = await cliente.query('SELECT "id" FROM "Consecutivo" WHERE "id" = $1', [
        `${EMPRESA_B}_consecutivo`,
      ]);
      await cliente.query('COMMIT');
      return resultado;
    });

    expect(filas.rowCount).toBe(0);
  });

  it('no puede insertar una fila hacia otra empresa', async () => {
    await expect(
      comoApp(async (cliente) => {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('app.empresa_id', $1, TRUE)", [EMPRESA_A]);
        try {
          await cliente.query(
            'INSERT INTO "Consecutivo" ("id","empresaId","tipo","prefijo","ultimoValor","updatedAt") ' +
              "VALUES ('rlstest_intruso',$1,'FACTURA','',0,now())",
            [EMPRESA_B],
          );
        } finally {
          await cliente.query('ROLLBACK');
        }
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no puede modificar una fila de otra empresa', async () => {
    const resultado = await comoApp(async (cliente) => {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('app.empresa_id', $1, TRUE)", [EMPRESA_A]);
      const actualizado = await cliente.query(
        'UPDATE "Consecutivo" SET "ultimoValor" = 999 WHERE "empresaId" = $1',
        [EMPRESA_B],
      );
      await cliente.query('ROLLBACK');
      return actualizado;
    });

    expect(resultado.rowCount).toBe(0);
  });

  it('el audit log también se lee acotado a la empresa activa', async () => {
    const filas = await comoApp(async (cliente) => {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('app.empresa_id', $1, TRUE)", [EMPRESA_B]);
      const resultado = await cliente.query('SELECT "id" FROM "AuditLog" WHERE "entidad" = $1', [
        'PruebaRls',
      ]);
      await cliente.query('COMMIT');
      return resultado;
    });

    // El registro pertenece a la empresa A: desde la B no existe.
    expect(filas.rowCount).toBe(0);
  });
});

describe('AuditLog append-only', () => {
  beforeAll(async () => {
    await comoDueno(async (cliente) => {
      await crearEmpresa(cliente, EMPRESA_A, '900000001');
      await cliente.query(
        'INSERT INTO "AuditLog" ("empresaId","accion","entidad","entidadId") ' +
          "VALUES ($1,'CREAR','PruebaRls','append')",
        [EMPRESA_A],
      );
    });
  });

  afterAll(limpiar);

  it('rechaza UPDATE incluso desde el dueño del esquema', async () => {
    await expect(
      comoDueno((cliente) =>
        cliente.query('UPDATE "AuditLog" SET "entidad" = $1 WHERE "entidad" = $2', [
          'Alterado',
          'PruebaRls',
        ]),
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it('rechaza DELETE incluso desde el dueño del esquema', async () => {
    await expect(
      comoDueno((cliente) =>
        cliente.query('DELETE FROM "AuditLog" WHERE "entidad" = $1', ['PruebaRls']),
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it('la aplicación no tiene permiso de UPDATE ni DELETE sobre el audit log', async () => {
    const permisos = await comoApp((cliente) =>
      cliente.query<{ puedeActualizar: boolean; puedeBorrar: boolean }>(
        'SELECT has_table_privilege(current_user, \'"AuditLog"\', \'UPDATE\') AS "puedeActualizar", ' +
          'has_table_privilege(current_user, \'"AuditLog"\', \'DELETE\') AS "puedeBorrar"',
      ),
    );

    expect(permisos.rows[0]?.puedeActualizar).toBe(false);
    expect(permisos.rows[0]?.puedeBorrar).toBe(false);
  });

  /**
   * Una orden de pago se anula, no se borra.
   *
   * Anular es un UPDATE que deja la fila con su motivo. Borrarla dejaría un hueco en
   * la serie de consecutivos que nadie sabe explicar, así que el permiso de DELETE
   * simplemente no se otorga: es la base de datos la que lo impide, no una regla que
   * el código tenga que acordarse de respetar.
   */
  it('la aplicación puede anular una orden de pago, pero no borrarla', async () => {
    const permisos = await comoApp((cliente) =>
      cliente.query<{ puedeActualizar: boolean; puedeBorrar: boolean }>(
        'SELECT has_table_privilege(current_user, \'"OrdenPago"\', \'UPDATE\') AS "puedeActualizar", ' +
          'has_table_privilege(current_user, \'"OrdenPago"\', \'DELETE\') AS "puedeBorrar"',
      ),
    );

    expect(permisos.rows[0]?.puedeActualizar).toBe(true);
    expect(permisos.rows[0]?.puedeBorrar).toBe(false);
  });
});
