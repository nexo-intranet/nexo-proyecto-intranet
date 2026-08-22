import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  aDecimal,
  redondear,
  type ContenidoOrdenPago,
  type DatosAnularEgreso,
  type DatosCorregirEgreso,
  type DatosCrearEgreso,
  type EgresoDetalle,
  type EgresoResumen,
  type FiltroEgresos,
  type OrdenPagoResumen,
  type RespuestaPaginada,
  type ResumenEgresos,
  type TipoIntangible,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, documentoAnulado, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { ConsecutivoService } from '../../core/consecutivos/consecutivo.service';
import { ContextoService } from '../../core/context/contexto.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService, type ClientePrisma } from '../../core/prisma/prisma.service';

/**
 * Egresos: pagos por intangibles.
 *
 * Estrena el patrón que después reusan la nómina (etapa 5) y la facturación
 * (etapa 6): **un registro operativo que emite un documento legal con
 * consecutivo**, los dos en la misma transacción. Si algo falla no queda ni el
 * egreso sin documento ni un consecutivo quemado.
 *
 * Dos reglas gobiernan todo lo demás:
 *
 * 1. **La orden congela su contenido al emitirse.** Cambiar mañana la dirección de
 *    la empresa no altera una orden emitida el año pasado. Lo inmutable es lo que
 *    decía el documento, no los bytes del archivo (docs/ETAPA-03.md §1.1).
 * 2. **Corregir un egreso documentado no es editarlo.** Anula la orden vigente y
 *    emite una nueva, con motivo, y las dos quedan en el historial.
 */
