import { Injectable } from '@nestjs/common';
import type {
  DatosActualizarDestinatario,
  DatosCrearDestinatario,
  Destinatario,
  ParametrosPaginacion,
  RespuestaPaginada,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { CifradoService } from '../../core/crypto/cifrado.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Catálogo de destinatarios de una dispersión: a quién se le gira.
 *
 * Documento y número de cuenta se cifran en reposo. Juntos identifican a una
 * persona y permiten mover plata, así que están en la lista del §5 de
 * docs/SEGURIDAD.md. De vuelta al navegador solo salen los últimos cuatro dígitos:
 * suficiente para que alguien reconozca la cuenta correcta en una lista, inútil
 * para cualquier otra cosa.
 */
@Injectable()
export class DestinatariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cifrado: CifradoService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    nombre: true,
    tipoDoc: true,
    numeroDocFinal: true,
    banco: true,
    tipoCuenta: true,
    cuentaFinal: true,
    activo: true,
  } as const;

  async listar(
    filtro: ParametrosPaginacion & { activo?: boolean },
  ): Promise<RespuestaPaginada<Destinatario>> {
    const where = {
      deletedAt: null,
      ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
      ...(filtro.busqueda
        ? { nombre: { contains: filtro.busqueda, mode: 'insensitive' as const } }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.destinatario.findMany({
        where,
        select: this.campos,
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.destinatario.count({ where }),
    ]);

    return {
      datos: datos as Destinatario[],
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<Destinatario> {
    const destinatario = await this.prisma.db.destinatario.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });

    if (!destinatario) throw noEncontrado('el destinatario');
    return destinatario as Destinatario;
  }

  async crear(datos: DatosCrearDestinatario): Promise<Destinatario> {
    const { numeroDoc, cuenta, ...resto } = datos;
    const numeroDocHash = this.cifrado.hashDocumento(numeroDoc);

    const repetido = await this.prisma.db.destinatario.findFirst({
      where: { numeroDocHash, deletedAt: null },
      select: { nombre: true },
    });
    if (repetido) {
      throw conflicto(`Ese documento ya está registrado a nombre de ${repetido.nombre}.`);
    }

    const destinatario = await this.prisma.db.destinatario.create({
      data: conEmpresaImplicita({
        ...resto,
        numeroDocCifrado: this.cifrado.cifrar(numeroDoc),
        numeroDocHash,
        numeroDocFinal: numeroDoc.slice(-4),
        ...this.camposDeCuenta(cuenta),
      }),
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Destinatario',
      entidadId: destinatario.id,
      valorNuevo: destinatario,
    });

    return destinatario as Destinatario;
  }

  async actualizar(id: string, datos: DatosActualizarDestinatario): Promise<Destinatario> {
    const anterior = await this.obtener(id);
    const { cuenta, ...resto } = datos;

    const destinatario = await this.prisma.db.destinatario.update({
      where: { id },
      data: { ...resto, ...(cuenta === undefined ? {} : this.camposDeCuenta(cuenta)) },
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Destinatario',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: destinatario,
    });

    return destinatario as Destinatario;
  }

  /**
   * Desactivar, no borrar.
   *
   * Un destinatario aparece en el histórico de cada giro que recibió. Borrarlo
   * dejaría dispersiones apuntando a la nada — por eso el histórico guarda su propia
   * copia del nombre y la cuenta, y aquí solo se le quita del catálogo activo.
   */
  async desactivar(id: string): Promise<void> {
    const anterior = await this.obtener(id);

    const enReglas = await this.prisma.db.reglaDispersionDestino.count({
      where: { destinatarioId: id, regla: { activa: true, deletedAt: null } },
    });
    if (enReglas > 0) {
      throw conflicto(
        `Este destinatario está en ${enReglas} regla(s) de dispersión activas. Quítalo de las reglas primero.`,
      );
    }

    await this.prisma.db.destinatario.update({
      where: { id },
      data: { activo: false, deletedAt: new Date() },
    });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'Destinatario',
      entidadId: id,
      valorAnterior: anterior,
    });
  }

  /** La cuenta sigue el mismo trato que el documento: cifrada, más cuatro dígitos. */
  private camposDeCuenta(cuenta: string | undefined) {
    if (!cuenta) return { cuentaCifrada: null, cuentaFinal: null };
    return { cuentaCifrada: this.cifrado.cifrar(cuenta), cuentaFinal: cuenta.slice(-4) };
  }
}
