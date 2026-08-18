import { Prisma } from '@prisma/client';
import type { ContextoService } from '../../context/contexto.service';
import { SinEmpresaEnContextoError } from '../../context/contexto.service';

/**
 * Aislamiento por empresa en la capa de datos (docs/SEGURIDAD.md §1).
 *
 * Hace dos cosas en cada operación de Prisma:
 *
 *   1. Inyecta `empresaId` en el `where` o en el `data`, para que un endpoint que
 *      olvide filtrar siga acotado a la empresa activa.
 *   2. Fija `app.empresa_id` con `SET LOCAL`, que es la variable que leen las
 *      políticas de Row Level Security en PostgreSQL.
 *
 * Si no hay empresa en el contexto, lanza excepción en vez de consultar sin filtro:
 * preferimos un error ruidoso a una consulta silenciosa que devuelva datos de más.
 *
 * Nota sobre `findUnique`, `update` y `delete`: desde Prisma 5 el `WhereUniqueInput`
 * es `AtLeast<{...todos los campos...}, "id">`, así que admite `empresaId` como
 * filtro adicional junto a la clave única. Buscar por el id de otra empresa devuelve
 * null en vez del registro.
 */

/**
 * Modelos que NO cuelgan de una empresa. Es una lista explícita y corta a propósito:
 * un modelo nuevo que no aparezca aquí y no tenga `empresaId` hará fallar sus
 * consultas, obligando a una decisión consciente en vez de a un olvido silencioso.
 */
export const MODELOS_SIN_EMPRESA: ReadonlySet<string> = new Set([
  'EmpresaAdministrada',
  'Usuario',
  'Rol',
  'PermisoModulo',
  'UsuarioEmpresa',
  'SesionRefresh',
  'CodigoRespaldo',
]);

/** Operaciones cuyo `where` filtra las filas afectadas. */
const OPERACIONES_CON_WHERE = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Operaciones que escriben filas nuevas y necesitan el `empresaId` en `data`. */
const OPERACIONES_DE_CREACION = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * Ejecutor mínimo que necesita la extensión para fijar la variable de sesión.
 * Se tipa aparte para evitar la inferencia circular con el cliente extendido.
 */
export interface EjecutorRls {
  $transaction: (operaciones: unknown[]) => Promise<unknown[]>;
  $executeRaw: (sql: TemplateStringsArray, ...valores: unknown[]) => unknown;
}

type Args = Record<string, unknown>;

function conEmpresaEnWhere(args: Args, empresaId: string): Args {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return { ...args, where: { ...where, empresaId } };
}

function conEmpresaEnData(args: Args, empresaId: string): Args {
  const data = args.data;
  if (Array.isArray(data)) {
    return { ...args, data: data.map((fila) => ({ ...(fila as object), empresaId })) };
  }
  return { ...args, data: { ...((data ?? {}) as object), empresaId } };
}

export function crearExtensionAislamiento(
  contexto: ContextoService,
  obtenerEjecutor: () => EjecutorRls | null,
) {
  return Prisma.defineExtension({
    name: 'aislamiento-empresa',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (MODELOS_SIN_EMPRESA.has(model)) {
            return query(args);
          }

          const empresaId = contexto.empresaId();
          let argumentos = (args ?? {}) as Args;

          // El audit log registra también lo que pasa antes de elegir empresa
          // (ingreso, ingreso fallido, salida), así que escribir sin empresa es
          // válido. Leerlo, en cambio, siempre va acotado a la empresa activa.
          const esEscrituraDeAuditoria =
            model === 'AuditLog' && OPERACIONES_DE_CREACION.has(operation);

          if (!empresaId && !esEscrituraDeAuditoria) {
            throw new SinEmpresaEnContextoError(`${model}.${operation}`);
          }

          if (empresaId) {
            if (OPERACIONES_DE_CREACION.has(operation)) {
              argumentos = conEmpresaEnData(argumentos, empresaId);
            } else if (operation === 'upsert') {
              argumentos = conEmpresaEnWhere(argumentos, empresaId);
              argumentos = {
                ...argumentos,
                create: { ...((argumentos.create ?? {}) as object), empresaId },
              };
            } else if (OPERACIONES_CON_WHERE.has(operation)) {
              argumentos = conEmpresaEnWhere(argumentos, empresaId);
            }
          }

          const ejecutor = obtenerEjecutor();

          // Si ya hay una transacción abierta, la variable de sesión se fijó al
          // abrirla: volver a envolver aquí abriría una transacción anidada.
          if (!empresaId || !ejecutor || contexto.dentroDeTransaccion()) {
            return query(argumentos);
          }

          // `set_config(..., TRUE)` equivale a SET LOCAL: vive solo dentro de esta
          // transacción, así que es seguro con pool de conexiones y con PgBouncer.
          const [, resultado] = await ejecutor.$transaction([
            ejecutor.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, TRUE)`,
            query(argumentos),
          ]);

          return resultado;
        },
      },
    },
  });
}
