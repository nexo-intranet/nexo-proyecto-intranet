import type { CookieOptions } from 'express';

/**
 * Cookies de sesión.
 *
 * Los tokens viven en cookies `httpOnly`, nunca en `localStorage`: ahí un XSS se
 * llevaría la sesión completa. Ver docs/SEGURIDAD.md §4.
 */

export const COOKIE_ACCESO = 'nexo_acceso';
export const COOKIE_REFRESCO = 'nexo_refresco';
/** Única cookie legible por JavaScript: es la mitad del doble envío contra CSRF. */
export const COOKIE_CSRF = 'nexo_csrf';

const QUINCE_MINUTOS = 15 * 60 * 1000;
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export interface OpcionesCookie {
  dominio: string;
  produccion: boolean;
}

function base({ dominio, produccion }: OpcionesCookie): CookieOptions {
  return {
    httpOnly: true,
    secure: produccion,
    sameSite: 'lax',
    domain: dominio === 'localhost' ? undefined : dominio,
    path: '/',
  };
}

export function opcionesAcceso(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), maxAge: QUINCE_MINUTOS };
}

export function opcionesRefresco(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), maxAge: SIETE_DIAS, path: '/api/v1/auth' };
}

/** El token CSRF sí lo lee el frontend, para devolverlo en el header. */
export function opcionesCsrf(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), httpOnly: false, maxAge: SIETE_DIAS };
}