@Injectable()
export class EgresosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consecutivos: ConsecutivoService,
    private readonly contexto: ContextoService,
    private readonly audit: AuditService,
  ) {}

  private readonly camposResumen = {
    id: true,
    concepto: true,
    tipoIntangible: true,
    beneficiario: true,
    monto: true,
    moneda: true,
    montoCOP: true,
    fecha: true,
    estado: true,
    ordenes: {
      where: { estado: 'VIGENTE' as const },
      select: { id: true, consecutivo: true },
      take: 1,
    },
  } as const;

  private readonly detalle = {
    ...this.camposResumen,
    descripcion: true,
    tasaCambio: true,
    destinatarioId: true,
    motivoAnulacion: true,
    anuladoEn: true,
    createdAt: true,
  } as const;

  private readonly ordenCompleta = {
    id: true,
    consecutivo: true,
    numero: true,
    estado: true,
    emitidaEn: true,
    motivoAnulacion: true,
    anuladaEn: true,
    emitidaPor: { select: { id: true, nombre: true } },
    reemplazaA: { select: { consecutivo: true } },
  } as const;

  private aResumen(
    fila: Prisma.EgresoGetPayload<{ select: EgresosService['camposResumen'] }>,
  ): EgresoResumen {
    return {
      id: fila.id,
      concepto: fila.concepto,
      tipoIntangible: fila.tipoIntangible,
      beneficiario: fila.beneficiario,
      monto: fila.monto.toFixed(2),
      moneda: fila.moneda,
      montoCOP: fila.montoCOP.toFixed(2),
      fecha: fila.fecha.toISOString(),
      estado: fila.estado,
      ordenVigente: fila.ordenes[0] ?? null,
    };
  }

  private aOrden(
    fila: Prisma.OrdenPagoGetPayload<{ select: EgresosService['ordenCompleta'] }>,
  ): OrdenPagoResumen {
    return {
      id: fila.id,
      consecutivo: fila.consecutivo,
      numero: fila.numero,
      estado: fila.estado,
      emitidaEn: fila.emitidaEn.toISOString(),
      emitidaPor: fila.emitidaPor,
      motivoAnulacion: fila.motivoAnulacion,
      anuladaEn: fila.anuladaEn?.toISOString() ?? null,
      reemplazaA: fila.reemplazaA?.consecutivo ?? null,
    };
  }

  async listar(filtro: FiltroEgresos): Promise<RespuestaPaginada<EgresoResumen>> {
    const where: Prisma.EgresoWhereInput = {
      deletedAt: null,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.tipoIntangible ? { tipoIntangible: filtro.tipoIntangible } : {}),
      ...(filtro.moneda ? { moneda: filtro.moneda } : {}),
      ...(filtro.destinatarioId ? { destinatarioId: filtro.destinatarioId } : {}),
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
              { beneficiario: { contains: filtro.busqueda, mode: 'insensitive' as const } },
              { ordenes: { some: { consecutivo: { contains: filtro.busqueda.toUpperCase() } } } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.egreso.findMany({
        where,
        select: this.camposResumen,
        orderBy: { fecha: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.egreso.count({ where }),
    ]);

    return {
      datos: datos.map((fila) => this.aResumen(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<EgresoDetalle> {
    const egreso = await this.prisma.db.egreso.findFirst({
      where: { id, deletedAt: null },
      select: { ...this.detalle, ordenes: { select: this.ordenCompleta } },
    });

    // 404 y no 403 cuando es de otra empresa: confirmar que existe ya es filtrar.
    if (!egreso) throw noEncontrado('el egreso');

    const vigente = egreso.ordenes.find((orden) => orden.estado === 'VIGENTE');

    return {
      ...this.aResumen({ ...egreso, ordenes: vigente ? [vigente] : [] }),
      descripcion: egreso.descripcion,
      tasaCambio: egreso.tasaCambio?.toString() ?? null,
      destinatarioId: egreso.destinatarioId,
      motivoAnulacion: egreso.motivoAnulacion,
      anuladoEn: egreso.anuladoEn?.toISOString() ?? null,
      createdAt: egreso.createdAt.toISOString(),
      ordenes: [...egreso.ordenes]
        .sort((a, b) => b.numero - a.numero)
        .map((orden) => this.aOrden(orden)),
    };
  }

  /**
   * Registra el egreso y emite su orden de pago, en una sola transacción.
   *
   * El PDF **no se genera aquí**: emitir es asignar el consecutivo y congelar el
   * contenido. Renderizarlo es otra cosa, y hacerla dentro de la transacción solo
   * la haría más lenta y más frágil.
   */
  async crear(datos: DatosCrearEgreso, usuario: UsuarioAutenticado): Promise<EgresoDetalle> {
    if (datos.destinatarioId) await this.verificarDestinatario(datos.destinatarioId);

    const montoCOP = this.aPesos(datos);

    const id = await this.prisma.enTransaccion(async (tx) => {
      const egreso = await tx.egreso.create({
        data: conEmpresaImplicita({ ...datos, montoCOP }),
        select: { id: true },
      });

      await this.emitirOrden(tx, egreso.id, usuario.id, null);
      return egreso.id;
    });

    const egreso = await this.obtener(id);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Egreso',
      entidadId: id,
      valorNuevo: egreso,
    });

    return egreso;
  }

  /**
   * Corregir un egreso ya documentado.
   *
   * No es una edición: anula la orden vigente y emite una nueva. La regla 3 del
   * brief no admite corregir un documento legal en sitio, y dejar el registro y el
   * documento diciendo cosas distintas sería peor que las dos.
   */
  async corregir(
    id: string,
    datos: DatosCorregirEgreso,
    usuario: UsuarioAutenticado,
  ): Promise<EgresoDetalle> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'ANULADO') throw documentoAnulado('El egreso');

    const { motivo, ...cambios } = datos;
    if (cambios.destinatarioId) await this.verificarDestinatario(cambios.destinatarioId);

    // El monto en pesos se recalcula sobre el estado resultante, no sobre lo que
    // llegó: cambiar solo la tasa tiene que rehacer el número completo.
    const montoCOP = this.aPesos({
      monto: cambios.monto ?? anterior.monto,
      moneda: cambios.moneda ?? anterior.moneda,
      tasaCambio: cambios.tasaCambio ?? anterior.tasaCambio ?? undefined,
    });

    await this.prisma.enTransaccion(async (tx) => {
      await tx.egreso.update({ where: { id }, data: { ...cambios, montoCOP } });

      const vigente = await tx.ordenPago.findFirst({
        where: { egresoId: id, estado: 'VIGENTE' },
        select: { id: true },
      });

      if (vigente) {
        await tx.ordenPago.update({
          where: { id: vigente.id },
          data: {
            estado: 'ANULADA',
            motivoAnulacion: `Corrección del egreso: ${motivo}`,
            anuladaEn: new Date(),
            anuladaPorId: usuario.id,
          },
        });
        await this.emitirOrden(tx, id, usuario.id, vigente.id);
      }
    });

    const egreso = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Egreso',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: egreso,
    });

    return egreso;
  }

  /** Anular el egreso y, con él, su orden vigente. */
  async anular(
    id: string,
    datos: DatosAnularEgreso,
    usuario: UsuarioAutenticado,
  ): Promise<EgresoDetalle> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'ANULADO') throw documentoAnulado('El egreso');

    this.exigirConfirmacion(anterior.ordenVigente?.consecutivo, datos.confirmacionConsecutivo);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.egreso.update({
        where: { id },
        data: {
          estado: 'ANULADO',
          motivoAnulacion: datos.motivo,
          anuladoEn: new Date(),
          anuladoPorId: usuario.id,
        },
      });

      await tx.ordenPago.updateMany({
        where: { egresoId: id, estado: 'VIGENTE' },
        data: {
          estado: 'ANULADA',
          motivoAnulacion: datos.motivo,
          anuladaEn: new Date(),
          anuladaPorId: usuario.id,
        },
      });
    });

    const egreso = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ANULAR',
      entidad: 'Egreso',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: egreso,
    });

    return egreso;
  }

  async resumen(rango: { desde?: Date; hasta?: Date }): Promise<ResumenEgresos> {
    const where: Prisma.EgresoWhereInput = {
      deletedAt: null,
      estado: 'REGISTRADO',
      ...(rango.desde || rango.hasta
        ? {
            fecha: {
              ...(rango.desde ? { gte: rango.desde } : {}),
              ...(rango.hasta ? { lte: rango.hasta } : {}),
            },
          }
        : {}),
    };

    const [total, porTipo, porMoneda] = await Promise.all([
      this.prisma.db.egreso.aggregate({ where, _count: true, _sum: { montoCOP: true } }),
      this.prisma.db.egreso.groupBy({
        by: ['tipoIntangible'],
        where,
        _count: true,
        _sum: { montoCOP: true },
      }),
      this.prisma.db.egreso.groupBy({ by: ['moneda'], where, _sum: { monto: true } }),
    ]);

    return {
      cantidad: total._count,
      totalCOP: (total._sum.montoCOP ?? aDecimal('0')).toFixed(2),
      porTipo: porTipo.map((fila) => ({
        tipo: fila.tipoIntangible as TipoIntangible,
        cantidad: fila._count,
        totalCOP: (fila._sum.montoCOP ?? aDecimal('0')).toFixed(2),
      })),
      volumenPorMoneda: porMoneda.map((fila) => ({
        moneda: fila.moneda,
        total: (fila._sum.monto ?? aDecimal('0')).toFixed(2),
      })),
    };
  }

  // ── Interior ──────────────────────────────────────────────────────────────

  /**
   * Emite una orden con su consecutivo y su contenido congelado.
   *
   * Va dentro de la transacción de quien la llama, siempre: `siguienteEn` bloquea la
   * fila del consecutivo hasta que esa transacción termine, y ahí es donde vive la
   * garantía de que dos emisiones simultáneas no se lleven el mismo número.
   */
  private async emitirOrden(
    tx: ClientePrisma,
    egresoId: string,
    usuarioId: string,
    reemplazaAId: string | null,
  ): Promise<void> {
    const empresaId = this.contexto.empresaIdRequerida('orden de pago');

    const [egreso, empresa] = await Promise.all([
      tx.egreso.findFirstOrThrow({
        where: { id: egresoId },
        select: {
          concepto: true,
          tipoIntangible: true,
          descripcion: true,
          beneficiario: true,
          monto: true,
          moneda: true,
          tasaCambio: true,
          montoCOP: true,
          fecha: true,
        },
      }),
      // Sin aislamiento: EmpresaAdministrada es la raíz, no cuelga de sí misma.
      this.prisma.sinAislamiento.empresaAdministrada.findFirstOrThrow({
        where: { id: empresaId },
        select: {
          nombre: true,
          nit: true,
          digitoVerificacion: true,
          direccion: true,
          telefono: true,
          email: true,
          municipio: true,
        },
      }),
    ]);

    const consecutivo = await this.consecutivos.siguienteEn(tx, 'ORDEN_PAGO');

    const contenido: ContenidoOrdenPago = {
      emisor: empresa,
      beneficiario: egreso.beneficiario,
      concepto: egreso.concepto,
      tipoIntangible: egreso.tipoIntangible,
      descripcion: egreso.descripcion,
      monto: egreso.monto.toFixed(2),
      moneda: egreso.moneda,
      tasaCambio: egreso.tasaCambio?.toString() ?? null,
      montoCOP: egreso.montoCOP.toFixed(2),
      fechaEgreso: egreso.fecha.toISOString(),
    };

    await tx.ordenPago.create({
      data: conEmpresaImplicita({
        egresoId,
        consecutivo: consecutivo.texto,
        numero: consecutivo.numero,
        contenido: contenido as unknown as Prisma.InputJsonValue,
        emitidaPorId: usuarioId,
        reemplazaAId,
      }),
      select: { id: true },
    });
  }

  /** Convierte a pesos con la tasa del día del egreso, que queda congelada. */
  private aPesos(datos: { monto: string; moneda: string; tasaCambio?: string | null }): string {
    if (datos.moneda === 'COP') return redondear(aDecimal(datos.monto)).toFixed(2);

    if (!datos.tasaCambio) {
      throw conflicto(
        `Falta la tasa de cambio: el egreso está en ${datos.moneda} y hay que convertirlo a pesos.`,
      );
    }

    return redondear(aDecimal(datos.monto).times(aDecimal(datos.tasaCambio))).toFixed(2);
  }

  private async verificarDestinatario(destinatarioId: string): Promise<void> {
    const existe = await this.prisma.db.destinatario.findFirst({
      where: { id: destinatarioId, deletedAt: null },
      select: { id: true },
    });
    if (!existe) throw noEncontrado('el destinatario del egreso');
  }

  /**
   * La confirmación escrita del consecutivo.
   *
   * Se compara en el servidor, no solo en el formulario: es el control, no la
   * ayuda visual. Escribir «OP-000042» a mano es lo que separa «me equivoqué de
   * fila» de «quiero anular este documento».
   */
  private exigirConfirmacion(real: string | undefined, escrito: string): void {
    if (!real) return; // un egreso sin orden vigente no tiene qué confirmar

    if (escrito.trim().toUpperCase() !== real.toUpperCase()) {
      throw conflicto(
        `El consecutivo escrito no coincide. Para anular hay que escribir «${real}» tal cual.`,
      );
    }
  }
}
