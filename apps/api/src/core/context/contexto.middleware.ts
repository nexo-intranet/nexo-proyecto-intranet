import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ContextoService } from './contexto.service';

/**
 * Abre el contexto de la petición. Todo lo que venga después —guards, controladores,
 * repositorios— corre dentro de él.
 *
 * Aquí solo se registran los datos que trae la petición HTTP. La identidad del
 * usuario la fija JwtAuthGuard y la empresa activa EmpresaGuard, cada uno después
 * de verificar lo suyo.
 */
@Injectable()
export class ContextoMiddleware implements NestMiddleware {
  constructor(private readonly contexto: ContextoService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    this.contexto.ejecutarCon(
      {
        esAdministrador: false,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        ruta: `${req.method} ${req.originalUrl}`,
      },
      () => next(),
    );
  }
}
