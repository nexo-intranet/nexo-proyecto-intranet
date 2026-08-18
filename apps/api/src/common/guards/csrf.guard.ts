import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HEADER_CSRF } from '@nexo/shared';
import type { Request } from 'express';
import { CLAVE_PUBLICO } from '../decoradores';
import { csrfInvalido } from '../errores';
import { COOKIE_CSRF } from '../../core/auth/cookies';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF por doble envío.
 *
 * El token va en una cookie legible por el frontend y este lo devuelve en el header
 * `X-CSRF-Token`. Un sitio ajeno puede provocar que el navegador mande la cookie,
 * pero no puede leerla para copiarla al header.
 *
 * Se verifica antes que cualquier otra cosa en toda mutación.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contextoEjecucion: ExecutionContext): boolean {
    const peticion = contextoEjecucion.switchToHttp().getRequest<Request>();

    if (METODOS_SEGUROS.has(peticion.method)) return true;

    // Las rutas públicas de autenticación no tienen sesión que proteger todavía;
    // ahí el control es el límite de tasa, no el CSRF.
    const esPublica = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contextoEjecucion.getHandler(),
      contextoEjecucion.getClass(),
    ]);
    if (esPublica) return true;

    const enCookie = (peticion.cookies as Record<string, string> | undefined)?.[COOKIE_CSRF];
    const enHeader = peticion.header(HEADER_CSRF);

    if (!enCookie || !enHeader) throw csrfInvalido();

    const a = Buffer.from(enCookie);
    const b = Buffer.from(enHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw csrfInvalido();

    return true;
  }
}
