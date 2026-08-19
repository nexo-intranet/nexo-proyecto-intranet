import { describe, expect, it } from 'vitest';
import { aDecimal, sumar } from '../dinero/index.js';
import {
  RepartoInvalidoError,
  calcularReparto,
  explicarDiferencia,
  type DestinoReparto,
} from './index.js';

/**
 * Reparto de dispersión.
 *
 * El brief exige pruebas aquí (§4.15). Lo que se verifica no es que 50 % de 100 sean
 * 50, sino los casos donde la aritmética decimal se rompe: porcentajes que no dividen
 * exacto, montos de un centavo, y sumas que no llegan o se pasan del total.
 *
 * La afirmación que se repite en casi todas: **la suma de los destinos es exactamente
 * el total**. Si eso falla, hay plata que se giró de más o que nadie recibió.
 */

const porcentaje = (referencia: string, orden: number, valor: string): DestinoReparto => ({
  referencia,
  orden,
  porcentaje: valor,
});

const fijo = (referencia: string, orden: number, valor: string): DestinoReparto => ({
  referencia,
  orden,
  montoFijo: valor,
});

describe('reparto por porcentaje', () => {
  it('reparte en partes iguales cuando divide exacto', () => {
    const reparto = calcularReparto('10000000.00', 'PORCENTAJE', [
      porcentaje('a', 1, '50'),
      porcentaje('b', 2, '50'),
    ]);

    expect(reparto.cuadra).toBe(true);
    expect(reparto.destinos.map((d) => d.monto)).toEqual(['5000000.00', '5000000.00']);
  });

  it('tres tercios: el residuo cae completo en el último destino', () => {
    const reparto = calcularReparto('10000000.00', 'PORCENTAJE', [
      porcentaje('a', 1, '33.3333'),
      porcentaje('b', 2, '33.3333'),
      porcentaje('c', 3, '33.3334'),
    ]);

    // Truncando, cada uno da 3.333.330 / 3.333.330 / 3.333.340 = 10.000.000 exacto.
    expect(reparto.cuadra).toBe(true);
    expect(sumar(...reparto.destinos.map((d) => d.monto)).toFixed(2)).toBe('10000000.00');
  });

  it('un monto que no divide entre tres deja el residuo en el último', () => {
    const reparto = calcularReparto('100.00', 'PORCENTAJE', [
      porcentaje('a', 1, '33.3333'),
      porcentaje('b', 2, '33.3333'),
      porcentaje('c', 3, '33.3334'),
    ]);

    expect(reparto.cuadra).toBe(true);
    expect(sumar(...reparto.destinos.map((d) => d.monto)).toFixed(2)).toBe('100.00');

    // Solo el último lleva ajuste; los demás quedan limpios.
    const ajustes = reparto.destinos.map((d) => d.ajuste);
    expect(ajustes.slice(0, -1).every((ajuste) => aDecimal(ajuste).isZero())).toBe(true);
  });

  it('el residuo nunca es negativo: se trunca hacia abajo, no se redondea', () => {
    // Con redondeo al más cercano, tres destinos de 33,3333 % sobre 0,05 darían
    // 0,02 cada uno = 0,06, y el último tendría que devolver un centavo.
    const reparto = calcularReparto('0.05', 'PORCENTAJE', [
      porcentaje('a', 1, '33.3333'),
      porcentaje('b', 2, '33.3333'),
      porcentaje('c', 3, '33.3334'),
    ]);

    expect(reparto.cuadra).toBe(true);
    expect(aDecimal(reparto.destinos[2]!.ajuste).greaterThanOrEqualTo(0)).toBe(true);
    expect(reparto.destinos.every((d) => aDecimal(d.monto).greaterThanOrEqualTo(0))).toBe(true);
  });

  it('un solo centavo entre dos destinos no se pierde', () => {
    const reparto = calcularReparto('0.01', 'PORCENTAJE', [
      porcentaje('a', 1, '50'),
      porcentaje('b', 2, '50'),
    ]);

    expect(reparto.cuadra).toBe(true);
    expect(sumar(...reparto.destinos.map((d) => d.monto)).toFixed(2)).toBe('0.01');
  });

  it('el orden decide quién absorbe el residuo, no el orden del arreglo', () => {
    const reparto = calcularReparto('100.00', 'PORCENTAJE', [
      porcentaje('ultimo', 3, '33.3334'),
      porcentaje('primero', 1, '33.3333'),
      porcentaje('medio', 2, '33.3333'),
    ]);

    const conAjuste = reparto.destinos.filter((d) => !aDecimal(d.ajuste).isZero());
    expect(conAjuste).toHaveLength(1);
    expect(conAjuste[0]?.referencia).toBe('ultimo');
  });

  it('rechaza porcentajes que no suman cien', () => {
    expect(() =>
      calcularReparto('100.00', 'PORCENTAJE', [porcentaje('a', 1, '50'), porcentaje('b', 2, '40')]),
    ).toThrow(RepartoInvalidoError);
  });

  it('rechaza porcentajes que se pasan de cien', () => {
    expect(() =>
      calcularReparto('100.00', 'PORCENTAJE', [porcentaje('a', 1, '60'), porcentaje('b', 2, '60')]),
    ).toThrow(/100 %/);
  });
});

