import { TIPOS_OBLIGACION, type TipoObligacion } from '../esquemas/contabilidad.js';
import { TIPOS_CONTRIBUYENTE, type TipoContribuyente } from '../enums/index.js';

/**
 * Interpretar el calendario tributario que llega en una hoja de cálculo.
 *
 * La DIAN publica el calendario en un PDF y en la práctica alguien lo pasa a Excel.
 * Aquí se lee el CSV que sale de «Guardar como» —no el `.xlsx`— porque leer el
 * formato binario de Excel en el navegador cuesta una librería de cientos de
 * kilobytes, y el paso que se ahorra es un menú.
 *
 * Vive en `shared` y no en el componente por dos razones. La primera es que se
 * puede probar: son cuarenta filas que definen fechas legales de todo un año y un
 * error de interpretación aquí se convierte en una declaración presentada tarde. La
 * segunda es que el día que esta carga se haga desde el servidor —un archivo que
 * llega por correo, por ejemplo— la regla ya está escrita una sola vez.
 *
 * Lo que **no** hace es validar: eso ya lo hace `filaCalendarioEsquema` en el
 * servidor, y duplicar la validación en el navegador es garantizar que las dos
 * versiones se separen. Aquí solo se traduce texto a campos, y se dice qué líneas
 * no se pudieron traducir.
 */

export interface FilaCalendarioLeida {
  tipoObligacion: TipoObligacion;
  ultimoDigito: number;
  tipoContribuyente?: TipoContribuyente;
  codigoDaneMunicipio?: string;
  /** ISO `YYYY-MM-DD`. */
  fechaLimite: string;
  descripcion?: string;
}

export interface LecturaCalendario {
  filas: FilaCalendarioLeida[];
  /** Una entrada por línea que no se pudo leer, con su número tal como se ve en Excel. */
  errores: Array<{ linea: number; mensaje: string }>;
}

/** Quita tildes y mayúsculas para comparar encabezados y valores escritos a mano. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Encabezados que se aceptan para cada campo.
 *
 * Generosos a propósito: quien arma la hoja escribe «Día» o «Ultimo digito», y
 * rechazar la carga por el encabezado es la clase de fricción que termina en que
 * alguien pegue las fechas a mano.
 */
const ENCABEZADOS: Record<keyof FilaCalendarioLeida, string[]> = {
  tipoObligacion: ['obligacion', 'tipo', 'tipo de obligacion', 'impuesto', 'concepto'],
  ultimoDigito: ['digito', 'ultimo digito', 'ultimo digito del nit', 'nit', 'terminacion'],
  tipoContribuyente: ['contribuyente', 'tipo de contribuyente', 'tipo contribuyente'],
  codigoDaneMunicipio: ['municipio', 'codigo dane', 'dane', 'codigo del municipio'],
  fechaLimite: ['fecha', 'fecha limite', 'vence', 'vencimiento', 'plazo'],
  descripcion: ['descripcion', 'nota', 'observacion', 'detalle'],
};

/** Sinónimos de cada obligación, para que la hoja pueda decir «Renta» o «RENTA». */
const OBLIGACIONES: Array<[TipoObligacion, string[]]> = [
  ['RENTA', ['renta', 'impuesto de renta', 'declaracion de renta']],
  [
    'RETENCIONES',
    ['retenciones', 'retencion', 'retefuente', 'retencion en la fuente', 'reteica', 'reteiva'],
  ],
  ['ICA', ['ica', 'industria y comercio', 'industria comercio']],
  ['EXOGENA', ['exogena', 'informacion exogena', 'medios magneticos']],
];

function leerObligacion(valor: string): TipoObligacion | null {
  const texto = normalizar(valor);
  if (!texto) return null;

  for (const [tipo, sinonimos] of OBLIGACIONES) {
    if (sinonimos.includes(texto)) return tipo;
  }

  // Un «Renta personas naturales» tiene que caer en RENTA sin que haya que listarlo.
  for (const [tipo, sinonimos] of OBLIGACIONES) {
    if (sinonimos.some((sinonimo) => texto.startsWith(sinonimo))) return tipo;
  }

  return TIPOS_OBLIGACION.find((tipo) => normalizar(tipo) === texto) ?? null;
}

function leerContribuyente(valor: string): TipoContribuyente | null {
  const texto = normalizar(valor);
  if (!texto) return null;

  const directo = TIPOS_CONTRIBUYENTE.find((tipo) => normalizar(tipo) === texto);
  if (directo) return directo;

  if (texto.startsWith('juridica') || texto.includes('persona juridica')) return 'PERSONA_JURIDICA';
  if (texto.startsWith('natural') || texto.includes('persona natural')) return 'PERSONA_NATURAL';
  if (texto.includes('gran contribuyente')) return 'GRAN_CONTRIBUYENTE';
  if (texto.includes('simple')) return 'REGIMEN_SIMPLE';

  return null;
}

/**
 * Fechas: ISO y el formato que escribe un teclado colombiano.
 *
 * `15/04/2031` es día/mes/año aquí y mes/día/año en la configuración regional de
 * Estados Unidos. Se interpreta siempre como día/mes: es lo que teclea quien arma
 * esta hoja, y adivinar por el valor —«si el primero es mayor que 12 es el día»—
 * acertaría en las fechas ambiguas por casualidad y fallaría en silencio en el
 * resto.
 */
function leerFecha(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) return validarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (local) return validarFecha(Number(local[3]), Number(local[2]), Number(local[1]));

  return null;
}

