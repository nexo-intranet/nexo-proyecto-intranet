/**
 * Frontera de tipos entre `apps/api` y `apps/web`.
 *
 * Todo lo que se exporta aquí termina en el bundle del navegador: no puede haber
 * secretos, claves ni lógica que dependa de variables de entorno del servidor.
 * Ver docs/SEGURIDAD.md §3.1.
 */

export * from './enums/index.js';
export * from './constantes/modulos.js';
export * from './dinero/index.js';
export * from './tipos/api.js';
export * from './esquemas/index.js';
export * from './utilidades/nit.js';
export * from './dispersion/index.js';
export * from './operaciones/index.js';
export * from './nomina/index.js';
export * from './calendario/index.js';
