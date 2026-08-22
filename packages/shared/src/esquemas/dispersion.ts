import { z } from 'zod';
import { idEsquema, paginacionEsquema, textoRequerido } from './comunes.js';
import { tipoDocumentoEsquema, monedaEsquema } from '../enums/index.js';
import { dineroEsquema, dineroPositivoEsquema } from '../dinero/index.js';
import { numeroDocumentoEsquema } from './cliente.js';
import type { TipoReparto } from '../dispersion/index.js';

export const TIPOS_REPARTO = ['PORCENTAJE', 'MONTO_FIJO'] as const;
export const tipoRepartoEsquema = z.enum(TIPOS_REPARTO);

export const ETIQUETA_TIPO_REPARTO: Record<TipoReparto, string> = {
  PORCENTAJE: 'Por porcentaje',
  MONTO_FIJO: 'Por monto fijo',
};

export const ESTADOS_DISPERSION = ['PENDIENTE', 'PARCIAL', 'EJECUTADA'] as const;
export type EstadoDispersion = (typeof ESTADOS_DISPERSION)[number];
export const estadoDispersionEsquema = z.enum(ESTADOS_DISPERSION);

export const ETIQUETA_ESTADO_DISPERSION: Record<EstadoDispersion, string> = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Parcial',
  EJECUTADA: 'Ejecutada',
};

export const ESTADOS_DESTINO = ['PENDIENTE', 'EJECUTADO', 'DEVUELTO'] as const;
export type EstadoDestino = (typeof ESTADOS_DESTINO)[number];
export const estadoDestinoEsquema = z.enum(ESTADOS_DESTINO);

export const ETIQUETA_ESTADO_DESTINO: Record<EstadoDestino, string> = {
  PENDIENTE: 'Pendiente',
  EJECUTADO: 'Ejecutado',
  DEVUELTO: 'Devuelto',
};

// ── Destinatarios ───────────────────────────────────────────────────────────

export const crearDestinatarioEsquema = z.object({
  nombre: textoRequerido('El nombre', 200),
  tipoDoc: tipoDocumentoEsquema,
  numeroDoc: numeroDocumentoEsquema,
  banco: z.string().trim().max(120).optional(),
  tipoCuenta: z.enum(['AHORROS', 'CORRIENTE']).optional(),
  /** Se cifra en el servidor; la interfaz solo vuelve a ver los últimos cuatro. */
  cuenta: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, 'El número de cuenta debe tener entre 5 y 25 dígitos')
    .optional(),
});
export type DatosCrearDestinatario = z.infer<typeof crearDestinatarioEsquema>;

export const actualizarDestinatarioEsquema = crearDestinatarioEsquema
  .omit({ numeroDoc: true })
  .partial()
  .extend({ activo: z.boolean().optional() });
export type DatosActualizarDestinatario = z.infer<typeof actualizarDestinatarioEsquema>;

export const filtroDestinatariosEsquema = paginacionEsquema.extend({
  activo: z.coerce.boolean().optional(),
});

export interface Destinatario {
  id: string;
  nombre: string;
  tipoDoc: z.infer<typeof tipoDocumentoEsquema>;
  numeroDocFinal: string;
  banco: string | null;
  tipoCuenta: string | null;
  cuentaFinal: string | null;
  activo: boolean;
}

// ── Reglas de dispersión ────────────────────────────────────────────────────

const destinoDeRegla = z.object({
  destinatarioId: idEsquema,
  porcentaje: dineroEsquema.optional(),
  montoFijo: dineroPositivoEsquema.optional(),
  orden: z.number().int().min(0),
});

export const guardarReglaEsquema = z
  .object({
    nombre: textoRequerido('El nombre de la regla', 120),
    tipoReparto: tipoRepartoEsquema,
    activa: z.boolean().default(true),
    destinos: z.array(destinoDeRegla).min(1, 'La regla necesita al menos un destinatario'),
  })
  .superRefine((datos, ctx) => {
    const campo = datos.tipoReparto === 'PORCENTAJE' ? 'porcentaje' : 'montoFijo';

    datos.destinos.forEach((destino, i) => {
      if (!destino[campo]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinos', i, campo],
          message:
            datos.tipoReparto === 'PORCENTAJE'
              ? 'Indica el porcentaje de este destinatario'
              : 'Indica el monto de este destinatario',
        });
      }
    });

    // Un destinatario repetido dentro de una misma regla es siempre un error de
    // captura, y en producción lo detectaría el índice único con un 500 opaco.
    const vistos = new Set<string>();
    datos.destinos.forEach((destino, i) => {
      if (vistos.has(destino.destinatarioId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinos', i, 'destinatarioId'],
          message: 'Este destinatario ya está en la regla',
        });
      }
      vistos.add(destino.destinatarioId);
    });
  });
