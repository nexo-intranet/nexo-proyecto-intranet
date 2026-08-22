import { z } from 'zod';
import {
  anulacionEsquema,
  booleanoEsquema,
  emailEsquema,
  idEsquema,
  paginacionEsquema,
  rangoFechasEsquema,
  textoRequerido,
} from './comunes.js';
import { monedaEsquema, tipoDocumentoEsquema, type Moneda } from '../enums/index.js';
import { dineroEsquema, dineroPositivoEsquema } from '../dinero/index.js';
import { numeroDocumentoEsquema } from './cliente.js';
import type { TipoConcepto } from '../nomina/index.js';

// ── Empleado ────────────────────────────────────────────────────────────────

export const TIPOS_CONTRATO = [
  'INDEFINIDO',
  'FIJO',
  'OBRA_LABOR',
  'PRESTACION_SERVICIOS',
  'APRENDIZAJE',
] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];
export const tipoContratoEsquema = z.enum(TIPOS_CONTRATO);

export const ETIQUETA_TIPO_CONTRATO: Record<TipoContrato, string> = {
  INDEFINIDO: 'Término indefinido',
  FIJO: 'Término fijo',
  OBRA_LABOR: 'Obra o labor',
  PRESTACION_SERVICIOS: 'Prestación de servicios',
  APRENDIZAJE: 'Aprendizaje',
};

export const crearEmpleadoEsquema = z
  .object({
    nombre: textoRequerido('El nombre', 200),
    tipoDoc: tipoDocumentoEsquema,
    numeroDoc: numeroDocumentoEsquema,

    cargo: textoRequerido('El cargo', 120),
    salarioBase: dineroPositivoEsquema,
    moneda: monedaEsquema.default('COP'),
    tipoContrato: tipoContratoEsquema.default('INDEFINIDO'),

    fechaIngreso: z.coerce.date(),
    fechaRetiro: z.coerce.date().optional(),

    email: emailEsquema.optional(),
    telefono: z.string().trim().max(40).optional(),
    direccion: z.string().trim().max(200).optional(),
  })
  .refine((datos) => !datos.fechaRetiro || datos.fechaRetiro >= datos.fechaIngreso, {
    message: 'La fecha de retiro no puede ser anterior a la de ingreso',
    path: ['fechaRetiro'],
  });
export type DatosCrearEmpleado = z.infer<typeof crearEmpleadoEsquema>;

/** El documento no se edita, por la misma razón que en Cliente: sería otra persona. */
export const actualizarEmpleadoEsquema = crearEmpleadoEsquema
  .innerType()
  .partial()
  .omit({ numeroDoc: true })
  .extend({ activo: z.boolean().optional() });
export type DatosActualizarEmpleado = z.infer<typeof actualizarEmpleadoEsquema>;

export const filtroEmpleadosEsquema = paginacionEsquema.extend({
  activo: booleanoEsquema.optional(),
  tipoContrato: tipoContratoEsquema.optional(),
});
export type FiltroEmpleados = z.infer<typeof filtroEmpleadosEsquema>;

export interface Empleado {
  id: string;
  nombre: string;
  tipoDoc: z.infer<typeof tipoDocumentoEsquema>;
  /** Últimos cuatro dígitos. El número completo no sale del servidor. */
  numeroDocFinal: string;
  cargo: string;
  salarioBase: string;
  moneda: Moneda;
  tipoContrato: TipoContrato;
  fechaIngreso: string;
  fechaRetiro: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
}

// ── Recibo de nómina ────────────────────────────────────────────────────────

export const TIPOS_PERIODO = ['QUINCENAL', 'MENSUAL'] as const;
export type TipoPeriodo = (typeof TIPOS_PERIODO)[number];
export const tipoPeriodoEsquema = z.enum(TIPOS_PERIODO);

export const ETIQUETA_TIPO_PERIODO: Record<TipoPeriodo, string> = {
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
};

export const ESTADOS_DOCUMENTO = ['VIGENTE', 'ANULADO'] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];
export const estadoDocumentoEsquema = z.enum(ESTADOS_DOCUMENTO);

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  VIGENTE: 'Vigente',
  ANULADO: 'Anulado',
};

export const conceptoEsquema = z.object({
  tipo: z.enum(['DEVENGADO', 'DEDUCCION']),
  /** Texto libre: la clienta escribe el concepto, no lo elige de un catálogo. */
  concepto: textoRequerido('El concepto', 120),
  valor: dineroEsquema,
});

