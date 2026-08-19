import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfService, type DocumentoPdf } from './pdf.service';

/**
 * Generador de PDF.
 *
 * Lo que se verifica es que el documento se arme y sea un PDF válido; el aspecto
 * se revisa mirándolo. Con `GUARDAR_PDF=1` los archivos quedan en `tmp/` para eso.
 */

const GUARDAR = process.env.GUARDAR_PDF === '1';

const emisor = {
  nombre: 'Comercializadora Andina SAS',
  nit: '890903938',
  digitoVerificacion: 8,
  direccion: 'Carrera 43A 1-50, Torre 2, Oficina 804',
  municipio: 'Medellín',
  telefono: '+57 604 444 5566',
  email: 'contabilidad@andina.com.co',
};

function documentoBase(): DocumentoPdf {
  return {
    emisor,
    tipo: 'Orden de pago',
    consecutivo: 'OP-000042',
    fecha: new Date('2026-08-19T15:00:00Z'),
    datos: [
      { etiqueta: 'Beneficiario', valor: 'Servicios Digitales del Caribe SAS' },
      { etiqueta: 'Documento', valor: 'NIT 900373115-3' },
      { etiqueta: 'Concepto', valor: 'Licencias de software — agosto de 2026' },
      { etiqueta: 'Forma de pago', valor: 'Transferencia electrónica' },
    ],
    columnas: [
      { titulo: 'Descripción', peso: 5 },
      { titulo: 'Cantidad', peso: 1, alineacion: 'right' },
      { titulo: 'Valor unitario', peso: 2, alineacion: 'right' },
      { titulo: 'Total', peso: 2, alineacion: 'right' },
    ],
    filas: [
      ['Licencia anual de plataforma', '3', '$ 1.250.000,00', '$ 3.750.000,00'],
      ['Soporte técnico especializado', '12', '$ 180.000,00', '$ 2.160.000,00'],
      ['Migración de datos históricos', '1', '$ 4.400.000,00', '$ 4.400.000,00'],
    ],
    totales: [
      { etiqueta: 'Subtotal', monto: '10310000.00' },
      { etiqueta: 'IVA 19%', monto: '1958900.00' },
      { etiqueta: 'Total a pagar', monto: '12268900.00', destacado: true },
    ],
    moneda: 'COP',
    notas:
      'Esta orden de pago se emite en cumplimiento del contrato de prestación de servicios. ' +
      'Conserve este documento como soporte contable.',
  };
}

/** Los cuatro primeros bytes de todo PDF son «%PDF». */
function esPdfValido(archivo: Buffer): boolean {
  return archivo.subarray(0, 4).toString() === '%PDF';
}

/**
 * Cuenta las páginas leyendo el árbol de páginas del PDF.
 *
 * Existe porque pdfkit agrega hojas en blanco sin avisar cuando algo se dibuja
 * por debajo del margen inferior, que es justo donde va el pie. Un documento de
 * una página que sale con tres es un defecto que solo se ve contando.
 */
function contarPaginas(archivo: Buffer): number {
  const contenido = archivo.toString('latin1');
  const coincidencias = [
    ...contenido.matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/g),
  ].map((coincidencia) => Number(coincidencia[1]));

  if (coincidencias.length === 0) throw new Error('No se pudo leer el árbol de páginas del PDF');
  return Math.max(...coincidencias);
}

function guardar(nombre: string, archivo: Buffer): void {
  if (!GUARDAR) return;
  const carpeta = join(__dirname, '..', '..', '..', 'tmp');
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, nombre), archivo);
}

describe('PdfService', () => {
  const servicio = new PdfService();

  it('genera un PDF válido y no vacío', async () => {
    const archivo = await servicio.generar(documentoBase());
    guardar('orden-de-pago.pdf', archivo);

    expect(esPdfValido(archivo)).toBe(true);
    expect(archivo.length).toBeGreaterThan(5_000);
    // Este documento cabe en una hoja: si salen más, hay páginas en blanco.
    expect(contarPaginas(archivo)).toBe(1);
  });

  it('marca el documento cuando está anulado', async () => {
    const normal = await servicio.generar(documentoBase());
    const anulado = await servicio.generar({
      ...documentoBase(),
      anuladoPor: 'Error en el valor unitario de las licencias',
    });
    guardar('orden-de-pago-anulada.pdf', anulado);

    expect(esPdfValido(anulado)).toBe(true);
    // La marca de anulación agrega contenido: no puede pasar inadvertida.
    expect(anulado.length).toBeGreaterThan(normal.length);
    // Pero no puede agregar páginas.
    expect(contarPaginas(anulado)).toBe(contarPaginas(normal));
  });

  it('reparte el documento en varias páginas cuando hay muchas filas', async () => {
    const base = documentoBase();
    const muchas = Array.from({ length: 120 }, (_, indice) => [
      `Concepto número ${indice + 1}`,
      '1',
      '$ 100.000,00',
      '$ 100.000,00',
    ]);

    const archivo = await servicio.generar({ ...base, filas: muchas });
    guardar('orden-de-pago-larga.pdf', archivo);

    expect(esPdfValido(archivo)).toBe(true);
    expect(archivo.length).toBeGreaterThan(10_000);

    const paginas = contarPaginas(archivo);
    expect(paginas).toBeGreaterThan(1);
    // 120 filas caben de sobra en cinco hojas: más que eso serían hojas vacías.
    expect(paginas).toBeLessThanOrEqual(5);
  });

  it('se emite aunque el logo esté corrupto', async () => {
    // Un logo mal cargado no puede impedir que salga un documento legal.
    const archivo = await servicio.generar({
      ...documentoBase(),
      emisor: { ...emisor, logo: Buffer.from('esto no es una imagen') },
    });

    expect(esPdfValido(archivo)).toBe(true);
  });

  it('funciona sin tabla ni totales, solo con datos', async () => {
    const base = documentoBase();
    const archivo = await servicio.generar({
      ...base,
      tipo: 'Certificado de ingresos y retenciones',
      consecutivo: 'CI-000007',
      columnas: undefined,
      filas: undefined,
      totales: undefined,
    });
    guardar('certificado.pdf', archivo);

    expect(esPdfValido(archivo)).toBe(true);
  });
});
