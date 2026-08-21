import { HttpException, HttpStatus } from '@nestjs/common';
import type { CodigoError } from '@nexo/shared';

/**
 * Error de negocio con código estable.
 *
 * El frontend decide qué hacer según el `codigo`, nunca leyendo el texto: así se
 * puede reescribir un mensaje sin romper el comportamiento del cliente.
 */
export class ErrorNegocio extends HttpException {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    estado: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly detalles?: Record<string, string[]>,
  ) {
    super({ codigo, mensaje, detalles }, estado);
  }
}

export const noAutenticado = () =>
  new ErrorNegocio(
    'NO_AUTENTICADO',
    'Tu sesión no está activa. Vuelve a ingresar.',
    HttpStatus.UNAUTHORIZED,
  );

export const sinPermiso = (modulo: string) =>
  new ErrorNegocio(
    'SIN_PERMISO',
    `No tienes permiso para esta acción en ${modulo}.`,
    HttpStatus.FORBIDDEN,
  );

export const empresaNoSeleccionada = () =>
  new ErrorNegocio(
    'EMPRESA_NO_SELECCIONADA',
    'Selecciona una empresa en la barra superior para continuar.',
    HttpStatus.BAD_REQUEST,
  );

export const empresaNoAutorizada = () =>
  new ErrorNegocio(
    'EMPRESA_NO_AUTORIZADA',
    'No tienes acceso a esa empresa.',
    HttpStatus.FORBIDDEN,
  );

export const noEncontrado = (que: string) =>
  new ErrorNegocio('NO_ENCONTRADO', `No se encontró ${que}.`, HttpStatus.NOT_FOUND);

export const csrfInvalido = () =>
  new ErrorNegocio(
    'CSRF_INVALIDO',
    'La solicitud no pudo verificarse. Recarga la página e inténtalo de nuevo.',
    HttpStatus.FORBIDDEN,
  );

/**
 * La petición es válida pero choca con el estado actual: un documento repetido,
 * una operación ya anulada, un cliente con historial. No es culpa del formato, así
 * que no es 400; es el estado del sistema el que la rechaza.
 */
export const conflicto = (mensaje: string) =>
  new ErrorNegocio('CONFLICTO', mensaje, HttpStatus.CONFLICT);

/** Acción no permitida sobre un documento anulado (brief §4.3). */
export const documentoAnulado = (que: string) =>
  new ErrorNegocio(
    'DOCUMENTO_ANULADO',
    `${que} está anulada y no admite cambios.`,
    HttpStatus.CONFLICT,
  );
