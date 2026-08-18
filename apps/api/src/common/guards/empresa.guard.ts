import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HEADER_EMPRESA } from '@nexo/shared';
import type { Request } from 'express';
import { CLAVE_PUBLICO, CLAVE_SIN_EMPRESA, type UsuarioAutenticado } from '../decoradores';
import { empresaNoAutorizada, empresaNoSeleccionada } from '../errores';
import { ContextoService } from '../../core/context/contexto.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Capa 1 del aislamiento por empresa (docs/SEGURIDAD.md §1).
 *
 * La empresa activa llega en el header `X-Empresa-Id` y **nunca** en la URL ni en
 * el cuerpo. Aquí se verifica contra `UsuarioEmpresa` que el usuario tenga acceso,
 * y solo entonces se publica en el contexto. Forzar el id de otra empresa devuelve
 * 403 antes de que el controlador llegue a ejecutarse.
 */
@Injectable()
export class EmpresaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly contexto: ContextoService,
  ) {}

  async canActivate(contextoEjecucion: ExecutionContext): Promise<boolean> {
    const anotaciones = [contextoEjecucion.getHandler(), contextoEjecucion.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, anotaciones)) return true;
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_SIN_EMPRESA, anotaciones)) return true;

    const peticion = contextoEjecucion
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();

    const empresaId = peticion.header(HEADER_EMPRESA);
    if (!empresaId) throw empresaNoSeleccionada();

    const usuario = peticion.usuario;
    if (!usuario) throw empresaNoAutorizada();

    const empresa = await this.prisma.db.empresaAdministrada.findFirst({
      where: { id: empresaId, deletedAt: null, activa: true },
      select: { id: true },
    });
    if (!empresa) throw empresaNoAutorizada();

    // El administrador llega a todas las empresas sin filas en UsuarioEmpresa, pero
    // igual opera sobre una empresa activa concreta.
    if (!usuario.esAdministrador) {
      const acceso = await this.prisma.db.usuarioEmpresa.findUnique({
        where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId } },
        select: { id: true },
      });
      if (!acceso) throw empresaNoAutorizada();
    }

    this.contexto.establecerEmpresa(empresaId);
    return true;
  }
}
