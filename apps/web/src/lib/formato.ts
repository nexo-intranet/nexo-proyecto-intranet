import { ZONA_HORARIA } from '@nexo/shared';

/**
 * Formato de fechas.
 *
 * Todo se guarda en UTC y se muestra en hora de Bogotá (brief §4.11). La zona se
 * fija explícitamente en vez de confiar en la del navegador: alguien conectado
 * desde otro huso vería horas que no coinciden con las de sus compañeros.
 */

export function formatearFechaHora(iso: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function formatearFecha(iso: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA_HORARIA,
    dateStyle: 'medium',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}
