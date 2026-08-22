import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ETIQUETA_TIPO_CONTRATO,
  ETIQUETA_TIPO_PERIODO,
  formatear,
  totalizarManual,
  type ContenidoRecibo,
  type DatosAnulacion,
  type DatosLiquidar,
  type LiquidacionCalculada,
  type ParametrosPaginacion,
  type ReciboDetalle,
  type ReciboResumen,
  type RespuestaPaginada,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, documentoAnulado, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { ConsecutivoService } from '../../core/consecutivos/consecutivo.service';
import { ContextoService } from '../../core/context/contexto.service';
import { PdfService } from '../../core/pdf/pdf.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Recibos de nómina.
 *
 * Segunda aparición del patrón «registro operativo → documento con consecutivo»,
 * el mismo de Egresos. Liquidar emite el recibo, las dos cosas en una transacción.
 *
 * **El cálculo no vive aquí.** Lo hace `totalizarManual`, en `@nexo/shared`, que es
 * la única implementación de `CalculadoraNomina` que existe hoy. El formulario usa
 * exactamente esa misma función para mostrar el neto mientras se escribe. Cuando la
 * clienta pida fórmulas, se sustituye la implementación y este servicio no cambia.
 */
@Injectable()
export class NominaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consecutivos: ConsecutivoService,
    private readonly contexto: ContextoService,
    private readonly pdf: PdfService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    consecutivo: true,
    numero: true,
    tipoPeriodo: true,
    periodoInicio: true,
    periodoFin: true,
    totalDevengado: true,
    totalDeducido: true,
    neto: true,
    moneda: true,
    estado: true,
    emitidoEn: true,
    motivoAnulacion: true,
    anuladoEn: true,
    hashArchivo: true,
    contenido: true,
    empleado: { select: { id: true, nombre: true, cargo: true } },
    emitidoPor: { select: { id: true, nombre: true } },
    reemplazaA: { select: { consecutivo: true } },
    conceptos: {
      select: { tipo: true, concepto: true, valor: true, orden: true },
      orderBy: { orden: 'asc' as const },
    },
  } as const;

  private aDetalle(
    fila: Prisma.ReciboNominaGetPayload<{ select: NominaService['campos'] }>,
  ): ReciboDetalle {
    return {
      id: fila.id,
      consecutivo: fila.consecutivo,
      numero: fila.numero,
      empleado: fila.empleado,
      tipoPeriodo: fila.tipoPeriodo,
      periodoInicio: fila.periodoInicio.toISOString(),
      periodoFin: fila.periodoFin.toISOString(),
      totalDevengado: fila.totalDevengado.toFixed(2),
      totalDeducido: fila.totalDeducido.toFixed(2),
      neto: fila.neto.toFixed(2),
      moneda: fila.moneda,
      estado: fila.estado,
      emitidoEn: fila.emitidoEn.toISOString(),
      emitidoPor: fila.emitidoPor,
      motivoAnulacion: fila.motivoAnulacion,
      anuladoEn: fila.anuladoEn?.toISOString() ?? null,
      reemplazaA: fila.reemplazaA?.consecutivo ?? null,
      hashArchivo: fila.hashArchivo,
      conceptos: fila.conceptos.map((c) => ({ ...c, valor: c.valor.toFixed(2) })),
    };
  }

  /** Totaliza sin guardar. Es el mismo cálculo que después persiste. */
  previsualizar(datos: DatosLiquidar): LiquidacionCalculada {
    try {
      return totalizarManual.liquidar(datos.conceptos);
    } catch (error) {
      throw conflicto(error instanceof Error ? error.message : 'No se pudo liquidar.');
    }
  }

  async listar(
    filtro: ParametrosPaginacion & {
      empleadoId?: string;
      estado?: 'VIGENTE' | 'ANULADO';
      desde?: Date;
      hasta?: Date;
    },
  ): Promise<RespuestaPaginada<ReciboResumen>> {
    const where: Prisma.ReciboNominaWhereInput = {
      ...(filtro.empleadoId ? { empleadoId: filtro.empleadoId } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            periodoInicio: {
              ...(filtro.desde ? { gte: filtro.desde } : {}),
              ...(filtro.hasta ? { lte: filtro.hasta } : {}),
            },
          }
        : {}),
      ...(filtro.busqueda
        ? {
            OR: [
              { consecutivo: { contains: filtro.busqueda.toUpperCase() } },
              { empleado: { nombre: { contains: filtro.busqueda, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.reciboNomina.findMany({
        where,
        select: this.campos,
        orderBy: { numero: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.reciboNomina.count({ where }),
    ]);

    return {
      datos: filas.map((fila) => this.aDetalle(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<ReciboDetalle> {
    const recibo = await this.prisma.db.reciboNomina.findFirst({
      where: { id },
      select: this.campos,
    });

    if (!recibo) throw noEncontrado('el recibo de nómina');
    return this.aDetalle(recibo);
  }

  /**
   * Liquida un período y emite el recibo, en una sola transacción.
   *
   * Si algo falla no queda ni la liquidación sin documento ni un consecutivo
   * quemado.
   */
  async liquidar(
    empleadoId: string,
    datos: DatosLiquidar,
    usuario: UsuarioAutenticado,
  ): Promise<ReciboDetalle> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId, deletedAt: null },
      select: {
        nombre: true,
        tipoDoc: true,
        numeroDocFinal: true,
        cargo: true,
        tipoContrato: true,
        fechaIngreso: true,
        activo: true,
      },
    });
    if (!empleado) throw noEncontrado('el empleado');

    if (!empleado.activo) {
      throw conflicto(
        'Ese empleado está retirado de la nómina. Reactívalo si hay que liquidarle un período.',
      );
    }

    // Un empleado no puede tener dos recibos vigentes del mismo período. Los
    // anulados sí se repiten, así que el índice único no lo puede expresar solo.
    const yaLiquidado = await this.prisma.db.reciboNomina.findFirst({
      where: {
        empleadoId,
        estado: 'VIGENTE',
        periodoInicio: datos.periodoInicio,
        periodoFin: datos.periodoFin,
      },
      select: { consecutivo: true },
    });
    if (yaLiquidado) {
      throw conflicto(
        `Ese período ya está liquidado en el recibo ${yaLiquidado.consecutivo}. Anúlalo si hay que rehacerlo.`,
      );
    }

    const totales = this.previsualizar(datos);
    const empresa = await this.emisor();

    const contenido: ContenidoRecibo = {
      emisor: empresa,
      empleado: {
        nombre: empleado.nombre,
        tipoDoc: empleado.tipoDoc,
        numeroDocFinal: empleado.numeroDocFinal,
        cargo: empleado.cargo,
        tipoContrato: empleado.tipoContrato,
        fechaIngreso: empleado.fechaIngreso.toISOString(),
      },
      tipoPeriodo: datos.tipoPeriodo,
      periodoInicio: datos.periodoInicio.toISOString(),
      periodoFin: datos.periodoFin.toISOString(),
      conceptos: datos.conceptos.map((c, orden) => ({ ...c, orden })),
      totalDevengado: totales.totalDevengado,
      totalDeducido: totales.totalDeducido,
      neto: totales.neto,
      moneda: datos.moneda,
      // Qué calculadora liquidó. Cuando existan fórmulas, saber cuál importará:
      // dos implementaciones pueden dar números distintos y ser ambas correctas.
      calculadora: totalizarManual.nombre,
    };

    const id = await this.prisma.enTransaccion(async (tx) => {
      const consecutivo = await this.consecutivos.siguienteEn(tx, 'RECIBO_NOMINA');

      const recibo = await tx.reciboNomina.create({
        data: conEmpresaImplicita({
          empleadoId,
          consecutivo: consecutivo.texto,
          numero: consecutivo.numero,
          tipoPeriodo: datos.tipoPeriodo,
          periodoInicio: datos.periodoInicio,
          periodoFin: datos.periodoFin,
          totalDevengado: totales.totalDevengado,
          totalDeducido: totales.totalDeducido,
          neto: totales.neto,
          moneda: datos.moneda,
          contenido: contenido as unknown as Prisma.InputJsonValue,
          emitidoPorId: usuario.id,
        }),
        select: { id: true },
      });

      await tx.conceptoNomina.createMany({
        data: datos.conceptos.map((concepto, orden) =>
          conEmpresaImplicita({ reciboId: recibo.id, ...concepto, orden }),
        ),
      });

      return recibo.id;
    });

    const recibo = await this.obtener(id);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'ReciboNomina',
      entidadId: id,
      valorNuevo: recibo,
    });

    return recibo;
  }

  async anular(
    id: string,
    datos: DatosAnulacion,
    usuario: UsuarioAutenticado,
  ): Promise<ReciboDetalle> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'ANULADO') throw documentoAnulado('El recibo');

    if (datos.confirmacionConsecutivo.trim().toUpperCase() !== anterior.consecutivo.toUpperCase()) {
      throw conflicto(
        `El consecutivo escrito no coincide. Para anular hay que escribir «${anterior.consecutivo}» tal cual.`,
      );
    }

    await this.prisma.db.reciboNomina.update({
      where: { id },
      data: {
        estado: 'ANULADO',
        motivoAnulacion: datos.motivo,
        anuladoEn: new Date(),
        anuladoPorId: usuario.id,
      },
    });

    const recibo = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ANULAR',
      entidad: 'ReciboNomina',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: recibo,
    });

    return recibo;
  }

  /**
   * Genera el PDF desde el snapshot.
   *
   * Cambiar hoy el cargo del empleado no altera un recibo de marzo: lo que se
   * imprime sale de `contenido`, congelado al emitir.
   */
  async generarPdf(id: string): Promise<{ archivo: Buffer; nombre: string }> {
    const recibo = await this.prisma.db.reciboNomina.findFirst({
      where: { id },
      select: {
        id: true,
        consecutivo: true,
        contenido: true,
        hashArchivo: true,
        motivoAnulacion: true,
        emitidoEn: true,
      },
    });
    if (!recibo) throw noEncontrado('el recibo de nómina');

    const c = recibo.contenido as unknown as ContenidoRecibo;

    const archivo = await this.pdf.generar({
      emisor: { ...c.emisor, logo: null },
      tipo: 'Recibo de nómina',
      consecutivo: recibo.consecutivo,
      fecha: recibo.emitidoEn,
      datos: [
        { etiqueta: 'Empleado', valor: c.empleado.nombre },
        { etiqueta: 'Documento', valor: `${c.empleado.tipoDoc} •••• ${c.empleado.numeroDocFinal}` },
        { etiqueta: 'Cargo', valor: c.empleado.cargo },
        { etiqueta: 'Contrato', valor: ETIQUETA_TIPO_CONTRATO[c.empleado.tipoContrato] },
        {
          etiqueta: 'Período',
          valor: `${ETIQUETA_TIPO_PERIODO[c.tipoPeriodo]} · ${new Date(
            c.periodoInicio,
          ).toLocaleDateString('es-CO')} a ${new Date(c.periodoFin).toLocaleDateString('es-CO')}`,
        },
      ],
      columnas: [
        { titulo: 'Concepto', peso: 3 },
        { titulo: 'Devengado', peso: 1, alineacion: 'right' },
        { titulo: 'Deducido', peso: 1, alineacion: 'right' },
      ],
      filas: c.conceptos.map((concepto) => [
        concepto.concepto,
        concepto.tipo === 'DEVENGADO' ? formatear(concepto.valor, c.moneda) : '',
        concepto.tipo === 'DEDUCCION' ? formatear(concepto.valor, c.moneda) : '',
      ]),
      totales: [
        { etiqueta: 'Total devengado', monto: c.totalDevengado },
        { etiqueta: 'Total deducido', monto: c.totalDeducido },
        { etiqueta: 'Neto a pagar', monto: c.neto, destacado: true },
      ],
      moneda: c.moneda,
      anuladoPor: recibo.motivoAnulacion,
    });

    if (!recibo.hashArchivo) {
      const hash = createHash('sha256').update(archivo).digest('hex');
      await this.prisma.db.reciboNomina.update({ where: { id }, data: { hashArchivo: hash } });
    }

    await this.audit.registrarSinFallar({
      accion: 'EXPORTAR',
      entidad: 'ReciboNomina',
      entidadId: id,
      valorNuevo: { consecutivo: recibo.consecutivo },
    });

    return { archivo, nombre: `${recibo.consecutivo}.pdf` };
  }

  /** Los datos de la empresa administrada, que son los que van en el documento. */
  private async emisor(): Promise<ContenidoRecibo['emisor']> {
    const empresaId = this.contexto.empresaIdRequerida('recibo de nómina');

    // Sin aislamiento: EmpresaAdministrada es la raíz, no cuelga de sí misma.
    return this.prisma.sinAislamiento.empresaAdministrada.findFirstOrThrow({
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
    });
  }
}
