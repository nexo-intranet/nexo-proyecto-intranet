import { z } from 'zod';
import { idEsquema, paginacionEsquema, rangoFechasEsquema, textoRequerido } from './comunes.js';
import { monedaEsquema, tipoContribuyenteEsquema, type Moneda } from '../enums/index.js';
import { dineroEsquema, dineroPositivoEsquema } from '../dinero/index.js';

// ── Gastos ──────────────────────────────────────────────────────────────────

export const CATEGORIAS_GASTO = [
  'ARRIENDO',
  'SERVICIOS_PUBLICOS',
  'NOMINA_ADMINISTRATIVA',
  'HONORARIOS',
  'TRANSPORTE',
  'PAPELERIA',
  'TECNOLOGIA',
  'IMPUESTOS',
  'OTRO',
] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];
export const categoriaGastoEsquema = z.enum(CATEGORIAS_GASTO);

export const ETIQUETA_CATEGORIA_GASTO: Record<CategoriaGasto, string> = {
  ARRIENDO: 'Arriendo',
  SERVICIOS_PUBLICOS: 'Servicios públicos',
  NOMINA_ADMINISTRATIVA: 'Nómina administrativa',
  HONORARIOS: 'Honorarios',
  TRANSPORTE: 'Transporte',
  PAPELERIA: 'Papelería',
  TECNOLOGIA: 'Tecnología',
  IMPUESTOS: 'Impuestos',
  OTRO: 'Otro',
};

const gastoBase = z.object({
  categoria: categoriaGastoEsquema,
  concepto: textoRequerido('El concepto', 200),
  proveedor: z.string().trim().max(200).optional(),

  monto: dineroPositivoEsquema,
  moneda: monedaEsquema.default('COP'),
  tasaCambio: dineroEsquema.optional(),

  fecha: z.coerce.date(),
  deducible: z.coerce.boolean().default(true),
});

/** Si el gasto no está en pesos, su tasa es obligatoria. */
function exigirTasa(datos: Partial<z.infer<typeof gastoBase>>, ctx: z.RefinementCtx): void {
  if (datos.moneda && datos.moneda !== 'COP' && !datos.tasaCambio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tasaCambio'],
      message: 'Indica la tasa de cambio del día del gasto',
    });
  }
}

export const crearGastoEsquema = gastoBase.superRefine(exigirTasa);
export type DatosCrearGasto = z.infer<typeof gastoBase>;

export const actualizarGastoEsquema = gastoBase.partial().superRefine(exigirTasa);
export type DatosActualizarGasto = z.infer<typeof actualizarGastoEsquema>;

export const filtroGastosEsquema = paginacionEsquema
  .extend({
    categoria: categoriaGastoEsquema.optional(),
    deducible: z.coerce.boolean().optional(),
    conSoporte: z.coerce.boolean().optional(),
  })
  .and(rangoFechasEsquema);
export type FiltroGastos = z.infer<typeof filtroGastosEsquema>;

export interface Gasto {
  id: string;
  categoria: CategoriaGasto;
  concepto: string;
  proveedor: string | null;
  monto: string;
  moneda: Moneda;
  tasaCambio: string | null;
  montoCOP: string;
  fecha: string;
  deducible: boolean;
  /** Solo el nombre y el tipo. La clave del archivo no sale del servidor. */
  soporte: { nombre: string; tipo: string } | null;
}

export interface ResumenGastos {
  cantidad: number;
  totalCOP: string;
  deducibleCOP: string;
  sinSoporte: number;
  porCategoria: Array<{ categoria: CategoriaGasto; cantidad: number; totalCOP: string }>;
}

// ── Calendario tributario ───────────────────────────────────────────────────

export const TIPOS_OBLIGACION = ['RENTA', 'RETENCIONES', 'ICA', 'EXOGENA'] as const;
export type TipoObligacion = (typeof TIPOS_OBLIGACION)[number];
export const tipoObligacionEsquema = z.enum(TIPOS_OBLIGACION);

