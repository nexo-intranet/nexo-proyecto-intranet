import { Injectable } from '@nestjs/common';
import {
  ETIQUETA_TIPO_CONTRATO,
  ETIQUETA_TIPO_DOCUMENTO_LABORAL,
  aDecimal,
  formatear,
  type DatosEmitirDocumento,
  type DocumentoLaboral,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { ContextoService } from '../../core/context/contexto.service';
import { PdfService } from '../../core/pdf/pdf.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Carta laboral y certificado de ingresos.
 *
 * **No se congelan, y esa es la diferencia con el recibo de nómina.** Un recibo
 * documenta un hecho del pasado: lo que se pagó en marzo se pagó en marzo. Una carta
 * laboral certifica un estado **actual** —«esta persona trabaja aquí, en este
 * cargo»—, así que si la piden otra vez en junio, la respuesta correcta es la de
 * junio, no una copia de la de marzo. Congelarla sería el error, no la garantía.
 *
 * Por eso aquí no hay consecutivo ni snapshot: se genera al vuelo y solo queda
 * constancia de que se emitió, con quién y cuándo. Eso sí interesa, para poder
 * responder «¿cuándo le dimos la última carta a esta persona?».
 */
@Injectable()
export class DocumentosLaboralesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexto: ContextoService,
    private readonly pdf: PdfService,
    private readonly audit: AuditService,
  ) {}

  async historial(empleadoId: string): Promise<DocumentoLaboral[]> {
    const filas = await this.prisma.db.documentoLaboral.findMany({
      where: { empleadoId },
      select: {
        id: true,
        tipo: true,
        anio: true,
        emitidoEn: true,
        emitidoPor: { select: { id: true, nombre: true } },
      },
      orderBy: { emitidoEn: 'desc' },
      take: 50,
    });

    return filas.map((fila) => ({ ...fila, emitidoEn: fila.emitidoEn.toISOString() }));
  }

  /**
   * Emite el documento y devuelve el PDF de una vez.
   *
   * Se registra y se genera en el mismo paso porque no tiene sentido separarlos:
   * nadie «emite» una carta laboral para descargarla después — la pide y se la
   * lleva. El registro existe para el historial, no como paso intermedio.
   */
  async emitir(
    empleadoId: string,
    datos: DatosEmitirDocumento,
    usuario: UsuarioAutenticado,
  ): Promise<{ archivo: Buffer; nombre: string }> {
    const empleado = await this.prisma.db.empleado.findFirst({
      where: { id: empleadoId, deletedAt: null },
      select: {
        nombre: true,
        tipoDoc: true,
        numeroDocFinal: true,
        cargo: true,
        salarioBase: true,
        moneda: true,
        tipoContrato: true,
        fechaIngreso: true,
        fechaRetiro: true,
        activo: true,
      },
    });
    if (!empleado) throw noEncontrado('el empleado');

    const empresa = await this.emisor();

    const documento =
      datos.tipo === 'CARTA_LABORAL'
        ? await this.cartaLaboral(empresa, empleado)
        : await this.certificadoIngresos(empresa, empleado, empleadoId, datos.anio!);

    await this.prisma.db.documentoLaboral.create({
      data: conEmpresaImplicita({
        empleadoId,
        tipo: datos.tipo,
        anio: datos.anio ?? null,
        emitidoPorId: usuario.id,
      }),
      select: { id: true },
    });

    await this.audit.registrar({
      accion: 'EXPORTAR',
      entidad: 'DocumentoLaboral',
      entidadId: empleadoId,
      valorNuevo: { tipo: datos.tipo, anio: datos.anio ?? null, empleado: empleado.nombre },
    });

    return documento;
  }

  /**
   * La carta laboral, con los datos de hoy.
   *
   * TODO [CONFIRMAR] El brief dice «desde plantilla». Esta primera versión trae el
   * texto fijo en código. Hacerlo editable por el usuario es un módulo de plantillas
   * y es alcance de la Etapa 10.
   */
  private async cartaLaboral(
    emisor: Emisor,
    empleado: DatosEmpleado,
  ): Promise<{ archivo: Buffer; nombre: string }> {
    const desde = empleado.fechaIngreso.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const cuerpo = empleado.activo
      ? `Por medio de la presente se certifica que ${empleado.nombre}, identificado(a) con ` +
        `${empleado.tipoDoc} terminada en ${empleado.numeroDocFinal}, labora en esta empresa ` +
        `desde el ${desde}, desempeñando el cargo de ${empleado.cargo} bajo contrato de ` +
        `${ETIQUETA_TIPO_CONTRATO[empleado.tipoContrato].toLowerCase()}, con una asignación ` +
        `básica mensual de ${formatear(empleado.salarioBase.toFixed(2), empleado.moneda)}.`
      : `Por medio de la presente se certifica que ${empleado.nombre}, identificado(a) con ` +
        `${empleado.tipoDoc} terminada en ${empleado.numeroDocFinal}, laboró en esta empresa ` +
        `desde el ${desde} hasta el ${empleado.fechaRetiro?.toLocaleDateString('es-CO') ?? '—'}, ` +
        `desempeñando el cargo de ${empleado.cargo}.`;

    const archivo = await this.pdf.generar({
      emisor: { ...emisor, logo: null },
      tipo: ETIQUETA_TIPO_DOCUMENTO_LABORAL.CARTA_LABORAL,
      // Sin consecutivo: no es un documento de la serie fiscal. Se imprime la fecha,
      // que es lo que de verdad acota la vigencia de una certificación.
      consecutivo: new Date().toLocaleDateString('es-CO'),
      fecha: new Date(),
      datos: [
        { etiqueta: 'Empleado', valor: empleado.nombre },
        { etiqueta: 'Documento', valor: `${empleado.tipoDoc} •••• ${empleado.numeroDocFinal}` },
        { etiqueta: 'Cargo', valor: empleado.cargo },
      ],
      notas: `${cuerpo}\n\nSe expide a solicitud del interesado.`,
    });

    return { archivo, nombre: `carta-laboral-${empleado.numeroDocFinal}.pdf` };
  }

  /**
   * El certificado de ingresos y retenciones de un año.
   *
   * Se arma sumando los recibos **vigentes** del año. Los anulados no cuentan, que es
   * justo por lo que se anulan.
   */
  private async certificadoIngresos(
    emisor: Emisor,
    empleado: DatosEmpleado,
    empleadoId: string,
    anio: number,
  ): Promise<{ archivo: Buffer; nombre: string }> {
    const desde = new Date(Date.UTC(anio, 0, 1));
    const hasta = new Date(Date.UTC(anio, 11, 31, 23, 59, 59));

    const recibos = await this.prisma.db.reciboNomina.findMany({
      where: {
        empleadoId,
        estado: 'VIGENTE',
        periodoInicio: { gte: desde, lte: hasta },
      },
      select: {
        totalDevengado: true,
        totalDeducido: true,
        neto: true,
        moneda: true,
        conceptos: { select: { tipo: true, concepto: true, valor: true } },
      },
    });

    if (recibos.length === 0) {
      throw conflicto(`No hay recibos vigentes de ${anio} para este empleado.`);
    }

    // Agrupado por concepto: es lo que el certificado tiene que discriminar, no el
    // detalle recibo por recibo.
    const porConcepto = new Map<string, { tipo: string; total: ReturnType<typeof aDecimal> }>();

    for (const recibo of recibos) {
      for (const linea of recibo.conceptos) {
        const previo = porConcepto.get(linea.concepto);
        porConcepto.set(linea.concepto, {
          tipo: linea.tipo,
          total: (previo?.total ?? aDecimal('0')).plus(aDecimal(linea.valor.toFixed(2))),
        });
      }
    }

    const moneda = recibos[0]!.moneda;
    const totalDevengado = recibos.reduce(
      (suma, r) => suma.plus(aDecimal(r.totalDevengado.toFixed(2))),
      aDecimal('0'),
    );
    const totalDeducido = recibos.reduce(
      (suma, r) => suma.plus(aDecimal(r.totalDeducido.toFixed(2))),
      aDecimal('0'),
    );

    const archivo = await this.pdf.generar({
      emisor: { ...emisor, logo: null },
      tipo: `${ETIQUETA_TIPO_DOCUMENTO_LABORAL.CERTIFICADO_INGRESOS} ${anio}`,
      consecutivo: String(anio),
      fecha: new Date(),
      datos: [
        { etiqueta: 'Empleado', valor: empleado.nombre },
        { etiqueta: 'Documento', valor: `${empleado.tipoDoc} •••• ${empleado.numeroDocFinal}` },
        { etiqueta: 'Cargo', valor: empleado.cargo },
        { etiqueta: 'Períodos liquidados', valor: String(recibos.length) },
      ],
      columnas: [
        { titulo: 'Concepto', peso: 3 },
        { titulo: 'Devengado', peso: 1, alineacion: 'right' },
        { titulo: 'Deducido', peso: 1, alineacion: 'right' },
      ],
      filas: [...porConcepto.entries()].map(([concepto, dato]) => [
        concepto,
        dato.tipo === 'DEVENGADO' ? formatear(dato.total.toFixed(2), moneda) : '',
        dato.tipo === 'DEDUCCION' ? formatear(dato.total.toFixed(2), moneda) : '',
      ]),
      totales: [
        { etiqueta: 'Total devengado', monto: totalDevengado.toFixed(2) },
        { etiqueta: 'Total deducido', monto: totalDeducido.toFixed(2) },
        {
          etiqueta: 'Neto recibido',
          monto: totalDevengado.minus(totalDeducido).toFixed(2),
          destacado: true,
        },
      ],
      moneda,
      notas:
        `Certificado construido a partir de los ${recibos.length} recibos de nómina vigentes ` +
        `del año ${anio}. Los recibos anulados no se incluyen.`,
    });

    return { archivo, nombre: `certificado-ingresos-${anio}-${empleado.numeroDocFinal}.pdf` };
  }

  private async emisor(): Promise<Emisor> {
    const empresaId = this.contexto.empresaIdRequerida('documento laboral');

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

type Emisor = {
  nombre: string;
  nit: string;
  digitoVerificacion: number;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  municipio: string;
};

type DatosEmpleado = {
  nombre: string;
  tipoDoc: string;
  numeroDocFinal: string;
  cargo: string;
  salarioBase: { toFixed(decimales: number): string };
  moneda: 'COP' | 'USD' | 'USDT';
  tipoContrato: keyof typeof ETIQUETA_TIPO_CONTRATO;
  fechaIngreso: Date;
  fechaRetiro: Date | null;
  activo: boolean;
};
