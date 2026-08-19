/**
 * Token de reto del segundo factor.
 *
 * Vive en `sessionStorage` y no en una cookie a propósito: dura cinco minutos, no
 * es una sesión, y no debe viajar automáticamente en cada petición. Se borra en
 * cuanto se usa.
 */

const CLAVE_TOKEN = 'nexo.reto';
const CLAVE_REGISTRO = 'nexo.retoRegistro';

export function guardarReto(token: string, debeRegistrar2fa: boolean): void {
  window.sessionStorage.setItem(CLAVE_TOKEN, token);
  window.sessionStorage.setItem(CLAVE_REGISTRO, String(debeRegistrar2fa));
}

export function leerReto(): { token: string | null; debeRegistrar2fa: boolean } {
  if (typeof window === 'undefined') return { token: null, debeRegistrar2fa: false };
  return {
    token: window.sessionStorage.getItem(CLAVE_TOKEN),
    debeRegistrar2fa: window.sessionStorage.getItem(CLAVE_REGISTRO) === 'true',
  };
}

export function borrarReto(): void {
  window.sessionStorage.removeItem(CLAVE_TOKEN);
  window.sessionStorage.removeItem(CLAVE_REGISTRO);
}