export const ETIQUETA_TIPO_OBLIGACION: Record<TipoObligacion, string> = {
  RENTA: 'Renta',
  RETENCIONES: 'Retención en la fuente',
  ICA: 'Industria y comercio (ICA)',
  EXOGENA: 'Información exógena',
};

/**
 * Una fila del calendario.
 *
 * `tipoContribuyente` nulo significa «aplica a cualquiera», y
 * `codigoDaneMunicipio` solo tiene sentido en ICA, que es municipal.
 */
export const filaCalendarioEsquema = z
  .object({
    tipoObligacion: tipoObligacionEsquema,
    ultimoDigito: z.coerce.number().int().min(0).max(9),
    tipoContribuyente: tipoContribuyenteEsquema.optional(),
    codigoDaneMunicipio: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'El código DANE tiene cinco dígitos')
      .optional(),
    fechaLimite: z.coerce.date(),
    descripcion: z.string().trim().max(200).optional(),
  })
  .refine((fila) => fila.tipoObligacion === 'ICA' || !fila.codigoDaneMunicipio, {
    message: 'El municipio solo aplica al ICA',
    path: ['codigoDaneMunicipio'],
  });

export const importarCalendarioEsquema = z.object({
  anio: z.coerce.number().int().min(2020).max(2100),
  nota: z.string().trim().max(200).optional(),
  filas: z.array(filaCalendarioEsquema).min(1, 'El calendario necesita al menos una fecha'),
});
export type DatosImportarCalendario = z.infer<typeof importarCalendarioEsquema>;

/** Consultar el calendario de alguien: se cruza con sus datos, no se busca por id. */
export const consultarCalendarioEsquema = z.object({
  anio: z.coerce.number().int().min(2020).max(2100).optional(),
  ultimoDigito: z.coerce.number().int().min(0).max(9),
  tipoContribuyente: tipoContribuyenteEsquema.optional(),
  codigoDaneMunicipio: z.string().trim().length(5).optional(),
});

export interface FechaCalendario {
  id: string;
  anio: number;
  tipoObligacion: TipoObligacion;
  fechaLimite: string;
  descripcion: string | null;
  /** Días que faltan. Negativo si ya venció. */
  diasRestantes: number;
}

export interface ImportacionCalendario {
  id: string;
  anio: number;
  vigente: boolean;
  filas: number;
  nota: string | null;
  importadoEn: string;
  importadoPor: { id: string; nombre: string } | null;
}

/** Lo que devuelve la previsualización antes de confirmar una importación. */
export interface PrevisualizacionCalendario {
  anio: number;
  filas: number;
  /** Si ya había un calendario vigente de ese año, cuál queda desplazado. */
  reemplaza: { id: string; filas: number; importadoEn: string } | null;
  porObligacion: Array<{ tipoObligacion: TipoObligacion; filas: number }>;
}

// ── Solicitudes de documento ────────────────────────────────────────────────

export const ESTADOS_SOLICITUD = ['SOLICITADO', 'RECIBIDO', 'VENCIDO'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export const estadoSolicitudEsquema = z.enum(ESTADOS_SOLICITUD);

export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  SOLICITADO: 'Solicitado',
  RECIBIDO: 'Recibido',
  VENCIDO: 'Vencido',
};

export const crearSolicitudEsquema = z.object({
  clienteId: idEsquema,
  documento: textoRequerido('El documento', 200),
  descripcion: z.string().trim().max(500).optional(),
  fechaLimite: z.coerce.date(),
});
export type DatosCrearSolicitud = z.infer<typeof crearSolicitudEsquema>;

export const filtroSolicitudesEsquema = paginacionEsquema.extend({
  clienteId: idEsquema.optional(),
  estado: estadoSolicitudEsquema.optional(),
});

export interface SolicitudDocumento {
  id: string;
  cliente: { id: string; nombre: string };
  documento: string;
  descripcion: string | null;
  estado: EstadoSolicitud;
  fechaLimite: string;
  archivo: { nombre: string; tipo: string } | null;
  recibidoEn: string | null;
}
