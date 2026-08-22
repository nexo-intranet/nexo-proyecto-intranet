import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aDecimal,
  redondear,
  type CategoriaGasto,
  type DatosActualizarGasto,
  type DatosCrearGasto,
  type FiltroGastos,
  type Gasto,
  type RespuestaPaginada,
  type ResumenGastos,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { ArchivosService } from '../../core/archivos/archivos.service';
import { AuditService } from '../../core/audit/audit.service';
import { ContextoService } from '../../core/context/contexto.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Gastos operativos.
 *
 * A diferencia de un egreso, un gasto **no emite documento**: es un registro
 * contable con su soporte adjunto. El soporte es lo que lo hace deducible ante la
 * DIAN, así que el resumen cuenta aparte los que no lo tienen.
 *
 * La clave del archivo nunca sale del servidor. La respuesta trae el nombre y el
 * tipo —lo que hace falta para mostrar «factura-marzo.pdf»— y el archivo se pide
 * por su propia ruta, que vuelve a verificar permiso y empresa.
 */
@Injectable()
export class GastosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
    private readonly contexto: ContextoService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    categoria: true,
    concepto: true,
    proveedor: true,
    monto: true,
    moneda: true,
    tasaCambio: true,
    montoCOP: true,
    fecha: true,
    deducible: true,
    soporteNombre: true,
    soporteTipo: true,
  } as const;

  private aVista(fila: Prisma.GastoGetPayload<{ select: GastosService['campos'] }>): Gasto {
    return {
      id: fila.id,
      categoria: fila.categoria,
      concepto: fila.concepto,
      proveedor: fila.proveedor,
      monto: fila.monto.toFixed(2),
      moneda: fila.moneda,
      tasaCambio: fila.tasaCambio?.toString() ?? null,
      montoCOP: fila.montoCOP.toFixed(2),
      fecha: fila.fecha.toISOString(),
      deducible: fila.deducible,
      soporte:
        fila.soporteNombre && fila.soporteTipo
          ? { nombre: fila.soporteNombre, tipo: fila.soporteTipo }
          : null,
    };
  }

  async listar(filtro: FiltroGastos): Promise<RespuestaPaginada<Gasto>> {
    const where: Prisma.GastoWhereInput = {
      deletedAt: null,
      ...(filtro.categoria ? { categoria: filtro.categoria } : {}),
      ...(filtro.deducible === undefined ? {} : { deducible: filtro.deducible }),
      ...(filtro.conSoporte === undefined
        ? {}
        : { soporteClave: filtro.conSoporte ? { not: null } : null }),
      ...(filtro.desde || filtro.hasta
        ? {
            fecha: {
              ...(filtro.desde ? { gte: filtro.desde } : {}),
              ...(filtro.hasta ? { lte: filtro.hasta } : {}),
            },
          }
        : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { concepto: { contains: filtro.busqueda, mode: 'insensitive' as const } },
              { proveedor: { contains: filtro.busqueda, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.gasto.findMany({
        where,
        select: this.campos,
        orderBy: { fecha: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.gasto.count({ where }),
    ]);

    return {
      datos: datos.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<Gasto> {
    const gasto = await this.prisma.db.gasto.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });

    // 404 y no 403 cuando es de otra empresa: confirmar que existe ya es filtrar.
    if (!gasto) throw noEncontrado('el gasto');
    return this.aVista(gasto);
  }

  async crear(datos: DatosCrearGasto): Promise<Gasto> {
    const gasto = await this.prisma.db.gasto.create({
      data: conEmpresaImplicita({ ...datos, montoCOP: this.aPesos(datos) }),
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Gasto',
      entidadId: gasto.id,
      valorNuevo: this.aVista(gasto),
    });

    return this.aVista(gasto);
  }

  async actualizar(id: string, datos: DatosActualizarGasto): Promise<Gasto> {
    const anterior = await this.obtener(id);

    // El monto en pesos se recalcula sobre el estado resultante, no sobre lo que
    // llegó: cambiar solo la tasa tiene que rehacer el número completo.
    const montoCOP = this.aPesos({
      monto: datos.monto ?? anterior.monto,
      moneda: datos.moneda ?? anterior.moneda,
      tasaCambio: datos.tasaCambio ?? anterior.tasaCambio ?? undefined,
    });

    const gasto = await this.prisma.db.gasto.update({
      where: { id },
      data: { ...datos, montoCOP },
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Gasto',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: this.aVista(gasto),
    });

    return this.aVista(gasto);
  }

  async eliminar(id: string): Promise<void> {
    const anterior = await this.obtener(id);

    // Soft delete: el archivo se queda. Borrarlo haría irreversible un «eliminar»
    // que en el resto del sistema no lo es.
    await this.prisma.db.gasto.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'Gasto',
      entidadId: id,
      valorAnterior: anterior,
    });
  }

  /** Adjunta o reemplaza el soporte. */
  async adjuntar(id: string, contenido: Buffer, nombreOriginal: string): Promise<Gasto> {
    await this.obtener(id); // 404 antes de escribir nada
    const empresaId = this.contexto.empresaIdRequerida('soporte de gasto');

    const guardado = await this.archivos.guardar(empresaId, 'gastos', contenido, nombreOriginal);

    const gasto = await this.prisma.db.gasto.update({
      where: { id },
      data: {
        soporteClave: guardado.clave,
        soporteNombre: nombreOriginal.slice(0, 200),
        soporteTipo: guardado.tipo,
      },
      select: this.campos,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Gasto',
      entidadId: id,
      valorNuevo: { soporte: nombreOriginal, tipo: guardado.tipo, bytes: guardado.tamano },
    });

    return this.aVista(gasto);
  }

  /**
   * Lee el soporte para servirlo.
   *
   * La consulta pasa por el aislamiento por empresa, así que un gasto ajeno ni
   * siquiera aparece. El servicio de archivos vuelve a comprobar el prefijo de la
   * clave: dos redes en vez de una, porque una fuga aquí es una factura de otra
   * empresa en manos equivocadas.
   */
  async leerSoporte(id: string): Promise<{ archivo: Buffer; nombre: string; tipo: string }> {
    const gasto = await this.prisma.db.gasto.findFirst({
      where: { id, deletedAt: null },
      select: { soporteClave: true, soporteNombre: true, soporteTipo: true },
    });

    if (!gasto) throw noEncontrado('el gasto');
    if (!gasto.soporteClave) throw noEncontrado('el soporte de ese gasto');

    const empresaId = this.contexto.empresaIdRequerida('soporte de gasto');
    const archivo = await this.archivos.leer(empresaId, gasto.soporteClave);

    await this.audit.registrarSinFallar({
      accion: 'EXPORTAR',
      entidad: 'Gasto',
      entidadId: id,
      valorNuevo: { soporte: gasto.soporteNombre },
    });

    return {
      archivo,
      nombre: gasto.soporteNombre ?? 'soporte',
      tipo: gasto.soporteTipo ?? 'application/octet-stream',
    };
  }

  async resumen(rango: { desde?: Date; hasta?: Date }): Promise<ResumenGastos> {
    const where: Prisma.GastoWhereInput = {
      deletedAt: null,
      ...(rango.desde || rango.hasta
        ? {
            fecha: {
              ...(rango.desde ? { gte: rango.desde } : {}),
              ...(rango.hasta ? { lte: rango.hasta } : {}),
            },
          }
        : {}),
    };

    const [total, deducibles, sinSoporte, porCategoria] = await Promise.all([
      this.prisma.db.gasto.aggregate({ where, _count: true, _sum: { montoCOP: true } }),
      this.prisma.db.gasto.aggregate({
        where: { ...where, deducible: true },
        _sum: { montoCOP: true },
      }),
      this.prisma.db.gasto.count({ where: { ...where, soporteClave: null } }),
      this.prisma.db.gasto.groupBy({
        by: ['categoria'],
        where,
        _count: true,
        _sum: { montoCOP: true },
      }),
    ]);

    return {
      cantidad: total._count,
      totalCOP: (total._sum.montoCOP ?? aDecimal('0')).toFixed(2),
      deducibleCOP: (deducibles._sum.montoCOP ?? aDecimal('0')).toFixed(2),
      // Un gasto sin soporte no es deducible ante la DIAN: se cuenta aparte para
      // que alguien pueda ir a buscarlos antes de cerrar el período.
      sinSoporte,
      porCategoria: porCategoria.map((fila) => ({
        categoria: fila.categoria as CategoriaGasto,
        cantidad: fila._count,
        totalCOP: (fila._sum.montoCOP ?? aDecimal('0')).toFixed(2),
      })),
    };
  }

  /** Convierte a pesos con la tasa del día, que queda congelada. */
  private aPesos(datos: { monto: string; moneda: string; tasaCambio?: string | null }): string {
    if (datos.moneda === 'COP') return redondear(aDecimal(datos.monto)).toFixed(2);

    if (!datos.tasaCambio) {
      throw conflicto(
        `Falta la tasa de cambio: el gasto está en ${datos.moneda} y hay que convertirlo a pesos.`,
      );
    }

    return redondear(aDecimal(datos.monto).times(aDecimal(datos.tasaCambio))).toFixed(2);
  }
}