export const liquidarEsquema = z
  .object({
    tipoPeriodo: tipoPeriodoEsquema,
    periodoInicio: z.coerce.date(),
    periodoFin: z.coerce.date(),
    moneda: monedaEsquema.default('COP'),
    conceptos: z.array(conceptoEsquema).min(1, 'El recibo necesita al menos un concepto'),
  })
  .refine((datos) => datos.periodoFin >= datos.periodoInicio, {
    message: 'El período no puede terminar antes de empezar',
    path: ['periodoFin'],
  })
  .refine((datos) => datos.conceptos.some((c) => c.tipo === 'DEVENGADO'), {
    message: 'Un recibo sin devengados no tiene sentido',
    path: ['conceptos'],
  });
export type DatosLiquidar = z.infer<typeof liquidarEsquema>;

/** Anular reusa el esquema de la Etapa 1: motivo y consecutivo escrito a mano. */
export const anularReciboEsquema = anulacionEsquema;

export const reemitirReciboEsquema = z.object({
  motivo: textoRequerido('El motivo de la reemisión', 500).min(
    10,
    'Explica el motivo con al menos 10 caracteres',
  ),
});

export const filtroRecibosEsquema = paginacionEsquema
  .extend({
    empleadoId: idEsquema.optional(),
    estado: estadoDocumentoEsquema.optional(),
    tipoPeriodo: tipoPeriodoEsquema.optional(),
  })
  .and(rangoFechasEsquema);

export interface ConceptoRecibo {
  tipo: TipoConcepto;
  concepto: string;
  valor: string;
  orden: number;
}

export interface ReciboResumen {
  id: string;
  consecutivo: string;
  numero: number;
  empleado: { id: string; nombre: string; cargo: string };
  tipoPeriodo: TipoPeriodo;
  periodoInicio: string;
  periodoFin: string;
  totalDevengado: string;
  totalDeducido: string;
  neto: string;
  moneda: Moneda;
  estado: EstadoDocumento;
  emitidoEn: string;
}

export interface ReciboDetalle extends ReciboResumen {
  conceptos: ConceptoRecibo[];
  emitidoPor: { id: string; nombre: string } | null;
  motivoAnulacion: string | null;
  anuladoEn: string | null;
  reemplazaA: string | null;
  hashArchivo: string | null;
}

/** Lo que se congela al emitir el recibo. El PDF se regenera desde aquí. */
export interface ContenidoRecibo {
  emisor: {
    nombre: string;
    nit: string;
    digitoVerificacion: number;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    municipio: string;
  };
  empleado: {
    nombre: string;
    tipoDoc: string;
    numeroDocFinal: string;
    cargo: string;
    tipoContrato: TipoContrato;
    fechaIngreso: string;
  };
  tipoPeriodo: TipoPeriodo;
  periodoInicio: string;
  periodoFin: string;
  conceptos: ConceptoRecibo[];
  totalDevengado: string;
  totalDeducido: string;
  neto: string;
  moneda: Moneda;
  /** Qué calculadora liquidó. Cuando existan fórmulas, saber cuál importará. */
  calculadora: string;
}

// ── Documentos laborales ────────────────────────────────────────────────────

export const TIPOS_DOCUMENTO_LABORAL = ['CARTA_LABORAL', 'CERTIFICADO_INGRESOS'] as const;
export type TipoDocumentoLaboral = (typeof TIPOS_DOCUMENTO_LABORAL)[number];
export const tipoDocumentoLaboralEsquema = z.enum(TIPOS_DOCUMENTO_LABORAL);

export const ETIQUETA_TIPO_DOCUMENTO_LABORAL: Record<TipoDocumentoLaboral, string> = {
  CARTA_LABORAL: 'Carta laboral',
  CERTIFICADO_INGRESOS: 'Certificado de ingresos y retenciones',
};

/**
 * Emitir una carta o un certificado.
 *
 * No se congela nada: certifican un estado **actual**. Si la piden otra vez en
 * junio, la respuesta correcta es la de junio (docs/ETAPA-05.md §3). Aquí solo
 * queda constancia de que se emitió.
 */
export const emitirDocumentoEsquema = z
  .object({
    tipo: tipoDocumentoLaboralEsquema,
    /** Solo para el certificado: de qué año son los ingresos que resume. */
    anio: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine((datos) => datos.tipo !== 'CERTIFICADO_INGRESOS' || datos.anio !== undefined, {
    message: 'Indica de qué año es el certificado',
    path: ['anio'],
  });
export type DatosEmitirDocumento = z.infer<typeof emitirDocumentoEsquema>;

export interface DocumentoLaboral {
  id: string;
  tipo: TipoDocumentoLaboral;
  anio: number | null;
  emitidoEn: string;
  emitidoPor: { id: string; nombre: string } | null;
}

export interface ResumenEmpleado {
  recibos: number;
  ultimoRecibo: string | null;
  /** Total neto pagado, para la cabecera de la ficha. */
  netoAcumulado: string;
}
