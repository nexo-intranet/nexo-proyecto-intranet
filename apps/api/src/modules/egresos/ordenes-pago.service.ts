import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ETIQUETA_TIPO_INTANGIBLE,
  type ContenidoOrdenPago,
  type DatosAnularEgreso,
  type DatosReemitirOrden,
  type OrdenPagoDetalle,
  type OrdenPagoResumen,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { ConsecutivoService } from '../../core/consecutivos/consecutivo.service';
import { PdfService } from '../../core/pdf/pdf.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Órdenes de pago: el documento legal de un egreso.
 *
 * El PDF se **regenera desde el snapshot** cada vez que alguien lo pide, no se lee
 * de un archivo guardado. Lo inmutable es lo que decía el documento el día que se
 * emitió —eso está congelado en `contenido`—, no los bytes (docs/ETAPA-03.md §1.1).
 *
 * Al generarlo se guarda el `sha256` la primera vez, así que si un día hace falta
 * demostrar que el archivo no cambió, la constancia está.
 */
@Injectable()
export class OrdenesPagoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly consecutivos: ConsecutivoService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    egresoId: true,
    consecutivo: true,
    numero: true,
    estado: true,
    contenido: true,
    hashArchivo: true,
    emitidaEn: true,
    motivoAnulacion: true,
    anuladaEn: true,
    emitidaPor: { select: { id: true, nombre: true } },
    reemplazaA: { select: { consecutivo: true } },
  } as const;

  private aVista(
    fila: Prisma.OrdenPagoGetPayload<{ select: OrdenesPagoService['campos'] }>,
  ): OrdenPagoDetalle {
    return {
      id: fila.id,
      egresoId: fila.egresoId,
      consecutivo: fila.consecutivo,
      numero: fila.numero,
      estado: fila.estado,
      emitidaEn: fila.emitidaEn.toISOString(),
      emitidaPor: fila.emitidaPor,
      motivoAnulacion: fila.motivoAnulacion,
      anuladaEn: fila.anuladaEn?.toISOString() ?? null,
      reemplazaA: fila.reemplazaA?.consecutivo ?? null,
      contenido: fila.contenido as unknown as ContenidoOrdenPago,
      hashArchivo: fila.hashArchivo,
    };
  }

  async listar(
    filtro: ParametrosPaginacion & { estado?: 'VIGENTE' | 'ANULADA'; desde?: Date; hasta?: Date },
  ): Promise<RespuestaPaginada<OrdenPagoResumen>> {
    const where: Prisma.OrdenPagoWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            emitidaEn: {
              ...(filtro.desde ? { gte: filtro.desde } : {}),
              ...(filtro.hasta ? { lte: filtro.hasta } : {}),
            },
          }
        : {}),
      ...(filtro.busqueda ? { consecutivo: { contains: filtro.busqueda.toUpperCase() } } : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.ordenPago.findMany({
        where,
        select: this.campos,
        orderBy: { numero: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.ordenPago.count({ where }),
    ]);

    return {
      datos: filas.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<OrdenPagoDetalle> {
    const orden = await this.prisma.db.ordenPago.findFirst({
      where: { id },
      select: this.campos,
    });

    if (!orden) throw noEncontrado('la orden de pago');
    return this.aVista(orden);
  }

  /**
   * Genera el PDF desde el snapshot.
   *
   * Cambiar hoy la dirección de la empresa no altera este documento: el emisor que
   * se imprime sale de `contenido`, congelado el día de la emisión, no de la tabla
   * de empresas.
   */
  async generarPdf(id: string): Promise<{ archivo: Buffer; nombre: string }> {
    const orden = await this.obtener(id);
    const c = orden.contenido;

    const archivo = await this.pdf.generar({
      emisor: { ...c.emisor, logo: null },
      tipo: 'Orden de pago',
      consecutivo: orden.consecutivo,
      fecha: new Date(orden.emitidaEn),
      datos: [
        { etiqueta: 'Beneficiario', valor: c.beneficiario },
        { etiqueta: 'Concepto', valor: c.concepto },
        { etiqueta: 'Tipo', valor: ETIQUETA_TIPO_INTANGIBLE[c.tipoIntangible] },
        {
          etiqueta: 'Fecha del egreso',
          valor: new Date(c.fechaEgreso).toLocaleDateString('es-CO'),
        },
        ...(c.tasaCambio ? [{ etiqueta: 'Tasa de cambio', valor: c.tasaCambio }] : []),
      ],
      totales: [
        ...(c.moneda !== 'COP' ? [{ etiqueta: `Valor en ${c.moneda}`, monto: c.monto }] : []),
        { etiqueta: 'Valor a pagar', monto: c.montoCOP, destacado: true },
      ],
      moneda: 'COP',
      notas: c.descripcion ?? undefined,
      // Su presencia marca el documento como anulado, con una marca de agua.
      anuladoPor: orden.motivoAnulacion,
    });

    // El hash se guarda la primera vez que se genera: deja constancia del archivo
    // exacto sin obligar a calcularlo en cada descarga.
    if (!orden.hashArchivo) {
      const hash = createHash('sha256').update(archivo).digest('hex');
      await this.prisma.db.ordenPago.update({ where: { id }, data: { hashArchivo: hash } });
    }

    await this.audit.registrarSinFallar({
      accion: 'EXPORTAR',
      entidad: 'OrdenPago',
      entidadId: id,
      valorNuevo: { consecutivo: orden.consecutivo },
    });

    return { archivo, nombre: `${orden.consecutivo}.pdf` };
  }

  /** Anula solo el documento. El egreso sigue vigente y puede reemitirse. */
  async anular(
    id: string,
    datos: DatosAnularEgreso,
    usuario: UsuarioAutenticado,
  ): Promise<OrdenPagoDetalle> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'ANULADA') throw conflicto('Esa orden ya está anulada.');

    if (datos.confirmacionConsecutivo.trim().toUpperCase() !== anterior.consecutivo.toUpperCase()) {
      throw conflicto(
        `El consecutivo escrito no coincide. Para anular hay que escribir «${anterior.consecutivo}» tal cual.`,
      );
    }

    await this.prisma.db.ordenPago.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        motivoAnulacion: datos.motivo,
        anuladaEn: new Date(),
        anuladaPorId: usuario.id,
      },
    });

    const orden = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ANULAR',
      entidad: 'OrdenPago',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: orden,
    });

    return orden;
  }

  /**
   * Emite una orden nueva por el mismo egreso, encadenada a la anulada.
   *
   * Una anulada se reemite **una sola vez**: `reemplazaAId` es único en el esquema,
   * así que un segundo intento chocaría contra el índice. Se comprueba antes para
   * dar un mensaje que se entienda en vez del error crudo de PostgreSQL.
   */
  async reemitir(
    id: string,
    datos: DatosReemitirOrden,
    usuario: UsuarioAutenticado,
  ): Promise<OrdenPagoDetalle> {
    const anulada = await this.obtener(id);

    if (anulada.estado !== 'ANULADA') {
      throw conflicto('Solo se reemite una orden anulada. Anúlala primero, con su motivo.');
    }

    const yaReemitida = await this.prisma.db.ordenPago.findFirst({
      where: { reemplazaAId: id },
      select: { consecutivo: true },
    });
    if (yaReemitida) {
      throw conflicto(`Esa orden ya fue reemitida como ${yaReemitida.consecutivo}.`);
    }

    const egreso = await this.prisma.db.egreso.findFirst({
      where: { id: anulada.egresoId, deletedAt: null },
      select: { estado: true },
    });
    if (!egreso) throw noEncontrado('el egreso de la orden');
    if (egreso.estado === 'ANULADO') {
      throw conflicto('El egreso está anulado: no tiene sentido reemitir su orden de pago.');
    }

    const nuevaId = await this.prisma.enTransaccion(async (tx) => {
      const consecutivo = await this.consecutivos.siguienteEn(tx, 'ORDEN_PAGO');

      // El contenido se copia tal cual de la anulada: reemitir es volver a expedir
      // el mismo documento con número nuevo, no rehacerlo con datos de hoy. Si lo
      // que cambió son los datos, eso es corregir el egreso, y va por otra puerta.
      const nueva = await tx.ordenPago.create({
        data: conEmpresaImplicita({
          egresoId: anulada.egresoId,
          consecutivo: consecutivo.texto,
          numero: consecutivo.numero,
          contenido: anulada.contenido as unknown as Prisma.InputJsonValue,
          emitidaPorId: usuario.id,
          reemplazaAId: id,
        }),
        select: { id: true },
      });

      return nueva.id;
    });

    const orden = await this.obtener(nuevaId);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'OrdenPago',
      entidadId: nuevaId,
      valorNuevo: { ...orden, motivoReemision: datos.motivo, reemplazaA: anulada.consecutivo },
    });

    return orden;
  }
}
