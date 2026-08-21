/**
 * Abrir la búsqueda global desde cualquier parte.
 *
 * El estado del buscador vive en el marco de la aplicación, que es quien monta la
 * paleta. Una página que quiera abrirlo —la portada, por ejemplo— tendría que
 * recibirlo por props atravesando el layout entero, y eso no se puede en el App
 * Router sin un contexto solo para esto.
 *
 * Un evento del DOM resuelve lo mismo sin acoplar la página al marco: la portada
 * avisa, el marco escucha, y ninguno de los dos necesita saber del otro.
 */

export const EVENTO_ABRIR_BUSCADOR = 'nexo:abrir-buscador';

/** `consulta` precarga el texto, para cuando alguien ya escribió algo antes de abrir. */
export function abrirBuscador(consulta?: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSCADOR, { detail: { consulta } }));
}

export interface DetalleAbrirBuscador {
  consulta?: string;
}