export type DatosGuardarRegla = z.infer<typeof guardarReglaEsquema>;

// ── Dispersión de una operación ─────────────────────────────────────────────

const destinoManual = z.object({
  destinatarioId: idEsquema,
  monto: dineroPositivoEsquema,
  orden: z.number().int().min(0).default(0),
});

/**
 * Armar la dispersión de una operación.
 *
 * La operación va en la ruta, no aquí: la dispersión no existe suelta, cuelga de la
 * operación que la produjo.
 *
 * O se aplica una regla guardada, o se arma el reparto a mano. Las dos cosas a la
 * vez no significan nada, y ninguna de las dos tampoco.
 */
export const crearDispersionEsquema = z
  .object({
    /** Sobre qué se reparte. Por defecto, la ganancia de la operación. */
    montoTotal: dineroPositivoEsquema.optional(),
    moneda: monedaEsquema.default('COP'),
    reglaId: idEsquema.optional(),
    destinos: z.array(destinoManual).optional(),
  })
  .superRefine((datos, ctx) => {
    const tieneRegla = Boolean(datos.reglaId);
    const tieneDestinos = Boolean(datos.destinos?.length);

    if (tieneRegla === tieneDestinos) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reglaId'],
        message: tieneRegla
          ? 'Usa una regla o arma el reparto a mano, no las dos cosas'
          : 'Elige una regla o arma el reparto a mano',
      });
    }
  });
export type DatosCrearDispersion = z.infer<typeof crearDispersionEsquema>;

/** Previsualizar antes de guardar: mismos datos, sin efecto. */
export const previsualizarDispersionEsquema = crearDispersionEsquema;

/** Rehacer el reparto de una dispersión que todavía no tiene ningún giro hecho. */
export const actualizarDispersionEsquema = crearDispersionEsquema;

/**
 * Marcar un giro como ejecutado.
 *
 * La referencia de pago es obligatoria: es la única prueba de que el giro salió,
 * y sin ella la conciliación no se puede auditar después.
 */
export const ejecutarDestinoEsquema = z.object({
  referenciaPago: textoRequerido('La referencia de pago', 120),
  ejecutadoEn: z.coerce.date().optional(),
  observaciones: z.string().trim().max(500).optional(),
});
export type DatosEjecutarDestino = z.infer<typeof ejecutarDestinoEsquema>;

/**
 * Devolver un giro.
 *
 * Va aparte de ejecutar, y no como un estado más del mismo endpoint, porque lo que
 * hace falta es distinto: un giro que salió necesita su referencia de pago; uno que
 * se devolvió necesita que alguien explique por qué. Pedir una referencia de pago
 * para una devolución obligaría a inventarla.
 */
export const revertirDestinoEsquema = z.object({
  motivo: textoRequerido('El motivo de la devolución', 500).min(
    10,
    'Explica el motivo con al menos 10 caracteres',
  ),
});
export type DatosRevertirDestino = z.infer<typeof revertirDestinoEsquema>;

export interface ReglaDestinoVista {
  destinatarioId: string;
  nombre: string;
  cuentaFinal: string | null;
  porcentaje: string | null;
  montoFijo: string | null;
  orden: number;
}

export interface ReglaVista {
  id: string;
  nombre: string;
  tipoReparto: TipoReparto;
  activa: boolean;
  destinos: ReglaDestinoVista[];
}

export const filtroDispersionesEsquema = paginacionEsquema.extend({
  estado: estadoDispersionEsquema.optional(),
});

export interface DispersionDestinoVista {
  id: string;
  destinatarioId: string | null;
  nombreSnapshot: string;
  cuentaSnapshot: string | null;
  monto: string;
  porcentaje: string | null;
  estado: EstadoDestino;
  ejecutadoEn: string | null;
  referenciaPago: string | null;
  observaciones: string | null;
}

export interface DispersionVista {
  id: string;
  operacionId: string;
  montoTotal: string;
  moneda: string;
  estado: EstadoDispersion;
  regla: { id: string; nombre: string } | null;
  destinos: DispersionDestinoVista[];
  /** Lo repartido menos el total. Cero cuando cuadra. */
  diferencia: string;
}
