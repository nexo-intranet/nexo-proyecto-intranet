import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { MONEDAS_FIAT, type Moneda } from '../enums/index.js';

/**
 * Dinero.
 *
 * Regla no negociable del brief (§4.1): el dinero jamás toca `float`. En la base de
 * datos es `Decimal`, en TypeScript es `Decimal` de decimal.js, y **en JSON viaja
 * como string**. Un `number` en un camino de dinero es un bug, no un detalle.
 *
 * Por eso `aDecimal` no acepta `number`: el error se vuelve imposible de escribir
 * en vez de quedar sujeto a que alguien lo recuerde en la revisión.
 */

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});

export { Decimal };

/** Representación canónica del dinero al cruzar la red. */
export type Dinero = string;

/** Decimales de cada tipo de moneda, igual que en el esquema de Prisma. */
export const DECIMALES_FIAT = 2;
export const DECIMALES_CRIPTO = 18;

export function decimalesDe(moneda: Moneda): number {
  return MONEDAS_FIAT.includes(moneda) ? DECIMALES_FIAT : DECIMALES_CRIPTO;
}

const FORMATO_MONTO = /^-?\d+(\.\d+)?$/;

/**
 * Convierte a Decimal. Rechaza `number` a propósito: si tienes un number, ya
 * perdiste precisión antes de llegar aquí.
 */
export function aDecimal(valor: Dinero | Decimal): Decimal {
  if (valor instanceof Decimal) return valor;
  if (typeof valor !== 'string' || !FORMATO_MONTO.test(valor)) {
    throw new TypeError(
      `Monto inválido: se esperaba un string numérico y llegó "${String(valor)}"`,
    );
  }
  return new Decimal(valor);
}

/** Serializa para enviar por la red o guardar. Nunca usar `Number()` sobre esto. */
export function aTexto(valor: Decimal | Dinero, moneda: Moneda = 'COP'): Dinero {
  return aDecimal(valor).toFixed(decimalesDe(moneda));
}

export function redondear(valor: Decimal | Dinero, moneda: Moneda = 'COP'): Decimal {
  return aDecimal(valor).toDecimalPlaces(decimalesDe(moneda), Decimal.ROUND_HALF_UP);
}

export function sumar(...valores: Array<Decimal | Dinero>): Decimal {
  return valores.reduce<Decimal>(
    (acumulado, valor) => acumulado.plus(aDecimal(valor)),
    new Decimal(0),
  );
}

export function restar(a: Decimal | Dinero, b: Decimal | Dinero): Decimal {
  return aDecimal(a).minus(aDecimal(b));
}

export function multiplicar(a: Decimal | Dinero, b: Decimal | Dinero): Decimal {
  return aDecimal(a).times(aDecimal(b));
}

export function esCero(valor: Decimal | Dinero): boolean {
  return aDecimal(valor).isZero();
}

export function sonIguales(a: Decimal | Dinero, b: Decimal | Dinero): boolean {
  return aDecimal(a).equals(aDecimal(b));
}

/**
 * Convierte a la moneda de reporte con una tasa congelada al momento de la
 * operación. El brief (§4.2) prohíbe recalcular con la tasa de hoy: por eso la
 * tasa es un parámetro obligatorio y no se lee de ningún lado.
 */
export function convertir(
  monto: Decimal | Dinero,
  tasaCambio: Decimal | Dinero,
  monedaDestino: Moneda = 'COP',
): Decimal {
  return redondear(multiplicar(monto, tasaCambio), monedaDestino);
}

/** Formato para mostrar: `$ 1.234.567,89`. Solo para la interfaz, nunca para calcular. */
export function formatear(valor: Decimal | Dinero, moneda: Moneda = 'COP'): string {
  if (MONEDAS_FIAT.includes(moneda)) {
    // El `Number()` aquí es seguro y deliberado: ya está redondeado a dos decimales
    // y el resultado solo se pinta en pantalla. Nunca vuelve a un cálculo.
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(redondear(valor, moneda).toFixed(DECIMALES_FIAT)));
  }

  // Cripto: se muestra tal cual, sin pasar por Intl, para no perder decimales.
  return `${aDecimal(valor).toFixed()} ${moneda}`;
}

/** Esquema Zod para cualquier campo de dinero que entra por la API. */
export const dineroEsquema = z
  .string({ required_error: 'El monto es obligatorio' })
  .regex(FORMATO_MONTO, 'El monto debe ser un número válido')
  .refine((valor) => aDecimal(valor).isFinite(), 'El monto no es un número válido');

export const dineroPositivoEsquema = dineroEsquema.refine(
  (valor) => aDecimal(valor).greaterThan(0),
  'El monto debe ser mayor que cero',
);
