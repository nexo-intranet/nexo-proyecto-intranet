import { aDecimal, aTexto, redondear, sumar, type Dinero } from '../dinero/index.js';

/**
 * Liquidación de nómina.
 *
 * **Versión documental** (brief, decisión 5, reconfirmada por la clienta el
 * 2026-08-22): los devengados y las deducciones se ingresan a mano y el sistema
 * totaliza. No se calcula seguridad social, prestaciones ni retención.
 *
 * El cálculo vive detrás de una interfaz aunque hoy solo sume, y eso es
 * deliberado. Cuando lleguen las fórmulas —la clienta las quiere en una fase
 * posterior— se agrega otra implementación y no cambia nada más. Si en cambio
 * dejáramos la suma repartida entre el servicio, el controlador y el PDF, para
 * entonces habría que buscarla en tres sitios.
 *
 * Vive en `shared` por la misma razón que `calcularGanancia` y `calcularReparto`:
 * el formulario muestra el neto en vivo con **el mismo código** que después
 * persiste el servidor. Dos implementaciones de la misma suma es de donde salen
 * las diferencias de un peso que nadie sabe explicar.
 */

export class NominaInvalidaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'NominaInvalidaError';
  }
}

export type TipoConcepto = 'DEVENGADO' | 'DEDUCCION';

export interface ConceptoLiquidacion {
  tipo: TipoConcepto;
  /** Texto libre: la clienta escribe el concepto, no lo elige de un catálogo. */
  concepto: string;
  valor: Dinero;
}

export interface LiquidacionCalculada {
  totalDevengado: Dinero;
  totalDeducido: Dinero;
  /** Devengado menos deducido. Puede ser cero; nunca negativo. */
  neto: Dinero;
}

/**
 * Qué hace una calculadora de nómina.
 *
 * Hoy hay una sola implementación —`totalizarManual`— y sirve para lo que el brief
 * pide ahora. La interfaz es el punto de sustitución: una versión con fórmulas
 * recibiría el salario base y los días trabajados y **produciría** los conceptos en
 * vez de recibirlos.
 */
export interface CalculadoraNomina {
  readonly nombre: string;
  liquidar(conceptos: readonly ConceptoLiquidacion[]): LiquidacionCalculada;
}

/**
 * Suma lo que le pasen. Es toda la lógica de la versión documental.
 *
 * Rechaza el neto negativo. Podría dejarlo pasar y guardar un número rojo, pero un
 * recibo donde las deducciones superan a los devengados no es un recibo mal
 * calculado: es un dato mal digitado, y descubrirlo al imprimir el PDF es tarde.
 */
export const totalizarManual: CalculadoraNomina = {
  nombre: 'TotalizadorManual',

  liquidar(conceptos) {
    if (conceptos.length === 0) {
      throw new NominaInvalidaError('El recibo necesita al menos un concepto.');
    }

    for (const { concepto, valor } of conceptos) {
      if (aDecimal(valor).lessThan(0)) {
        throw new NominaInvalidaError(
          `«${concepto}» no puede ser negativo. Para restar, usa una deducción.`,
        );
      }
    }

    const totalDevengado = sumar(
      ...conceptos.filter((c) => c.tipo === 'DEVENGADO').map((c) => aDecimal(c.valor)),
    );
    const totalDeducido = sumar(
      ...conceptos.filter((c) => c.tipo === 'DEDUCCION').map((c) => aDecimal(c.valor)),
    );

    const neto = totalDevengado.minus(totalDeducido);

    if (neto.lessThan(0)) {
      throw new NominaInvalidaError(
        'Las deducciones superan a los devengados: el neto quedaría negativo.',
      );
    }

    return {
      totalDevengado: aTexto(redondear(totalDevengado)),
      totalDeducido: aTexto(redondear(totalDeducido)),
      neto: aTexto(redondear(neto)),
    };
  },
};

/**
 * Conceptos que se sugieren en el formulario.
 *
 * Sugerencias, no catálogo: el campo es editable. Están aquí para que quien liquida
 * escriba en dos teclas lo que pone todos los meses, sin cerrarle la puerta a lo
 * excepcional — que es justo lo que la clienta pidió al decir «solo poner los
 * valores».
 */
export const CONCEPTOS_SUGERIDOS: Record<TipoConcepto, readonly string[]> = {
  DEVENGADO: [
    'Salario básico',
    'Auxilio de transporte',
    'Horas extra',
    'Comisiones',
    'Bonificación',
    'Recargo nocturno',
  ],
  DEDUCCION: [
    'Salud',
    'Pensión',
    'Fondo de solidaridad',
    'Retención en la fuente',
    'Préstamo',
    'Embargo',
  ],
};
