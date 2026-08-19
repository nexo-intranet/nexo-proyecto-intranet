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
  // Sin dominio explícito la cookie queda ligada al host que respondió, que es lo
  // correcto cuando el navegador habla con el proxy de Next y no con el API: si
  // aquí se pusiera el dominio de Railway, el navegador rechazaría la cookie por
  // no coincidir con el origen de la respuesta. Solo se fija cuando el API y la
  // web comparten dominio propio (docs/SEGURIDAD.md §3.2).
  const dominioEfectivo = dominio && dominio !== 'localhost' ? dominio : undefined;

  return {
    httpOnly: true,
    secure: produccion,
    sameSite: 'lax',
    domain: dominioEfectivo,
    path: '/',
  };
}

export function opcionesAcceso(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), maxAge: QUINCE_MINUTOS };
}

/**
 * El refresco se acota a `/api` y no a `/api/v1/auth`.
 *
 * El navegador decide si manda una cookie comparando la ruta que él ve, no la que
 * ve el API. Detrás del proxy de Next la ruta es `/api/auth/refrescar`, y contra el
 * API directo es `/api/v1/auth/refrescar`: `/api` es el único prefijo que cubre las
 * dos. Con `/api/v1/auth` la cookie simplemente no viajaría en producción y la
 * sesión se caería a los quince minutos, cuando expira el token de acceso.
 */
export function opcionesRefresco(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), maxAge: SIETE_DIAS, path: '/api' };
}

/** El token CSRF sí lo lee el frontend, para devolverlo en el header. */
export function opcionesCsrf(opciones: OpcionesCookie): CookieOptions {
  return { ...base(opciones), httpOnly: false, maxAge: SIETE_DIAS };
}
