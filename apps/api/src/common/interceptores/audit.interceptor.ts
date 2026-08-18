import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccionAudit } from '@nexo/shared';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { CLAVE_ENTIDAD_AUDITADA } from '../decoradores';
import { AuditService } from '../../core/audit/audit.service';
import { ContextoService } from '../../core/context/contexto.service';

const ACCION_POR_METODO: Record<string, AccionAudit> = {
  POST: 'CREAR',
  PATCH: 'ACTUALIZAR',
  PUT: 'ACTUALIZAR',
  DELETE: 'ELIMINAR',
};

/**
 * Red de seguridad del audit log.
 *
 * Lo normal es que el servicio registre el cambio con su valor anterior, porque es
 * el único que lo conoce. Este interceptor cubre el caso en que alguien agregue una
 * mutación y olvide auditarla: registra una entrada genérica con la ruta y el
 * resultado, para que el requisito de "toda mutación queda en el audit log" no
 * dependa de la memoria de quien escribe el endpoint.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly contexto: ContextoService,
  ) {}

  intercept(contextoEjecucion: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const peticion = contextoEjecucion.switchToHttp().getRequest<Request>();
    const accion = ACCION_POR_METODO[peticion.method];

    if (!accion) return siguiente.handle();

    const entidad =
      this.reflector.getAllAndOverride<string>(CLAVE_ENTIDAD_AUDITADA, [
        contextoEjecucion.getHandler(),
        contextoEjecucion.getClass(),
      ]) ?? contextoEjecucion.getClass().name.replace(/Controller$/, '');

    return siguiente.handle().pipe(
      tap((resultado) => {
        // El servicio ya lo registró con detalle: no duplicamos.
        if (this.contexto.fueAuditado()) return;

        const entidadId =
          resultado && typeof resultado === 'object' && 'id' in resultado
            ? String((resultado as { id: unknown }).id)
            : undefined;

        void this.audit.registrarSinFallar({
          accion,
          entidad,
          entidadId,
          valorNuevo: resultado,
        });
      }),
    );
  }
}
