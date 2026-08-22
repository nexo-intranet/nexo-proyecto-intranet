import { z } from 'zod';
import {
  anulacionEsquema,
  idEsquema,
  paginacionEsquema,
  rangoFechasEsquema,
  textoRequerido,
} from './comunes.js';
import { monedaEsquema, type Moneda } from '../enums/index.js';
import { dineroEsquema, dineroPositivoEsquema } from '../dinero/index.js';

/**
 * Egresos y órdenes de pago.
 *
 * Estrena el patrón que después reusan la nómina y la facturación: un registro
 * operativo que emite un documento legal con consecutivo. El registro se corrige;
 * el documento no — se anula y se emite uno nuevo.
 */

export const TIPOS_INTANGIBLE = [
  'LICENCIA_SOFTWARE',
  'SERVICIO_DIGITAL',
  'DERECHOS',
  'SUSCRIPCION',
  'OTRO',
] as const;
export type TipoIntangible = (typeof TIPOS_INTANGIBLE)[number];
export const tipoIntangibleEsquema = z.enum(TIPOS_INTANGIBLE);

export const ETIQUETA_TIPO_INTANGIBLE: Record<TipoIntangible, string> = {
  LICENCIA_SOFTWARE: 'Licencia de software',
  SERVICIO_DIGITAL: 'Servicio digital',
  DERECHOS: 'Derechos',
  SUSCRIPCION: 'Suscripción',
  OTRO: 'Otro',
};

export const ESTADOS_EGRESO = ['REGISTRADO', 'ANULADO'] as const;
export type EstadoEgreso = (typeof ESTADOS_EGRESO)[number];
export const estadoEgresoEsquema = z.enum(ESTADOS_EGRESO);

export const ETIQUETA_ESTADO_EGRESO: Record<EstadoEgreso, string> = {
  REGISTRADO: 'Registrado',
  ANULADO: 'Anulado',
};

export const ESTADOS_ORDEN_PAGO = ['VIGENTE', 'ANULADA'] as const;
export type EstadoOrdenPago = (typeof ESTADOS_ORDEN_PAGO)[number];
export const estadoOrdenPagoEsquema = z.enum(ESTADOS_ORDEN_PAGO);

export const ETIQUETA_ESTADO_ORDEN_PAGO: Record<EstadoOrdenPago, string> = {
  VIGENTE: 'Vigente',
  ANULADA: 'Anulada',
};

// ── Crear y corregir ────────────────────────────────────────────────────────

const base = z.object({
  concepto: textoRequerido('El concepto', 200),
  tipoIntangible: tipoIntangibleEsquema,
  descripcion: z.string().trim().max(1000).optional(),

  beneficiario: textoRequerido('El beneficiario', 200),
  /** Enlace opcional al catálogo de destinatarios. */
  destinatarioId: idEsquema.optional(),

  monto: dineroPositivoEsquema,
  moneda: monedaEsquema,
  tasaCambio: dineroEsquema.optional(),

  fecha: z.coerce.date(),
});

/**
 * Si el egreso no está en pesos, su tasa es obligatoria.
 *
 * Sin ella no se puede calcular el equivalente en pesos, y guardar un egreso en
 * dólares sin saber a cuánto se pagó lo deja imposible de reconstruir después.
 */
function validarTasa(datos: Partial<z.infer<typeof base>>, ctx: z.RefinementCtx): void {
  if (datos.moneda && datos.moneda !== 'COP' && !datos.tasaCambio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tasaCambio'],
      message: 'Indica la tasa de cambio del día del egreso',
    });
  }
}

export const crearEgresoEsquema = base.superRefine(validarTasa);
export type DatosCrearEgreso = z.infer<typeof base>;

/**
 * Corregir un egreso ya documentado.
 *
 * Exige motivo porque no es una edición cualquiera: anula la orden de pago vigente
 * y emite una nueva con consecutivo nuevo. La corrección es un acto visible en el
 * historial, no un cambio silencioso (brief §4.3).
 */
