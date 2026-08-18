import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CLAVE_PUBLICO, type UsuarioAutenticado } from '../decoradores';
import { ErrorNegocio, noAutenticado } from '../errores';
import { COOKIE_ACCESO } from '../../core/auth/cookies';
import { ContextoService } from '../../core/context/contexto.service';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface PayloadAcceso {
  /** Id del usuario. */
  sub: string;
}

/**
 * Verifica la sesión y publica la identidad en el contexto de la petición.
 *
 * El estado del usuario se relee de la base de datos en cada petición, no se toma
 * del token: desactivar a alguien o quitarle un permiso surte efecto de inmediato
 * y no cuando expire su sesión. Ver docs/SEGURIDAD.md §4.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly contexto: ContextoService,
  ) {}

  async canActivate(contextoEjecucion: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contextoEjecucion.getHandler(),
      contextoEjecucion.getClass(),
    ]);
    if (esPublica) return true;

    const peticion = contextoEjecucion.switchToHttp().getRequest<Request>();
    const token = (peticion.cookies as Record<string, string> | undefined)?.[COOKIE_ACCESO];
    if (!token) throw noAutenticado();

    let payload: PayloadAcceso;
    try {
      payload = await this.jwt.verifyAsync<PayloadAcceso>(token);
    } catch {
      throw new ErrorNegocio(
        'TOKEN_EXPIRADO',
        'Tu sesión expiró. Vuelve a ingresar.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const usuario = await this.prisma.db.usuario.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        rol: { select: { nombre: true } },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new ErrorNegocio(
        'CUENTA_INACTIVA',
        'Tu cuenta no está activa. Comunícate con un administrador.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const autenticado: UsuarioAutenticado = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      esAdministrador: usuario.rol.nombre === 'ADMINISTRADOR',
    };

    (peticion as Request & { usuario: UsuarioAutenticado }).usuario = autenticado;
    this.contexto.establecerUsuario(autenticado.id, autenticado.esAdministrador);

    return true;
  }
}
