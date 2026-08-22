import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DatosCrearSolicitud,
  ParametrosPaginacion,
  RespuestaPaginada,
  SolicitudDocumento,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { ArchivosService } from '../../core/archivos/archivos.service';
import { AuditService } from '../../core/audit/audit.service';
import { ContextoService } from '../../core/context/contexto.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Documentos que se le piden a un cliente.
 *
 * Tres estados: solicitado, recibido y vencido. El vencido **no se guarda**: se
 * calcula al leer, comparando la fecha límite con hoy. Guardarlo obligaría a un
 * proceso que recorra la tabla cada noche, y una solicitud vencida a las 00:01 no
 * es distinta de una vencida a las 09:00 — lo que cambió es la fecha, no el dato.
 */
@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
    private readonly contexto: ContextoService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    documento: true,
    descripcion: true,
    estado: true,
    fechaLimite: true,
    archivoNombre: true,
    archivoTipo: true,
    recibidoEn: true,
    cliente: { select: { id: true, nombre: true } },
  } as const;

  private aVista(
    fila: Prisma.SolicitudDocumentoGetPayload<{ select: SolicitudesService['campos'] }>,
  ): SolicitudDocumento {
    // El vencimiento se deriva: una solicitud que sigue SOLICITADO y cuya fecha ya
    // pasó está vencida, sin que nadie tenga que marcarla.
    const vencida = fila.estado === 'SOLICITADO' && fila.fechaLimite < new Date();

    return {
      id: fila.id,
      cliente: fila.cliente,
      documento: fila.documento,
      descripcion: fila.descripcion,
      estado: vencida ? 'VENCIDO' : fila.estado,
      fechaLimite: fila.fechaLimite.toISOString(),
      archivo:
        fila.archivoNombre && fila.archivoTipo
          ? { nombre: fila.archivoNombre, tipo: fila.archivoTipo }
          : null,
      recibidoEn: fila.recibidoEn?.toISOString() ?? null,
    };
  }

  async listar(
    filtro: ParametrosPaginacion & { clienteId?: string; estado?: string },
  ): Promise<RespuestaPaginada<SolicitudDocumento>> {
    const where: Prisma.SolicitudDocumentoWhereInput = {
      deletedAt: null,
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      // «Vencido» no existe en la base: se traduce a «solicitado con fecha pasada».
      ...(filtro.estado === 'VENCIDO'
        ? { estado: 'SOLICITADO' as const, fechaLimite: { lt: new Date() } }
        : filtro.estado === 'SOLICITADO'
          ? { estado: 'SOLICITADO' as const, fechaLimite: { gte: new Date() } }
          : filtro.estado
            ? { estado: filtro.estado as never }
            : {}),
      ...(filtro.busqueda
        ? { documento: { contains: filtro.busqueda, mode: 'insensitive' as const } }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.solicitudDocumento.findMany({
        where,
        select: this.campos,
        orderBy: { fechaLimite: 'asc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.solicitudDocumento.count({ where }),
    ]);

    return {
      datos: datos.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<SolicitudDocumento> {
    const solicitud = await this.prisma.db.solicitudDocumento.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });

    if (!solicitud) throw noEncontrado('la solicitud');
    return this.aVista(solicitud);
  }

  async crear(datos: DatosCrearSolicitud): Promise<SolicitudDocumento> {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id: datos.clienteId, deletedAt: null },
      select: { id: true },
    });
    if (!cliente) throw noEncontrado('el cliente de la solicitud');

    const solicitud = await this.prisma.db.solicitudDocumento.create({
      data: conEmpresaImplicita(datos),
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'SolicitudDocumento',
      entidadId: solicitud.id,
      valorNuevo: this.aVista(solicitud),
    });

    return this.aVista(solicitud);
  }

  /** Recibir el documento cierra la solicitud. */
  async recibir(
    id: string,
    contenido: Buffer,
    nombreOriginal: string,
  ): Promise<SolicitudDocumento> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'RECIBIDO') {
      throw conflicto('Esa solicitud ya está recibida. Crea otra si hace falta un documento más.');
    }

    const empresaId = this.contexto.empresaIdRequerida('documento solicitado');
    const guardado = await this.archivos.guardar(
      empresaId,
      'solicitudes',
      contenido,
      nombreOriginal,
    );

    const solicitud = await this.prisma.db.solicitudDocumento.update({
      where: { id },
      data: {
        estado: 'RECIBIDO',
        archivoClave: guardado.clave,
        archivoNombre: nombreOriginal.slice(0, 200),
        archivoTipo: guardado.tipo,
        recibidoEn: new Date(),
      },
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'SolicitudDocumento',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: this.aVista(solicitud),
    });

    return this.aVista(solicitud);
  }

  async leerArchivo(id: string): Promise<{ archivo: Buffer; nombre: string; tipo: string }> {
    const solicitud = await this.prisma.db.solicitudDocumento.findFirst({
      where: { id, deletedAt: null },
      select: { archivoClave: true, archivoNombre: true, archivoTipo: true },
    });

    if (!solicitud) throw noEncontrado('la solicitud');
    if (!solicitud.archivoClave) throw noEncontrado('el documento de esa solicitud');

    const empresaId = this.contexto.empresaIdRequerida('documento solicitado');
    const archivo = await this.archivos.leer(empresaId, solicitud.archivoClave);

    await this.audit.registrarSinFallar({
      accion: 'EXPORTAR',
      entidad: 'SolicitudDocumento',
      entidadId: id,
      valorNuevo: { archivo: solicitud.archivoNombre },
    });

    return {
      archivo,
      nombre: solicitud.archivoNombre ?? 'documento',
      tipo: solicitud.archivoTipo ?? 'application/octet-stream',
    };
  }

  async eliminar(id: string): Promise<void> {
    const anterior = await this.obtener(id);
    await this.prisma.db.solicitudDocumento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'SolicitudDocumento',
      entidadId: id,
      valorAnterior: anterior,
    });
  }
}