export const corregirEgresoEsquema = base.partial().extend({
  motivo: textoRequerido('El motivo de la corrección', 500).min(
    10,
    'Explica el motivo con al menos 10 caracteres',
  ),
});
export type DatosCorregirEgreso = z.infer<typeof corregirEgresoEsquema>;

/**
 * Anular.
 *
 * Reusa `anulacionEsquema` de la Etapa 1, que pide motivo **y el consecutivo
 * escrito a mano**. Es lo que separa «me equivoqué de fila» de «quiero anular este
 * documento». El servidor lo compara contra el consecutivo real.
 */
export const anularEgresoEsquema = anulacionEsquema;
export type DatosAnularEgreso = z.infer<typeof anularEgresoEsquema>;

export const reemitirOrdenEsquema = z.object({
  motivo: textoRequerido('El motivo de la reemisión', 500).min(
    10,
    'Explica el motivo con al menos 10 caracteres',
  ),
});
export type DatosReemitirOrden = z.infer<typeof reemitirOrdenEsquema>;

// ── Filtros ─────────────────────────────────────────────────────────────────

export const filtroEgresosEsquema = paginacionEsquema
  .extend({
    estado: estadoEgresoEsquema.optional(),
    tipoIntangible: tipoIntangibleEsquema.optional(),
    moneda: monedaEsquema.optional(),
    destinatarioId: idEsquema.optional(),
  })
  .and(rangoFechasEsquema);
export type FiltroEgresos = z.infer<typeof filtroEgresosEsquema>;

export const filtroOrdenesEsquema = paginacionEsquema
  .extend({ estado: estadoOrdenPagoEsquema.optional() })
  .and(rangoFechasEsquema);

export const resumenEgresosEsquema = rangoFechasEsquema;

// ── Lo que devuelve la API ──────────────────────────────────────────────────

export interface OrdenPagoResumen {
  id: string;
  consecutivo: string;
  numero: number;
  estado: EstadoOrdenPago;
  emitidaEn: string;
  emitidaPor: { id: string; nombre: string } | null;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  /** Si reemplaza a una anulada, su consecutivo. Encadena el historial. */
  reemplazaA: string | null;
}

export interface EgresoResumen {
  id: string;
  concepto: string;
  tipoIntangible: TipoIntangible;
  beneficiario: string;
  monto: string;
  moneda: Moneda;
  montoCOP: string;
  fecha: string;
  estado: EstadoEgreso;
  /** La orden vigente, si la hay. Evita una segunda consulta desde la tabla. */
  ordenVigente: { id: string; consecutivo: string } | null;
}

export interface EgresoDetalle extends EgresoResumen {
  descripcion: string | null;
  tasaCambio: string | null;
  destinatarioId: string | null;
  motivoAnulacion: string | null;
  anuladoEn: string | null;
  createdAt: string;
  /** Todas sus órdenes, la vigente y las anuladas, de la más nueva a la más vieja. */
  ordenes: OrdenPagoResumen[];
}

/** Lo que se congela al emitir. El PDF se regenera desde aquí. */
export interface ContenidoOrdenPago {
  emisor: {
    nombre: string;
    nit: string;
    digitoVerificacion: number;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    municipio: string;
  };
  beneficiario: string;
  concepto: string;
  tipoIntangible: TipoIntangible;
  descripcion: string | null;
  monto: string;
  moneda: Moneda;
  tasaCambio: string | null;
  montoCOP: string;
  fechaEgreso: string;
}

export interface OrdenPagoDetalle extends OrdenPagoResumen {
  egresoId: string;
  contenido: ContenidoOrdenPago;
  hashArchivo: string | null;
}

export interface ResumenEgresos {
  cantidad: number;
  totalCOP: string;
  porTipo: Array<{ tipo: TipoIntangible; cantidad: number; totalCOP: string }>;
  /** Separado por moneda: sumar dólares con pesos no significa nada. */
  volumenPorMoneda: Array<{ moneda: Moneda; total: string }>;
}
