import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ModuloSistema } from '@nexo/shared';

/** Ruta accesible sin sesión. Son tres en todo el sistema (docs/SEGURIDAD.md §3.3). */
export const CLAVE_PUBLICO = 'ruta_publica';
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/**
 * Ruta que no opera sobre una empresa concreta: autenticación, gestión de usuarios,
 * selector de empresas. Todo lo demás exige `X-Empresa-Id` válido.
 */
export const CLAVE_SIN_EMPRESA = 'ruta_sin_empresa';
export const SinEmpresa = () => SetMetadata(CLAVE_SIN_EMPRESA, true);

export type NivelPermiso = 'ver' | 'editar';

export interface PermisoRequerido {
  modulo: ModuloSistema;
  nivel: NivelPermiso;
}

/**
 * Permiso de módulo exigido por la ruta. Se verifica en el backend contra la base
 * de datos, no contra el contenido del token: quitarle un permiso a alguien surte
 * efecto de inmediato, no cuando expire su sesión.
 */
export const CLAVE_PERMISO = 'permiso_requerido';
export const Permiso = (modulo: ModuloSistema, nivel: NivelPermiso = 'ver') =>
  SetMetadata(CLAVE_PERMISO, { modulo, nivel } satisfies PermisoRequerido);

/** Entidad que toca la ruta, para el audit log. */
export const CLAVE_ENTIDAD_AUDITADA = 'entidad_auditada';
export const Auditar = (entidad: string) => SetMetadata(CLAVE_ENTIDAD_AUDITADA, entidad);

export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  email: string;
  esAdministrador: boolean;
}

export const UsuarioActual = createParamDecorator(
  (_datos: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const peticion = contexto.switchToHttp().getRequest<{ usuario: UsuarioAutenticado }>();
    return peticion.usuario;
  },
);
