import type { ModuloSistema } from '../enums/index.js';

/** Etiqueta que ve el usuario en la barra lateral y en los mensajes. */
export const ETIQUETA_MODULO: Record<ModuloSistema, string> = {
  OPERACIONES: 'Operaciones',
  EGRESOS: 'Egresos',
  EMPLEADOS: 'Empleados',
  CONTABILIDAD: 'Contabilidad',
  CUMPLIMIENTO: 'Cumplimiento',
  CLIENTES: 'Clientes',
  ADMINISTRACION: 'Administración',
};

/** Ruta base del módulo en el frontend. */
export const RUTA_MODULO: Record<ModuloSistema, string> = {
  OPERACIONES: '/operaciones',
  EGRESOS: '/egresos',
  EMPLEADOS: '/empleados',
  CONTABILIDAD: '/contabilidad',
  CUMPLIMIENTO: '/cumplimiento',
  CLIENTES: '/clientes',
  ADMINISTRACION: '/administracion',
};

/** Orden fijo de la barra lateral. Coincide con el orden del brief. */
export const ORDEN_MODULOS: readonly ModuloSistema[] = [
  'OPERACIONES',
  'EGRESOS',
  'EMPLEADOS',
  'CONTABILIDAD',
  'CUMPLIMIENTO',
  'CLIENTES',
  'ADMINISTRACION',
];

export type NivelPermiso = 'ver' | 'editar';

export interface PermisoModulo {
  modulo: ModuloSistema;
  puedeVer: boolean;
  puedeEditar: boolean;
}

/**
 * Único punto donde se decide si un permiso alcanza. Lo usan el guard del backend
 * y la barra lateral del frontend, para que no puedan discrepar.
 *
 * Ocultar un botón no es control de acceso: esto se evalúa SIEMPRE en el servidor,
 * y en el cliente solo para no mostrar lo que igual sería rechazado.
 */
export function tienePermiso(
  permisos: readonly PermisoModulo[],
  modulo: ModuloSistema,
  nivel: NivelPermiso,
  esAdministrador = false,
): boolean {
  if (esAdministrador) return true;
  const permiso = permisos.find((p) => p.modulo === modulo);
  if (!permiso) return false;
  return nivel === 'editar' ? permiso.puedeEditar : permiso.puedeVer;
}
