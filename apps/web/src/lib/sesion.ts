'use client';

import type { ModuloSistema, SesionActual } from '@nexo/shared';
import { ORDEN_MODULOS, tienePermiso } from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { peticion } from '@/lib/api/cliente';

/**
 * Sesión del usuario.
 *
 * Lo que devuelve esto decide qué se muestra, nunca qué se permite: el backend
 * vuelve a verificar cada permiso en cada petición. Ocultar un módulo aquí es
 * comodidad, no control de acceso (brief §4.6).
 */

export const CLAVE_SESION = ['sesion'] as const;

export function useSesion() {
  return useQuery({
    queryKey: CLAVE_SESION,
    queryFn: () => peticion<SesionActual>('auth/yo'),
    staleTime: 60_000,
    retry: false,
  });
}

/** Módulos que el usuario puede ver, en el orden fijo de la barra lateral. */
export function modulosVisibles(sesion: SesionActual | undefined): ModuloSistema[] {
  if (!sesion) return [];
  const esAdministrador = sesion.usuario.rol === 'ADMINISTRADOR';
  return ORDEN_MODULOS.filter((modulo) =>
    tienePermiso(sesion.permisos, modulo, 'ver', esAdministrador),
  );
}

export function puedeEditar(sesion: SesionActual | undefined, modulo: ModuloSistema): boolean {
  if (!sesion) return false;
  return tienePermiso(sesion.permisos, modulo, 'editar', sesion.usuario.rol === 'ADMINISTRADOR');
}
