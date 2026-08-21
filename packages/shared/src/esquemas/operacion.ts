import { z } from 'zod';
import { idEsquema, paginacionEsquema, rangoFechasEsquema, textoRequerido } from './comunes.js';
import { monedaEsquema, type Moneda } from '../enums/index.js';
import { dineroEsquema, dineroPositivoEsquema } from '../dinero/index.js';
import { MIN_PREFIJO_HASH, normalizarHash } from '../operaciones/index.js';

export const ESTADOS_OPERACION = ['BORRADOR', 'REGISTRADA', 'CONCILIADA', 'ANULADA'] as const;
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];
export const estadoOperacionEsquema = z.enum(ESTADOS_OPERACION);

export const ETIQUETA_ESTADO_OPERACION: Record<EstadoOperacion, string> = {
  BORRADOR: 'Borrador',
  REGISTRADA: 'Registrada',
  CONCILIADA: 'Conciliada',
  ANULADA: 'Anulada',
};

export const REDES = ['BITCOIN', 'ETHEREUM', 'TRON', 'BSC', 'POLYGON', 'SOLANA', 'OTRA'] as const;
export type RedBlockchain = (typeof REDES)[number];
export const redEsquema = z.enum(REDES);

export const ETIQUETA_RED: Record<RedBlockchain, string> = {
  BITCOIN: 'Bitcoin',
  ETHEREUM: 'Ethereum',
  TRON: 'Tron',
  BSC: 'BNB Smart Chain',
  POLYGON: 'Polygon',
  SOLANA: 'Solana',
  OTRA: 'Otra',
};

const hashEsquema = z
  .string()
  .trim()
  .transform(normalizarHash)
  .refine((valor) => valor.length === 0 || valor.length >= MIN_PREFIJO_HASH, {
    message: `El hash debe tener al menos ${MIN_PREFIJO_HASH} caracteres`,
  })
  .transform((valor) => (valor.length === 0 ? undefined : valor))
  .optional();

/** Cantidad de cripto: hasta 18 decimales, sin notación científica. */
const cantidadEsquema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,18})?$/, 'La cantidad debe ser un número con hasta 18 decimales');

const base = z.object({
  clienteId: idEsquema,
  hash: hashEsquema,
  red: redEsquema.optional(),

  // TODO [CONFIRMAR] Opcionales hasta que el cliente confirme si registra la
  // cantidad de cripto o solo los valores en pesos.
  cantidad: cantidadEsquema.optional(),
  monedaActivo: monedaEsquema.optional(),

  valorCompra: dineroPositivoEsquema,
  monedaCompra: monedaEsquema,
  tasaCompra: dineroEsquema.optional(),

  valorVenta: dineroPositivoEsquema,
  monedaVenta: monedaEsquema,
  tasaVenta: dineroEsquema.optional(),

  fechaOperacion: z.coerce.date(),
  observaciones: z.string().trim().max(1000).optional(),
  estado: z.enum(['BORRADOR', 'REGISTRADA']).default('REGISTRADA'),
});

/**
 * Si un lado no está en pesos, su tasa es obligatoria.
 *
 * Sin ella no se puede calcular la ganancia, y dejarla pasar significaría guardar
 * una operación cuyo resultado nadie puede reconstruir después. La misma regla
 * corre en creación y en edición, por eso está escrita una sola vez.
 */
function validarLados(datos: Partial<z.infer<typeof base>>, ctx: z.RefinementCtx): void {
  const falta = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (datos.monedaCompra && datos.monedaCompra !== 'COP' && !datos.tasaCompra) {
    falta('tasaCompra', 'Indica la tasa de cambio de la compra');
  }
  if (datos.monedaVenta && datos.monedaVenta !== 'COP' && !datos.tasaVenta) {
    falta('tasaVenta', 'Indica la tasa de cambio de la venta');
  }
  if (datos.cantidad && !datos.monedaActivo) {
    falta('monedaActivo', 'Indica de qué activo es esa cantidad');
  }
}

export const crearOperacionEsquema = base.superRefine(validarLados);
export type DatosCrearOperacion = z.infer<typeof base>;

export const actualizarOperacionEsquema = base
  .omit({ estado: true })
  .partial()
  .superRefine(validarLados);
export type DatosActualizarOperacion = z.infer<typeof actualizarOperacionEsquema>;

/**
 * Anulación de una operación.
 *
 * Sin confirmación escrita del consecutivo, a diferencia de los documentos
 * legales: una operación no lleva consecutivo. El motivo sí es obligatorio, y
 * queda en el audit log.
 */
export const anularOperacionEsquema = z.object({
  motivo: textoRequerido('El motivo', 500).min(10, 'Explica el motivo con al menos 10 caracteres'),
});
export type DatosAnularOperacion = z.infer<typeof anularOperacionEsquema>;

export const filtroOperacionesEsquema = paginacionEsquema
  .extend({
    clienteId: idEsquema.optional(),
    estado: estadoOperacionEsquema.optional(),
    moneda: monedaEsquema.optional(),
  })
  .and(rangoFechasEsquema);
export type FiltroOperaciones = z.infer<typeof filtroOperacionesEsquema>;

export const buscarPorHashEsquema = z.object({
  hash: z
    .string()
    .trim()
    .min(MIN_PREFIJO_HASH, `Escribe al menos ${MIN_PREFIJO_HASH} caracteres del hash`)
    .transform(normalizarHash),
});

export interface OperacionResumen {
  id: string;
  hash: string | null;
  red: RedBlockchain | null;
  cliente: { id: string; nombre: string };
  cantidad: string | null;
  monedaActivo: Moneda | null;
  valorCompra: string;
  monedaCompra: Moneda;
  valorVenta: string;
  monedaVenta: Moneda;
  gananciaCOP: string;
  estado: EstadoOperacion;
  fechaOperacion: string;
  /** Estado de su dispersión, si tiene. Evita una segunda consulta desde la tabla. */
  dispersion: { id: string; estado: string } | null;
}

export interface OperacionDetalle extends OperacionResumen {
  tasaCompra: string | null;
  tasaVenta: string | null;
  observaciones: string | null;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  createdAt: string;
}

/**
 * Totales del período para el tablero.
 *
 * Las operaciones anuladas no suman: siguen ahí, con su motivo, pero no cuentan
 * para ningún reporte. Sumarlas sería inflar el resultado con plata que no se movió.
 */
export const resumenOperacionesEsquema = rangoFechasEsquema;

export interface ResumenOperaciones {
  cantidad: number;
  /** Lo único ya convertido a pesos, y por eso lo único sumable entre operaciones. */
  gananciaCOP: string;
  /** Cuántas hay en cada estado, para las pastillas del tablero. */
  porEstado: Record<EstadoOperacion, number>;
  /**
   * Volumen movido, separado por moneda.
   *
   * No se suma en pesos: `valorCompra` está en la moneda de cada operación, y
   * sumar dólares con pesos daría un número que no significa nada.
   */
  volumenPorMoneda: { moneda: Moneda; compra: string; venta: string }[];
  /** Dispersiones que todavía tienen giros pendientes. */
  dispersionesPendientes: number;
}
