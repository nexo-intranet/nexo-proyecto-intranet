import { Injectable } from '@nestjs/common';
import type { FiltroAuditoria, RegistroAuditoria, RespuestaPaginada } from '@nexo/shared';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Visor del audit log. Solo lectura, por diseño: no existen rutas de escritura ni
 * de borrado, y la base de datos las rechazaría igual.
 *
 * El filtro por empresa no se escribe aquí: lo pone la extensión de Prisma y lo
 * refuerza la política de RLS. Desde la empresa A no se ve el historial de la B
 * aunque alguien construya la consulta a mano.
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroAuditoria): Promise<RespuestaPaginada<RegistroAuditoria>> {
    const where = {
      ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
      ...(filtro.accion ? { accion: filtro.accion } : {}),
      ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
      ...(filtro.entidadId ? { entidadId: filtro.entidadId } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            createdAt: {
              ...(filtro.desde ? { gte: filtro.desde } : {}),
              ...(filtro.hasta ? { lte: filtro.hasta } : {}),
            },
          }
        : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        select: {
          id: true,
          accion: true,
          entidad: true,
          entidadId: true,
          valorAnterior: true,
          valorNuevo: true,
          ip: true,
          createdAt: true,
          usuario: { select: { id: true, nombre: true } },
        },
        orderBy: { createdAt: filtro.dir },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return {
      // El id es BigInt en la base y JSON no sabe serializarlo: viaja como texto,
      // igual que el dinero.
      datos: filas.map((fila) => ({
        id: fila.id.toString(),
        accion: fila.accion,
        entidad: fila.entidad,
        entidadId: fila.entidadId,
        usuario: fila.usuario,
        valorAnterior: fila.valorAnterior as Record<string, unknown> | null,
        valorNuevo: fila.valorNuevo as Record<string, unknown> | null,
        ip: fila.ip,
        createdAt: fila.createdAt.toISOString(),
      })),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }
}
