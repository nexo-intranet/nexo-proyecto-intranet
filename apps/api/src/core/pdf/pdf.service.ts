import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { aDecimal, formatear, type Dinero, type Moneda } from '@nexo/shared';

/**
 * Generador de documentos PDF (brief §7).
 *
 * Base común de la orden de pago (Etapa 3), el recibo de nómina (Etapa 5) y la
 * factura (Etapa 6). Tres cosas que valen para los tres documentos:
 *
 *   · **La identidad es la de la empresa administrada, no la de Nexo.** Un recibo
 *     de nómina lo emite la empresa del empleado; que saliera con el membrete de
 *     Nexo sería incorrecto ante la DIAN y ante el empleado.
 *   · Cormorant Garamond en el membrete, que es donde el cliente ve la marca. Los
 *     datos van en una sans: en una tabla de cifras la legibilidad manda.
 *   · Un documento anulado se marca en la cara, no se borra. Quien lo tenga
 *     impreso tiene que poder ver que ya no vale.
 */

const RUTA_FUENTES = join(__dirname, 'fuentes');

const MARGEN = 48;
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

const GRIS_SUAVE = '#78716C';
const NEGRO = '#1C1917';
const BORDE = '#E7E5E4';
const DORADO = '#C4922A';
const ROJO = '#B91C1C';

/** Datos del emisor. Salen de EmpresaAdministrada, no de Nexo. */
export interface EmisorDocumento {
  nombre: string;
  nit: string;
  digitoVerificacion: number;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  municipio: string;
  /** Imagen ya descargada por quien llama: el servicio no hace red. */
  logo?: Buffer | null;
}

export interface ColumnaDocumento {
  titulo: string;
  /** Ancho relativo dentro del ancho útil. */
  peso: number;
  alineacion?: 'left' | 'right';
}

export interface TotalDocumento {
  etiqueta: string;
  monto: Dinero;
  destacado?: boolean;
}

export interface DocumentoPdf {
  emisor: EmisorDocumento;
  /** «Orden de pago», «Recibo de nómina», «Factura de venta». */
  tipo: string;
  consecutivo: string;
  fecha: Date;
  /** Pares etiqueta/valor del encabezado: beneficiario, período, concepto. */
  datos: Array<{ etiqueta: string; valor: string }>;
  columnas?: ColumnaDocumento[];
  filas?: string[][];
  totales?: TotalDocumento[];
  moneda?: Moneda;
  notas?: string;
  /** Motivo de anulación. Su presencia marca el documento como anulado. */
  anuladoPor?: string | null;
}

