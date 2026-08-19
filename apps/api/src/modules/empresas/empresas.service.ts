import { Injectable } from '@nestjs/common';
import type {
  DatosActualizarEmpresa,
  DatosCrearEmpresa,
  Empresa,
  ParametrosPaginacion,
  RespuestaPaginada,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Empresas administradas.
 *
 * Ojo: `EmpresaAdministrada` es la raíz del aislamiento, así que está fuera del
 * filtro automático por `empresaId` —no cuelga de sí misma— y **no tiene RLS**.
 * Todo el control de acceso de este módulo es explícito. Es el único lugar del
 * sistema donde eso es así, y por eso cada consulta lleva su condición a la vista.
 */
@Injectable()
export class EmpresasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    nombre: true,
    nombreComercial: true,
    nit: true,
    digitoVerificacion: true,
    tipoContribuyente: true,
    municipio: true,
    direccion: true,
    telefono: true,
    email: true,
    logoUrl: true,
    esNexo: true,
    activa: true,
  } as const;

  /** Condición de acceso: el administrador ve todas; el resto, solo las asignadas. */
  private accesoDe(usuario: UsuarioAutenticado) {
    return usuario.esAdministrador ? {} : { usuarios: { some: { usuarioId: usuario.id } } };
  }

  /** Alimenta el selector de la barra superior. Solo empresas activas y accesibles. */
  async listarAccesibles(usuario: UsuarioAutenticado): Promise<Empresa[]> {
    return this.prisma.db.empresaAdministrada.findMany({
      where: { deletedAt: null, activa: true, ...this.accesoDe(usuario) },
      select: this.campos,
      orderBy: [{ esNexo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async listar(
    usuario: UsuarioAutenticado,
    parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<Empresa>> {
    const where = {
      deletedAt: null,
      ...this.accesoDe(usuario),
      ...(parametros.busqueda
        ? {
            OR: [
              { nombre: { contains: parametros.busqueda, mode: 'insensitive' as const } },
              { nit: { contains: parametros.busqueda } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.empresaAdministrada.findMany({
        where,
        select: this.campos,
        orderBy: [{ esNexo: 'desc' }, { nombre: 'asc' }],
        skip: (parametros.pagina - 1) * parametros.porPagina,
        take: parametros.porPagina,
      }),
      this.prisma.db.empresaAdministrada.count({ where }),
    ]);

    return { datos, total, pagina: parametros.pagina, porPagina: parametros.porPagina };
  }

  async obtener(id: string, usuario: UsuarioAutenticado): Promise<Empresa> {
    const empresa = await this.prisma.db.empresaAdministrada.findFirst({
      where: { id, deletedAt: null, ...this.accesoDe(usuario) },
      select: this.campos,
    });

    // Sin acceso responde igual que si no existiera: confirmar la existencia de una
    // empresa a la que no se tiene acceso ya es filtrar información.
    if (!empresa) throw noEncontrado('la empresa');
    return empresa;
  }

  async crear(datos: DatosCrearEmpresa): Promise<Empresa> {
    const empresa = await this.prisma.db.empresaAdministrada.create({
      data: { ...datos, esNexo: false },
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'EmpresaAdministrada',
      entidadId: empresa.id,
      valorNuevo: empresa,
    });

    return empresa;
  }

  async actualizar(
    id: string,
    datos: DatosActualizarEmpresa,
    usuario: UsuarioAutenticado,
  ): Promise<Empresa> {
    const anterior = await this.obtener(id, usuario);

    const empresa = await this.prisma.db.empresaAdministrada.update({
      where: { id },
      data: datos,
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'EmpresaAdministrada',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: empresa,
    });

    return empresa;
  }

  /** Soft delete: nada se elimina físicamente (brief §4.4). */
  async desactivar(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const anterior = await this.obtener(id, usuario);

    await this.prisma.db.empresaAdministrada.update({
      where: { id },
      data: { deletedAt: new Date(), activa: false },
    });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'EmpresaAdministrada',
      entidadId: id,
      valorAnterior: anterior,
    });
  }
}
