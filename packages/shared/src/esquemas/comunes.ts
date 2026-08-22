import { z } from 'zod';

/**
 * Piezas que reutilizan todos los módulos.
 *
 * Estos esquemas validan en el cliente y en el servidor (docs/ARQUITECTURA.md §1.3).
 * La validación del cliente es comodidad; la del servidor es el control real.
 */

export const idEsquema = z.string().cuid({ message: 'Identificador inválido' });

export const textoRequerido = (campo: string, max = 200) =>
  z
    .string({ required_error: `${campo} es obligatorio` })
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(max, `${campo} no puede superar ${max} caracteres`);

export const emailEsquema = z
  .string({ required_error: 'El correo es obligatorio' })
  .trim()
  .toLowerCase()
  .email('El correo no tiene un formato válido')
  .max(254);

/**
 * Un booleano que llega en una URL.
 *
 * `z.coerce.boolean()` **no sirve** para esto y falla de la peor manera: en
 * JavaScript `Boolean('false')` es `true`, porque toda cadena no vacía es
 * verdadera. Un filtro `?activo=false` entraba al servidor como `true` y devolvía
 * exactamente lo contrario de lo que se pidió, sin error, sin registro y sin nada
 * que le dijera a nadie que la lista estaba al revés.
 *
 * Aquí se lee el texto, que es lo que de verdad llega. Se aceptan también booleanos
 * de verdad porque el mismo esquema se usa con cuerpos JSON, donde `false` sí es
 * `false`.
 */
export const booleanoEsquema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((valor) => valor === true || valor === 'true' || valor === '1');

export const MAX_POR_PAGINA = 200;

export const paginacionEsquema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(MAX_POR_PAGINA).default(50),
  orden: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('desc'),
  busqueda: z.string().trim().max(120).optional(),
});

export type ParametrosPaginacion = z.infer<typeof paginacionEsquema>;

/** Rango de fechas. Se recibe en ISO-8601 UTC; el formateo a Bogotá es del cliente. */
export const rangoFechasEsquema = z
  .object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
  })
  .refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['desde'],
  });

/**
 * Anulación de un documento legal. El brief (§4.3) prohíbe editar y borrar: solo
 * se anula, con motivo, y el consecutivo escrito a mano confirma la intención.
 */
export const anulacionEsquema = z.object({
  motivo: textoRequerido('El motivo de anulación', 500).min(
    10,
    'Explica el motivo con al menos 10 caracteres',
  ),
  confirmacionConsecutivo: textoRequerido('El consecutivo'),
});

export type DatosAnulacion = z.infer<typeof anulacionEsquema>;

export const ZONA_HORARIA = 'America/Bogota';
