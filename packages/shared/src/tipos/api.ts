/** Contrato de respuesta de la API. Ver docs/ARQUITECTURA.md §2.2. */

export interface RespuestaPaginada<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface ErrorApi {
  error: {
    codigo: CodigoError;
    mensaje: string;
    detalles?: Record<string, string[]>;
  };
}

/**
 * Códigos de error estables. El frontend decide qué hacer según el código,
 * nunca leyendo el texto del mensaje.
 */
export const CODIGOS_ERROR = [
  'NO_AUTENTICADO',
  'CREDENCIALES_INVALIDAS',
  'CUENTA_BLOQUEADA',
  'CUENTA_INACTIVA',
  'REQUIERE_2FA',
  'CODIGO_2FA_INVALIDO',
  'DEBE_CAMBIAR_PASSWORD',
  'TOKEN_EXPIRADO',
  'CSRF_INVALIDO',
  'SIN_PERMISO',
  'EMPRESA_NO_SELECCIONADA',
  'EMPRESA_NO_AUTORIZADA',
  'NO_ENCONTRADO',
  'DATOS_INVALIDOS',
  'CONFLICTO',
  'DEMASIADAS_PETICIONES',
  'DOCUMENTO_ANULADO',
  'ERROR_INTERNO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** Cabecera con la empresa activa. Nunca viaja en la URL ni en el cuerpo. */
export const HEADER_EMPRESA = 'x-empresa-id';
export const HEADER_CSRF = 'x-csrf-token';
