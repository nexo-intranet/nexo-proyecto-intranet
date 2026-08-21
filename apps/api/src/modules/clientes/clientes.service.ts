import { Injectable } from '@nestjs/common';
import type {
  Cliente,
  DatosActualizarCliente,
  DatosCrearCliente,
  FiltroClientes,
  RespuestaPaginada,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { CifradoService } from '../../core/crypto/cifrado.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Clientes.
 *
 * Adelanto mínimo de la Etapa 4: la Operación necesita colgar de alguien. Aquí solo
 * está la identificación; el portafolio y el calendario tributario llegan después.
 *
 * El número de documento es dato personal (Ley 1581): entra en claro, se cifra
 * antes de tocar disco y **nunca vuelve a salir completo**. Lo único indexado es su
 * HMAC, que permite buscar por cédula sin descifrar la tabla entera ni dejar el
 * número legible dentro de un índice.
 */
@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cifrado: CifradoService,
    private readonly audit: AuditService,
  ) {}

  /** Nunca incluye `numeroDocCifrado` ni `numeroDocHash`: no salen del servidor. */
  private readonly campos = {
    id: true,
    nombre: true,
    tipo: true,
    tipoDoc: true,
    numeroDocFinal: true,
    ultimoDigitoNit: true,
    municipio: true,
    email: true,
    telefono: true,
  } as const;

  async listar(filtro: FiltroClientes): Promise<RespuestaPaginada<Cliente>> {
    const where = {
      deletedAt: null,
      ...(filtro.busqueda
        ? { nombre: { contains: filtro.busqueda, mode: 'insensitive' as const } }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.cliente.findMany({
        where,
        select: this.campos,
        orderBy: { nombre: 'asc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.cliente.count({ where }),
    ]);

    return { datos: datos as Cliente[], total, pagina: filtro.pagina, porPagina: filtro.porPagina };
  }

  /**
   * Busca por documento sin descifrar la tabla.
   *
   * El HMAC es determinista —misma cédula, mismo hash— y es lo único indexado. Así
   * se puede buscar por número exacto sin que ese número exista en claro en ningún
   * índice de la base (docs/SEGURIDAD.md §5).
   */
  async buscarPorDocumento(documento: string): Promise<Cliente> {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { numeroDocHash: this.cifrado.hashDocumento(documento), deletedAt: null },
      select: this.campos,
    });

    if (!cliente) throw noEncontrado('un cliente con ese documento');
    return cliente as Cliente;
  }

  async obtener(id: string): Promise<Cliente> {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });

    if (!cliente) throw noEncontrado('el cliente');
    return cliente as Cliente;
  }

  async crear(datos: DatosCrearCliente): Promise<Cliente> {
    const { numeroDoc, ...resto } = datos;
    const numeroDocHash = this.cifrado.hashDocumento(numeroDoc);

    const repetido = await this.prisma.db.cliente.findFirst({
      where: { numeroDocHash, deletedAt: null },
      select: { id: true, nombre: true },
    });
    if (repetido) {
      throw conflicto(`Ese documento ya está registrado a nombre de ${repetido.nombre}.`);
    }

    const cliente = await this.prisma.db.cliente.create({
      data: conEmpresaImplicita({
        ...resto,
        numeroDocCifrado: this.cifrado.cifrar(numeroDoc),
        numeroDocHash,
        numeroDocFinal: numeroDoc.slice(-4),
        // El calendario tributario colombiano se ordena por el último dígito del NIT
        // (Etapa 6). Se guarda al crear para no tener que descifrar para calcularlo.
        ultimoDigitoNit: datos.tipoDoc === 'NIT' ? Number(numeroDoc.slice(-1)) : null,
      }),
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Cliente',
      entidadId: cliente.id,
      valorNuevo: cliente,
    });

    return cliente as Cliente;
  }

  /**
   * El documento no se edita.
   *
   * Cambiarlo convertiría el registro en otra persona conservando su historial de
   * operaciones. Si el documento estaba mal, se crea el cliente correcto.
   */
  async actualizar(id: string, datos: DatosActualizarCliente): Promise<Cliente> {
    const anterior = await this.obtener(id);

    const cliente = await this.prisma.db.cliente.update({
      where: { id },
      data: datos,
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Cliente',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: cliente,
    });

    return cliente as Cliente;
  }

  async desactivar(id: string): Promise<void> {
    const anterior = await this.obtener(id);

    const conOperaciones = await this.prisma.db.operacion.count({
      where: { clienteId: id, deletedAt: null, estado: { not: 'ANULADA' } },
    });
    if (conOperaciones > 0) {
      throw conflicto(
        `No se puede eliminar: el cliente tiene ${conOperaciones} operación(es) registradas.`,
      );
    }

    await this.prisma.db.cliente.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'Cliente',
      entidadId: id,
      valorAnterior: anterior,
    });
  }
}
