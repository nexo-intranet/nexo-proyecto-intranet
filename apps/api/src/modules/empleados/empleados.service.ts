import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aDecimal,
  type DatosActualizarEmpleado,
  type DatosCrearEmpleado,
  type Empleado,
  type FiltroEmpleados,
  type RespuestaPaginada,
  type ResumenEmpleado,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { CifradoService } from '../../core/crypto/cifrado.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Empleados de la empresa administrada.
 *
 * El documento de identidad se cifra en reposo, igual que en Cliente y
 * Destinatario: es un dato personal (Ley 1581, docs/SEGURIDAD.md §5). De vuelta al
 * navegador solo salen los últimos cuatro dígitos.
 */
@Injectable()
export class EmpleadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cifrado: CifradoService,
    private readonly audit: AuditService,
  ) {}

  /** Nunca incluye `numeroDocCifrado` ni `numeroDocHash`: no salen del servidor. */
  private readonly campos = {
    id: true,
    nombre: true,
    tipoDoc: true,
    numeroDocFinal: true,
    cargo: true,
    salarioBase: true,
    moneda: true,
    tipoContrato: true,
    fechaIngreso: true,
    fechaRetiro: true,
    email: true,
    telefono: true,
    direccion: true,
    activo: true,
  } as const;

  private aVista(
    fila: Prisma.EmpleadoGetPayload<{ select: EmpleadosService['campos'] }>,
  ): Empleado {
    return {
      ...fila,
      salarioBase: fila.salarioBase.toFixed(2),
      fechaIngreso: fila.fechaIngreso.toISOString(),
      fechaRetiro: fila.fechaRetiro?.toISOString() ?? null,
    };
  }

  async listar(filtro: FiltroEmpleados): Promise<RespuestaPaginada<Empleado>> {
    const where: Prisma.EmpleadoWhereInput = {
      deletedAt: null,
      ...(filtro.activo === undefined ? {} : { activo: filtro.activo }),
      ...(filtro.tipoContrato ? { tipoContrato: filtro.tipoContrato } : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { nombre: { contains: filtro.busqueda, mode: 'insensitive' as const } },
              { cargo: { contains: filtro.busqueda, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.empleado.findMany({
        where,
        select: this.campos,
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.empleado.count({ where }),
    ]);

    return {
      datos: datos.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<Empleado> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });

    // 404 y no 403 cuando es de otra empresa: confirmar que existe ya es filtrar.
    if (!empleado) throw noEncontrado('el empleado');
    return this.aVista(empleado);
  }

  /** Busca por documento sin descifrar la tabla: compara el HMAC. */
  async buscarPorDocumento(documento: string): Promise<Empleado> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { numeroDocHash: this.cifrado.hashDocumento(documento), deletedAt: null },
      select: this.campos,
    });

    if (!empleado) throw noEncontrado('un empleado con ese documento');
    return this.aVista(empleado);
  }

  async crear(datos: DatosCrearEmpleado): Promise<Empleado> {
    const { numeroDoc, ...resto } = datos;
    const numeroDocHash = this.cifrado.hashDocumento(numeroDoc);

    const repetido = await this.prisma.db.empleado.findFirst({
      where: { numeroDocHash, deletedAt: null },
      select: { nombre: true },
    });
    if (repetido) {
      throw conflicto(`Ese documento ya está registrado a nombre de ${repetido.nombre}.`);
    }

    const empleado = await this.prisma.db.empleado.create({
      data: conEmpresaImplicita({
        ...resto,
        numeroDocCifrado: this.cifrado.cifrar(numeroDoc),
        numeroDocHash,
        numeroDocFinal: numeroDoc.slice(-4),
      }),
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Empleado',
      entidadId: empleado.id,
      valorNuevo: this.aVista(empleado),
    });

    return this.aVista(empleado);
  }

  async actualizar(id: string, datos: DatosActualizarEmpleado): Promise<Empleado> {
    const anterior = await this.obtener(id);

    const empleado = await this.prisma.db.empleado.update({
      where: { id },
      data: datos,
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Empleado',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: this.aVista(empleado),
    });

    return this.aVista(empleado);
  }

  /**
   * Retirar de la nómina.
   *
   * Marca `activo = false`, no borra. Un empleado retirado no aparece al liquidar,
   * pero sus recibos siguen siendo suyos y su historial consultable — que es lo
   * primero que alguien mira cuando pide un certificado de un año anterior.
   */
  async desactivar(id: string): Promise<void> {
    const anterior = await this.obtener(id);
    if (!anterior.activo) return;

    await this.prisma.db.empleado.update({ where: { id }, data: { activo: false } });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Empleado',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: { ...anterior, activo: false },
    });
  }

  /** Cuántos recibos y cuánto se le ha pagado. Cabecera de su ficha. */
  async resumen(id: string): Promise<ResumenEmpleado> {
    await this.obtener(id);

    const where = { empleadoId: id, estado: 'VIGENTE' as const };

    const [agregado, ultimo] = await Promise.all([
      this.prisma.db.reciboNomina.aggregate({ where, _count: true, _sum: { neto: true } }),
      this.prisma.db.reciboNomina.findFirst({
        where,
        orderBy: { periodoFin: 'desc' },
        select: { periodoFin: true },
      }),
    ]);

    return {
      recibos: agregado._count,
      netoAcumulado: (agregado._sum.neto ?? aDecimal('0')).toFixed(2),
      ultimoRecibo: ultimo?.periodoFin.toISOString() ?? null,
    };
  }
}