function validarFecha(anio: number, mes: number, dia: number): string | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  // Un 31 de abril se convierte en 1 de mayo sin avisar. Comparar de vuelta es la
  // forma barata de no aceptar una fecha que no existe.
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Parte una línea de CSV respetando las comillas.
 *
 * Hace falta porque una descripción legítima —«Grandes contribuyentes, primera
 * cuota»— trae una coma dentro, y partir por comas a secas correría todas las
 * columnas siguientes.
 */
function partirLinea(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i]!;

    if (caracter === '"') {
      // Dos comillas seguidas dentro de un campo son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }

    if (caracter === separador && !entreComillas) {
      celdas.push(actual);
      actual = '';
      continue;
    }

    actual += caracter;
  }

  celdas.push(actual);
  return celdas.map((celda) => celda.trim());
}

/**
 * El separador lo decide la configuración regional de quien exportó el archivo.
 *
 * Excel en español usa punto y coma, porque la coma es el separador decimal. Se
 * detecta contando en la primera línea en vez de preguntarle a la persona.
 */
function detectarSeparador(encabezado: string): string {
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ',';
  let maximo = 0;

  for (const candidato of candidatos) {
    const cuantos = encabezado.split(candidato).length - 1;
    if (cuantos > maximo) {
      maximo = cuantos;
      mejor = candidato;
    }
  }

  return mejor;
}

export function interpretarCalendarioCsv(contenido: string): LecturaCalendario {
  const lineas = contenido
    .replace(/^\ufeff/, '') // Excel escribe un BOM que rompe el primer encabezado
    .split(/\r?\n/);

  const indicePrimera = lineas.findIndex((linea) => linea.trim() !== '');
  if (indicePrimera === -1) {
    return { filas: [], errores: [{ linea: 1, mensaje: 'El archivo está vacío.' }] };
  }

  const separador = detectarSeparador(lineas[indicePrimera]!);
  const encabezado = partirLinea(lineas[indicePrimera]!, separador).map(normalizar);

  const columna: Partial<Record<keyof FilaCalendarioLeida, number>> = {};
  for (const [campo, alias] of Object.entries(ENCABEZADOS) as Array<
    [keyof FilaCalendarioLeida, string[]]
  >) {
    const indice = encabezado.findIndex((titulo) => alias.includes(titulo));
    if (indice !== -1) columna[campo] = indice;
  }

  const faltantes = (['tipoObligacion', 'ultimoDigito', 'fechaLimite'] as const).filter(
    (campo) => columna[campo] === undefined,
  );

  if (faltantes.length > 0) {
    return {
      filas: [],
      errores: [
        {
          linea: indicePrimera + 1,
          mensaje:
            'La primera fila tiene que nombrar las columnas. Faltan: ' +
            faltantes
              .map((campo) =>
                campo === 'tipoObligacion'
                  ? 'obligación'
                  : campo === 'ultimoDigito'
                    ? 'dígito'
                    : 'fecha',
              )
              .join(', ') +
            '.',
        },
      ],
    };
  }

  const filas: FilaCalendarioLeida[] = [];
  const errores: LecturaCalendario['errores'] = [];

  for (let i = indicePrimera + 1; i < lineas.length; i += 1) {
    const linea = lineas[i]!;
    if (linea.trim() === '') continue;

    const numero = i + 1; // el número que se ve en Excel, no el índice del arreglo
    const celdas = partirLinea(linea, separador);
    const celda = (campo: keyof FilaCalendarioLeida): string =>
      columna[campo] === undefined ? '' : (celdas[columna[campo]!] ?? '');

    const tipoObligacion = leerObligacion(celda('tipoObligacion'));
    if (!tipoObligacion) {
      errores.push({
        linea: numero,
        mensaje: `No se reconoce la obligación «${celda('tipoObligacion')}».`,
      });
      continue;
    }

    const digitoTexto = celda('ultimoDigito').trim();
    const ultimoDigito = Number(digitoTexto);
    if (!/^\d$/.test(digitoTexto) || !Number.isInteger(ultimoDigito)) {
      errores.push({
        linea: numero,
        mensaje: `El último dígito debe ser un número del 0 al 9, y llegó «${digitoTexto}».`,
      });
      continue;
    }

    const fechaLimite = leerFecha(celda('fechaLimite'));
    if (!fechaLimite) {
      errores.push({
        linea: numero,
        mensaje: `No se entiende la fecha «${celda('fechaLimite')}». Usa 15/04/2031 o 2031-04-15.`,
      });
      continue;
    }

    const fila: FilaCalendarioLeida = { tipoObligacion, ultimoDigito, fechaLimite };

    const contribuyente = leerContribuyente(celda('tipoContribuyente'));
    if (contribuyente) fila.tipoContribuyente = contribuyente;

    // El municipio solo aplica al ICA; el servidor lo rechaza en cualquier otra
    // obligación, así que una columna llena de más no vuelve inválida la carga.
    const municipio = celda('codigoDaneMunicipio').trim();
    if (tipoObligacion === 'ICA' && /^\d{5}$/.test(municipio)) {
      fila.codigoDaneMunicipio = municipio;
    } else if (tipoObligacion === 'ICA' && municipio !== '') {
      errores.push({
        linea: numero,
        mensaje: `El código DANE del municipio tiene cinco dígitos, y llegó «${municipio}».`,
      });
      continue;
    }

    const descripcion = celda('descripcion').trim();
    if (descripcion) fila.descripcion = descripcion.slice(0, 200);

    filas.push(fila);
  }

  return { filas, errores };
}
