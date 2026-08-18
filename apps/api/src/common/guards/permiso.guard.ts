import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ETIQUETA_MODULO } from '@nexo/shared';
import type { Request } from 'express';
import {
  CLAVE_PERMISO,
  CLAVE_PUBLICO,
  type PermisoRequerido,
  type UsuarioAutenticado,
} from '../decoradores';
import { noAutenticado, sinPermiso } from '../errores';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * RBAC por módulo, verificado en el backend.
 *
 * Ocultar un botón en el frontend no es control de acceso: si una ruta no declara
 * `@Permiso(...)` y no es pública, solo exige sesión. El permiso se lee de la base
 * de datos en cada petición, no del token.
 */
@Injectable()
export class PermisoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contextoEjecucion: ExecutionContext): Promise<boolean> {
    const anotaciones = [contextoEjecucion.getHandler(), contextoEjecucion.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, anotaciones)) return true;

    const requerido = this.reflector.getAllAndOverride<PermisoRequerido>(
      CLAVE_PERMISO,
      anotaciones,
    );
    if (!requerido) return true;

    const peticion = contextoEjecucion
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const usuario = peticion.usuario;
    if (!usuario) throw noAutenticado();

    if (usuario.esAdministrador) return true;

    const permiso = await this.prisma.db.permisoModulo.findUnique({
      where: { usuarioId_modulo: { usuarioId: usuario.id, modulo: requerido.modulo } },
      select: { puedeVer: true, puedeEditar: true },
    });

    const autorizado =
      requerido.nivel === 'editar' ? permiso?.puedeEditar === true : permiso?.puedeVer === true;

    if (!autorizado) throw sinPermiso(ETIQUETA_MODULO[requerido.modulo]);

    return true;
  }
}
