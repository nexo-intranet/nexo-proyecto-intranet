import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { CodigoError, ErrorApi } from '@nexo/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ErrorNegocio } from '../errores';
import { SinEmpresaEnContextoError } from '../../core/context/contexto.service';

/**
 * Da forma a todos los errores que salen de la API.
 *
 * En producción nunca se devuelve un stack trace ni el mensaje interno de una
 * excepción no controlada: eso le sirve más a quien está sondeando el sistema que
 * a quien lo usa. El detalle queda en el log del servidor.
 */
@Catch()
export class FiltroExcepciones implements ExceptionFilter {
  private readonly registro = new Logger('Excepcion');

  constructor(private readonly produccion: boolean) {}

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const { estado, cuerpo } = this.traducir(excepcion);

    if (estado >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.registro.error(
        cuerpo.error.mensaje,
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    }

    respuesta.status(estado).json(cuerpo);
  }

  private traducir(excepcion: unknown): { estado: number; cuerpo: ErrorApi } {
    if (excepcion instanceof ErrorNegocio) {
      const detalle = excepcion.getResponse() as {
        codigo: CodigoError;
        mensaje: string;
        detalles?: Record<string, string[]>;
      };
      return {
        estado: excepcion.getStatus(),
        cuerpo: { error: detalle },
      };
    }

    if (excepcion instanceof ZodError) {
      const detalles: Record<string, string[]> = {};
      for (const problema of excepcion.issues) {
        const campo = problema.path.join('.') || '_';
        (detalles[campo] ??= []).push(problema.message);
      }
      return {
        estado: HttpStatus.BAD_REQUEST,
        cuerpo: {
          error: {
            codigo: 'DATOS_INVALIDOS',
            mensaje: 'Revisa los datos del formulario.',
            detalles,
          },
        },
      };
    }

    // Falta empresa en el contexto: es un error de programación, no del usuario.
    // Se responde con un mensaje neutro y se registra completo del lado del servidor.
    if (excepcion instanceof SinEmpresaEnContextoError) {
      this.registro.error(excepcion.message, excepcion.stack);
      return {
        estado: HttpStatus.BAD_REQUEST,
        cuerpo: {
          error: {
            codigo: 'EMPRESA_NO_SELECCIONADA',
            mensaje: 'Selecciona una empresa en la barra superior para continuar.',
          },
        },
      };
    }

    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      return {
        estado,
        cuerpo: {
          error: {
            codigo:
              estado === HttpStatus.TOO_MANY_REQUESTS ? 'DEMASIADAS_PETICIONES' : 'DATOS_INVALIDOS',
            mensaje:
              estado === HttpStatus.TOO_MANY_REQUESTS
                ? 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
                : excepcion.message,
          },
        },
      };
    }

    return {
      estado: HttpStatus.INTERNAL_SERVER_ERROR,
      cuerpo: {
        error: {
          codigo: 'ERROR_INTERNO',
          mensaje: this.produccion
            ? 'Ocurrió un error inesperado. Si vuelve a pasar, avisa al administrador.'
            : excepcion instanceof Error
              ? excepcion.message
              : String(excepcion),
        },
      },
    };
  }
}
