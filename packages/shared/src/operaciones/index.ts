import { Decimal, aDecimal, aTexto, redondear, type Dinero } from '../dinero/index.js';
import type { Moneda } from '../enums/index.js';

/**
 * Ganancia de una operación.
 *
 * El brief la exige calculada y **persistida al guardar**, no derivada en cada
 * lectura (§5). La razón no es rendimiento: es que las tasas quedan congeladas al
 * momento de la operación. Recalcular hoy una operación del año pasado con la tasa
 * de hoy cambiaría un resultado que ya se reportó.
 *
 * Se lleva todo a pesos porque es la moneda en la que Nexo reporta. Compra y venta
 * pueden estar en monedas distintas —ahí está el negocio—, y cada una trae su
 * propia tasa.
 */

export class OperacionInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'OperacionInvalidaError';
  }
}

export interface LadoOperacion {
  /** Lo que se pagó o se recibió, en su moneda. */
  valor: Dinero;
  moneda: Moneda;
  /** Pesos por unidad de `moneda`. Obligatoria salvo que la moneda ya sea COP. */
  tasa?: Dinero | null;
}

export interface GananciaCalculada {
  compraCOP: Dinero;
  ventaCOP: Dinero;
  gananciaCOP: Dinero;
  /** Margen sobre la compra, en porcentaje. Null cuando la compra es cero. */
  margen: Dinero | null;
}

/** Convierte un lado de la operación a pesos con su tasa congelada. */
function aPesos(lado: LadoOperacion, nombre: string): Decimal {
  const valor = aDecimal(lado.valor);

  if (valor.lessThan(0)) {
    throw new OperacionInvalidaError(`El valor de ${nombre} no puede ser negativo.`);
  }

  if (lado.moneda === 'COP') return redondear(valor);

  if (lado.tasa === undefined || lado.tasa === null || lado.tasa === '') {
    throw new OperacionInvalidaError(
      `Falta la tasa de cambio de ${nombre}: el valor está en ${lado.moneda} y hay que convertirlo a pesos.`,
    );
  }

  const tasa = aDecimal(lado.tasa);
  if (tasa.lessThanOrEqualTo(0)) {
    throw new OperacionInvalidaError(`La tasa de ${nombre} debe ser mayor que cero.`);
  }

  return redondear(valor.times(tasa));
}

/**
 * Calcula la ganancia en pesos.
 *
 * La ganancia puede ser negativa: una operación puede cerrarse en pérdida, y el
 * sistema tiene que poder registrarla. Ocultarla o rechazarla sería falsear la
 * contabilidad.
 */
export function calcularGanancia(compra: LadoOperacion, venta: LadoOperacion): GananciaCalculada {
  const compraCOP = aPesos(compra, 'la compra');
  const ventaCOP = aPesos(venta, 'la venta');
  const ganancia = ventaCOP.minus(compraCOP);

  return {
    compraCOP: aTexto(compraCOP),
    ventaCOP: aTexto(ventaCOP),
    gananciaCOP: aTexto(ganancia),
    margen: compraCOP.isZero()
      ? null
      : ganancia.dividedBy(compraCOP).times(100).toDecimalPlaces(2).toFixed(2),
  };
}

/**
 * Formato de un hash para mostrarlo en una tabla densa.
 *
 * Un hash completo ocupa 66 caracteres y hace ilegible la fila. Se muestran los
 * extremos, que es lo que una persona compara de verdad cuando verifica contra un
 * explorador de bloques.
 */
export function abreviarHash(hash: string, inicio = 10, fin = 8): string {
  if (hash.length <= inicio + fin + 1) return hash;
  return `${hash.slice(0, inicio)}…${hash.slice(-fin)}`;
}

/** Longitud mínima para buscar por prefijo sin devolver medio universo. */
export const MIN_PREFIJO_HASH = 8;

/**
 * ¿Esto que pegaron parece un hash?
 *
 * Lo usa la paleta de comandos para decidir si buscar una operación o filtrar
 * módulos. Deliberadamente laxo: cada red tiene su formato, y rechazar por forma
 * dejaría fuera al usuario que pega algo válido de una cadena que no previmos.
 */
export function pareceHash(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < MIN_PREFIJO_HASH) return false;
  return /^(0x)?[0-9a-fA-F]{8,}$/.test(limpio) || /^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(limpio);
}

/** Normaliza un hash para guardarlo y compararlo: sin espacios y en minúscula. */
export function normalizarHash(hash: string): string {
  return hash.trim().toLowerCase();
}