describe('reparto por monto fijo', () => {
  it('cuadra cuando los montos suman el total', () => {
    const reparto = calcularReparto('1500000.00', 'MONTO_FIJO', [
      fijo('a', 1, '1000000.00'),
      fijo('b', 2, '500000.00'),
    ]);

    expect(reparto.cuadra).toBe(true);
    expect(reparto.diferencia).toBe('0.00');
  });

  it('no cuadra y dice cuánto falta', () => {
    const reparto = calcularReparto('1500000.00', 'MONTO_FIJO', [
      fijo('a', 1, '1000000.00'),
      fijo('b', 2, '400000.00'),
    ]);

    expect(reparto.cuadra).toBe(false);
    expect(reparto.diferencia).toBe('100000.00');
    expect(explicarDiferencia(reparto)).toBe('Faltan 100000.00 por asignar.');
  });

  it('no cuadra y dice cuánto sobra', () => {
    const reparto = calcularReparto('1000000.00', 'MONTO_FIJO', [
      fijo('a', 1, '800000.00'),
      fijo('b', 2, '300000.00'),
    ]);

    expect(reparto.cuadra).toBe(false);
    expect(explicarDiferencia(reparto)).toBe('Se asignaron 100000.00 de más.');
  });

  it('rechaza un destino sin monto', () => {
    expect(() => calcularReparto('100.00', 'MONTO_FIJO', [{ referencia: 'a', orden: 1 }])).toThrow(
      RepartoInvalidoError,
    );
  });

  it('rechaza un monto en cero o negativo', () => {
    expect(() => calcularReparto('100.00', 'MONTO_FIJO', [fijo('a', 1, '0.00')])).toThrow(
      RepartoInvalidoError,
    );
    expect(() => calcularReparto('100.00', 'MONTO_FIJO', [fijo('a', 1, '-50.00')])).toThrow(
      RepartoInvalidoError,
    );
  });
});

describe('validaciones generales', () => {
  it('rechaza una dispersión sin destinos', () => {
    expect(() => calcularReparto('100.00', 'PORCENTAJE', [])).toThrow(RepartoInvalidoError);
  });

  it('rechaza un total en cero', () => {
    expect(() => calcularReparto('0.00', 'PORCENTAJE', [porcentaje('a', 1, '100')])).toThrow(
      RepartoInvalidoError,
    );
  });

  it('no acepta montos como número', () => {
    expect(() =>
      // @ts-expect-error el tipo lo prohíbe; se confirma que también falla en runtime
      calcularReparto(1000, 'PORCENTAJE', [porcentaje('a', 1, '100')]),
    ).toThrow(TypeError);
  });

  it('un reparto que cuadra no tiene nada que explicar', () => {
    const reparto = calcularReparto('100.00', 'PORCENTAJE', [porcentaje('a', 1, '100')]);
    expect(explicarDiferencia(reparto)).toBeNull();
  });
});
