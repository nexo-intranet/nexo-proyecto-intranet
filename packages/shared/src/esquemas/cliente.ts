import { z } from 'zod';
import {
  booleanoEsquema,
  emailEsquema,
  idEsquema,
  paginacionEsquema,
  textoRequerido,
} from './comunes.js';
import { tipoContribuyenteEsquema, tipoDocumentoEsquema } from '../enums/index.js';
import { soloDigitos } from '../utilidades/nit.js';

export const TIPOS_CLIENTE = ['PERSONA_NATURAL', 'PERSONA_JURIDICA'] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];
export const tipoClienteEsquema = z.enum(TIPOS_CLIENTE);

export const ETIQUETA_TIPO_CLIENTE: Record<TipoCliente, string> = {
  PERSONA_NATURAL: 'Persona natural',
  PERSONA_JURIDICA: 'Persona jurídica',
};

/**
 * Número de documento.
 *
 * Viaja en claro del formulario al servidor, y **solo ahí**: el backend lo cifra
 * antes de guardarlo y nunca lo devuelve completo. La interfaz solo ve los últimos
 * cuatro dígitos (Ley 1581, docs/SEGURIDAD.md §5).
 */
export const numeroDocumentoEsquema = z
  .string({ required_error: 'El número de documento es obligatorio' })
  .trim()
  .transform(soloDigitos)
  .refine((valor) => valor.length >= 5 && valor.length <= 15, 'Debe tener entre 5 y 15 dígitos');

export const crearClienteEsquema = z.object({
  nombre: textoRequerido('El nombre', 200),
  tipo: tipoClienteEsquema,
  tipoDoc: tipoDocumentoEsquema,
  numeroDoc: numeroDocumentoEsquema,

  /**
   * Lo que el calendario tributario va a necesitar (etapa 6).
   *
   * Opcional, para no frenar el registro cuando todavía no se sabe. Pero se pide
   * desde ya: completarlo después, cliente por cliente, cuesta mucho más que
   * preguntarlo al crear.
   */
  tipoContribuyente: tipoContribuyenteEsquema.optional(),
  municipio: z.string().trim().max(120).optional(),
  /** El ICA es municipal, y el código DANE identifica el municipio sin ambigüedad. */
  codigoDaneMunicipio: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'El código DANE tiene cinco dígitos')
    .optional(),

  direccion: z.string().trim().max(200).optional(),
  nombreContacto: z.string().trim().max(200).optional(),
  email: emailEsquema.optional(),
  telefono: z.string().trim().max(40).optional(),
});
export type DatosCrearCliente = z.infer<typeof crearClienteEsquema>;

/**
 * El documento no se edita.
 *
 * Cambiarlo convertiría el registro en otra persona conservando su historial de
 * operaciones. Si el documento estaba mal, se crea el cliente correcto.
 */
export const actualizarClienteEsquema = crearClienteEsquema
  .partial()
  .omit({ numeroDoc: true })
  .extend({ activo: z.boolean().optional() });
export type DatosActualizarCliente = z.infer<typeof actualizarClienteEsquema>;

export const filtroClientesEsquema = paginacionEsquema.extend({
  tipo: tipoClienteEsquema.optional(),
  activo: booleanoEsquema.optional(),
});
export type FiltroClientes = z.infer<typeof filtroClientesEsquema>;

export interface Cliente {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  tipoDoc: z.infer<typeof tipoDocumentoEsquema>;
  /** Últimos cuatro dígitos. El número completo no sale del servidor. */
  numeroDocFinal: string;
  ultimoDigitoNit: number | null;
  tipoContribuyente: z.infer<typeof tipoContribuyenteEsquema> | null;
  municipio: string | null;
  codigoDaneMunicipio: string | null;
  direccion: string | null;
  nombreContacto: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}

/** Lo que ha movido un cliente. Alimenta la cabecera de su ficha. */
export interface ResumenCliente {
  operaciones: number;
  gananciaCOP: string;
  /** Fecha de su primera operación. Null si todavía no tiene ninguna. */
  desde: string | null;
  ultimaOperacion: string | null;
}

export const clienteIdEsquema = z.object({ clienteId: idEsquema });

/**
 * Búsqueda por documento.
 *
 * Compara el HMAC, no el número: la tabla nunca se descifra para buscar y el
 * documento en claro no entra en ningún índice (docs/SEGURIDAD.md §5).
 */
export const buscarClienteEsquema = z.object({
  documento: numeroDocumentoEsquema,
});