@Injectable()
export class PdfService {
  async generar(documento: DocumentoPdf): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGEN,
      info: {
        Title: `${documento.tipo} ${documento.consecutivo}`,
        Author: documento.emisor.nombre,
        Creator: 'Intranet Nexo',
      },
      // Sin buffer de páginas no se puede numerar «1 de 3»: la cuenta total solo
      // se conoce cuando el documento ya está armado.
      bufferPages: true,
    });

    doc.registerFont('marca', join(RUTA_FUENTES, 'CormorantGaramond.ttf'));

    const trozos: Buffer[] = [];
    doc.on('data', (trozo: Buffer) => trozos.push(trozo));
    const terminado = new Promise<Buffer>((resolver) => {
      doc.on('end', () => resolver(Buffer.concat(trozos)));
    });

    this.membrete(doc, documento);
    this.encabezadoDocumento(doc, documento);
    if (documento.columnas && documento.filas) {
      this.tabla(doc, documento.columnas, documento.filas);
    }
    if (documento.totales?.length) {
      this.totales(doc, documento.totales, documento.moneda ?? 'COP');
    }
    if (documento.notas) this.notas(doc, documento.notas);
    if (documento.anuladoPor) this.marcaAnulado(doc, documento.anuladoPor);

    this.piesDePagina(doc, documento);

    doc.end();
    return terminado;
  }

  // ── Bloques ───────────────────────────────────────────────────────────────

  private membrete(doc: PDFKit.PDFDocument, { emisor }: DocumentoPdf): void {
    const arriba = doc.y;

    if (emisor.logo) {
      try {
        doc.image(emisor.logo, MARGEN, arriba, { fit: [120, 40] });
      } catch {
        // Un logo corrupto no puede impedir que se emita el documento.
      }
    }

    doc
      .font('marca')
      .fontSize(20)
      .fillColor(NEGRO)
      .text(emisor.nombre, MARGEN, emisor.logo ? arriba + 48 : arriba, { width: ANCHO_UTIL * 0.6 });

    const contacto = [
      `NIT ${emisor.nit}-${emisor.digitoVerificacion}`,
      emisor.direccion,
      emisor.municipio,
      emisor.telefono,
      emisor.email,
    ].filter(Boolean) as string[];

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRIS_SUAVE)
      .text(contacto.join('  ·  '), MARGEN, doc.y + 2, { width: ANCHO_UTIL * 0.7 });

    doc.moveDown(1);
    this.linea(doc);
  }

  private encabezadoDocumento(doc: PDFKit.PDFDocument, documento: DocumentoPdf): void {
    doc.moveDown(0.8);
    const arriba = doc.y;

    doc
      .font('marca')
      .fontSize(16)
      .fillColor(NEGRO)
      .text(documento.tipo.toUpperCase(), MARGEN, arriba, { characterSpacing: 1.5 });

    // El consecutivo va a la derecha y destacado: es lo que se busca primero
    // cuando alguien tiene el documento impreso en la mano.
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(DORADO)
      .text(documento.consecutivo, MARGEN, arriba + 2, { width: ANCHO_UTIL, align: 'right' });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRIS_SUAVE)
      .text(this.fechaLarga(documento.fecha), MARGEN, doc.y + 1, {
        width: ANCHO_UTIL,
        align: 'right',
      });

    doc.moveDown(1);

    for (const dato of documento.datos) {
      const fila = doc.y;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(GRIS_SUAVE)
        .text(dato.etiqueta, MARGEN, fila, { width: 130 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(NEGRO)
        .text(dato.valor, MARGEN + 135, fila, { width: ANCHO_UTIL - 135 });
      doc.moveDown(0.35);
    }

    doc.moveDown(0.6);
  }

  private tabla(doc: PDFKit.PDFDocument, columnas: ColumnaDocumento[], filas: string[][]): void {
    const pesoTotal = columnas.reduce((suma, columna) => suma + columna.peso, 0);
    const anchos = columnas.map((columna) => (columna.peso / pesoTotal) * ANCHO_UTIL);

    const dibujarEncabezado = () => {
      const arriba = doc.y;
      let x = MARGEN;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS_SUAVE);
      columnas.forEach((columna, indice) => {
        doc.text(columna.titulo.toUpperCase(), x, arriba, {
          width: anchos[indice]! - 6,
          align: columna.alineacion ?? 'left',
          characterSpacing: 0.5,
        });
        x += anchos[indice]!;
      });
      doc.y = arriba + 12;
      this.linea(doc);
      doc.moveDown(0.3);
    };

    dibujarEncabezado();

    for (const fila of filas) {
      // Salto de página: la tabla vuelve a encabezarse para que ninguna columna
      // quede sin nombre en la segunda hoja.
      if (doc.y > 720) {
        doc.addPage();
        dibujarEncabezado();
      }

      const arriba = doc.y;
      let x = MARGEN;
      doc.font('Helvetica').fontSize(9).fillColor(NEGRO);
      fila.forEach((celda, indice) => {
        doc.text(celda, x, arriba, {
          width: anchos[indice]! - 6,
          align: columnas[indice]?.alineacion ?? 'left',
        });
        x += anchos[indice]!;
      });
      doc.y = arriba + 14;
    }

    this.linea(doc);
  }

  private totales(doc: PDFKit.PDFDocument, totales: TotalDocumento[], moneda: Moneda): void {
    doc.moveDown(0.5);

    for (const total of totales) {
      const arriba = doc.y;
      const destacado = total.destacado === true;

      doc
        .font(destacado ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(destacado ? 10 : 9)
        .fillColor(destacado ? NEGRO : GRIS_SUAVE)
        .text(total.etiqueta, MARGEN + ANCHO_UTIL * 0.5, arriba, {
          width: ANCHO_UTIL * 0.28,
          align: 'right',
        });

      // El monto pasa por Decimal: aquí no se hace aritmética con números.
      doc
        .font(destacado ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(destacado ? 10 : 9)
        .fillColor(destacado ? NEGRO : GRIS_SUAVE)
        .text(formatear(aDecimal(total.monto), moneda), MARGEN + ANCHO_UTIL * 0.78, arriba, {
          width: ANCHO_UTIL * 0.22,
          align: 'right',
        });

      doc.y = arriba + (destacado ? 16 : 13);
    }
  }

  private notas(doc: PDFKit.PDFDocument, notas: string): void {
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor(GRIS_SUAVE).text(notas, MARGEN, doc.y, {
      width: ANCHO_UTIL,
      align: 'left',
    });
  }

  /**
   * Marca de anulación.
   *
   * Los documentos legales no se borran ni se editan: se anulan (brief §4.3). Un
   * documento anulado que ya se imprimió o se envió por correo sigue circulando,
   * así que la anulación tiene que verse en la cara del papel.
   */
  private marcaAnulado(doc: PDFKit.PDFDocument, motivo: string): void {
    const paginas = doc.bufferedPageRange();

    for (let indice = 0; indice < paginas.count; indice += 1) {
      doc.switchToPage(paginas.start + indice);
      doc.save();
      doc.rotate(-30, { origin: [ANCHO_PAGINA / 2, 400] });
      doc
        .font('Helvetica-Bold')
        .fontSize(64)
        .fillColor(ROJO)
        .opacity(0.16)
        .text('ANULADO', 0, 370, { width: ANCHO_PAGINA, align: 'center' });
      doc.restore();
    }

    doc.switchToPage(paginas.start + paginas.count - 1);
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .opacity(1)
      .font('Helvetica')
      .fontSize(8)
      .fillColor(ROJO)
      .text(`Documento anulado. Motivo: ${motivo}`, MARGEN, doc.page.height - MARGEN - 24, {
        width: ANCHO_UTIL,
        lineBreak: false,
      });
    doc.page.margins.bottom = margenInferior;
  }

  private piesDePagina(doc: PDFKit.PDFDocument, documento: DocumentoPdf): void {
    const paginas = doc.bufferedPageRange();

    for (let indice = 0; indice < paginas.count; indice += 1) {
      doc.switchToPage(paginas.start + indice);

      // pdfkit agrega una página automáticamente cuando se escribe por debajo del
      // margen inferior, y el pie va justo ahí. Se anula el margen mientras se
      // dibuja y se restaura después: sin esto, cada pie genera una hoja en blanco.
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const y = doc.page.height - MARGEN + 6;

      doc.opacity(1).font('Helvetica').fontSize(7).fillColor(GRIS_SUAVE);
      doc.text(
        `${documento.emisor.nombre}  ·  ${documento.tipo} ${documento.consecutivo}`,
        MARGEN,
        y,
        { width: ANCHO_UTIL * 0.7, lineBreak: false },
      );
      doc.text(`Página ${indice + 1} de ${paginas.count}`, MARGEN, y, {
        width: ANCHO_UTIL,
        align: 'right',
        lineBreak: false,
      });

      doc.page.margins.bottom = margenInferior;
    }
  }

  private linea(doc: PDFKit.PDFDocument): void {
    doc
      .moveTo(MARGEN, doc.y)
      .lineTo(MARGEN + ANCHO_UTIL, doc.y)
      .lineWidth(0.5)
      .strokeColor(BORDE)
      .stroke();
  }

  private fechaLarga(fecha: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'long',
    }).format(fecha);
  }
}
