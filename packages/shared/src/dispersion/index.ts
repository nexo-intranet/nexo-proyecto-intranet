import { Decimal, aDecimal, aTexto, redondear, sumar, type Dinero } from '../dinero/index.js';

/**
 * Reparto de una dispersión.
 *
 * El brief es explícito: *«el sistema reparte entre destinos según reglas
 * configuradas (monto fijo o porcentaje). Debe validar que la suma cuadre con el
 * total antes de permitir guardar»*.
 *
 * Vive en `shared` para que el formulario previsualice con **exactamente el mismo
 * cálculo** que después ejecuta el servidor. Si el navegador hiciera su propia
 * cuenta, ahí es donde aparecen las diferencias de un peso que después nadie sabe
 * explicarle a un contador.
 */

export type TipoReparto = 'PORCENTAJE' | 'MONTO_FIJO';

export interface DestinoReparto {
  /** Identifica el destino; no se interpreta aquí. */
  referencia: string;
  /** Orden de aplicación. El de mayor orden absorbe el residuo del redondeo. */
  orden: number;
  /** Uno u otro según el tipo de reparto; el que no aplica va indefinido. */
  porcentaje?: Dinero;
  montoFijo?: Dinero;
}

export interface DestinoCalculado {
  referencia: string;
  orden: number;
  monto: Dinero;
  porcentaje?: Dinero;
  /** Cuánto del residuo de redondeo absorbió este destino. Casi siempre "0.00". */
  ajuste: Dinero;
}

export interface RepartoCalculado {
  destinos: DestinoCalculado[];
  total: Dinero;
  /** Suma de los destinos. Con un reparto válido es idéntica al total. */
  asignado: Dinero;
  /** Total menos asignado. Cero cuando cuadra. */
  diferencia: Dinero;
  cuadra: boolean;
}

export class RepartoInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RepartoInvalidoError';
  }
}

const CIEN = new Decimal(100);

/**
 * Calcula el reparto y deja la cuenta cuadrada al centavo.
 *
 * **La regla del residuo.** Repartir 10.000.000 entre tres al 33,3333 % da
 * 9.999.990: sobran 10 pesos que no pueden quedar flotando en un sistema contable.
 * Cada destino se redondea hacia abajo y **el residuo completo se suma al destino de
 * mayor orden**. Es determinista, se le puede explicar a un contador, y garantiza que
 * la suma de los destinos sea exactamente el total.
 */
export function calcularReparto(
  total: Dinero,
  tipo: TipoReparto,
  destinos: readonly DestinoReparto[],
): RepartoCalculado {
  if (destinos.length === 0) {
    throw new RepartoInvalidoError('Una dispersión necesita al menos un destino.');
  }

  const montoTotal = aDecimal(total);
  if (montoTotal.lessThanOrEqualTo(0)) {
    throw new RepartoInvalidoError('El monto total debe ser mayor que cero.');
  }

  const ordenados = [...destinos].sort((a, b) => a.orden - b.orden);

  const calculados =
    tipo === 'PORCENTAJE'
      ? repartirPorPorcentaje(montoTotal, ordenados)
      : repartirPorMontoFijo(ordenados);

  const asignado = sumar(...calculados.map((destino) => destino.monto));
  const diferencia = montoTotal.minus(asignado);

  return {
    destinos: calculados,
    total: aTexto(montoTotal),
    asignado: aTexto(asignado),
    diferencia: aTexto(diferencia),
    cuadra: diferencia.isZero(),
  };
}

function repartirPorPorcentaje(
  total: Decimal,
  destinos: readonly DestinoReparto[],
): DestinoCalculado[] {
  const sumaPorcentajes = destinos.reduce(
    (acumulado, destino) => acumulado.plus(aDecimal(destino.porcentaje ?? '0')),
    new Decimal(0),
  );

  if (!sumaPorcentajes.equals(CIEN)) {
    throw new RepartoInvalidoError(
      `Los porcentajes deben sumar 100 %. Suman ${sumaPorcentajes.toFixed(4)} %.`,
    );
  }

  // Cada monto se trunca hacia abajo, nunca se redondea al más cercano: si se
  // redondeara, el residuo podría ser negativo y el último destino recibiría menos
  // de lo que le corresponde por su porcentaje.
  const preliminares = destinos.map((destino) => {
    const porcentaje = aDecimal(destino.porcentaje ?? '0');
    const monto = total.times(porcentaje).dividedBy(CIEN).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    return { destino, monto };
  });

  const asignado = preliminares.reduce(
    (acumulado, fila) => acumulado.plus(fila.monto),
    new Decimal(0),
  );
  const residuo = total.minus(asignado);
  const ultimo = preliminares.length - 1;

  return preliminares.map((fila, indice) => {
    const absorbeResiduo = indice === ultimo;
    const monto = absorbeResiduo ? fila.monto.plus(residuo) : fila.monto;

    return {
      referencia: fila.destino.referencia,
      orden: fila.destino.orden,
      monto: aTexto(monto),
      porcentaje: aTexto(aDecimal(fila.destino.porcentaje ?? '0')),
      ajuste: aTexto(absorbeResiduo ? residuo : new Decimal(0)),
    };
  });
}

function repartirPorMontoFijo(destinos: readonly DestinoReparto[]): DestinoCalculado[] {
  return destinos.map((destino) => {
    if (destino.montoFijo === undefined) {
      throw new RepartoInvalidoError(`El destino ${destino.referencia} no tiene monto asignado.`);
    }

    const monto = redondear(destino.montoFijo);
    if (monto.lessThanOrEqualTo(0)) {
      throw new RepartoInvalidoError(
        `El monto del destino ${destino.referencia} debe ser mayor que cero.`,
      );
    }

    return {
      referencia: destino.referencia,
      orden: destino.orden,
      monto: aTexto(monto),
      ajuste: aTexto(new Decimal(0)),
    };
  });
}

/**
 * Mensaje para la interfaz cuando el reparto no cuadra.
 *
 * Dice cuánto falta o cuánto sobra, no solo que está mal: quien está armando la
 * dispersión necesita el número para corregirlo, no un regaño.
 */
export function explicarDiferencia(reparto: RepartoCalculado): string | null {
  if (reparto.cuadra) return null;

  const diferencia = aDecimal(reparto.diferencia);
  const magnitud = aTexto(diferencia.abs());

  return diferencia.greaterThan(0)
    ? `Faltan ${magnitud} por asignar.`
    : `Se asignaron ${magnitud} de más.`;
}
