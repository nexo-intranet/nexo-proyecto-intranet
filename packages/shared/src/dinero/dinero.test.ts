import { describe, expect, it } from 'vitest';
import {
  aDecimal,
  aTexto,
  convertir,
  formatear,
  redondear,
  restar,
  sumar,
  sonIguales,
} from './index.js';

describe('dinero', () => {
  it('rechaza números de punto flotante', () => {
    // @ts-expect-error el tipo lo prohíbe; la prueba confirma que además falla en runtime
    expect(() => aDecimal(1234.56)).toThrow(TypeError);
  });

  it('rechaza texto que no es numérico', () => {
    expect(() => aDecimal('1.234,56')).toThrow(TypeError);
    expect(() => aDecimal('$1000')).toThrow(TypeError);
    expect(() => aDecimal('')).toThrow(TypeError);
  });

  it('suma sin el error clásico de coma flotante', () => {
    // 0.1 + 0.2 === 0.30000000000000004 con números nativos
    expect(sumar('0.10', '0.20').toFixed(2)).toBe('0.30');
  });

  it('mantiene la precisión en montos grandes en pesos', () => {
    const total = sumar('9999999999.99', '0.01');
    expect(aTexto(total)).toBe('10000000000.00');
  });

  it('conserva los 18 decimales de una cantidad en cripto', () => {
    const monto = '0.000000000000000001';
    expect(aTexto(monto, 'USDT')).toBe('0.000000000000000001');
  });

  it('redondea a mitad hacia arriba', () => {
    expect(redondear('10.005').toFixed(2)).toBe('10.01');
    expect(redondear('10.004').toFixed(2)).toBe('10.00');
  });

  it('convierte con la tasa que se le pasa y no con ninguna otra', () => {
    // 100 USDT a 4.320,50 COP — la tasa queda congelada en la operación
    expect(aTexto(convertir('100', '4320.50'))).toBe('432050.00');
  });

  it('compara montos por valor y no por representación', () => {
    expect(sonIguales('10.00', '10')).toBe(true);
    expect(sonIguales('10.001', '10.00')).toBe(false);
  });

  it('resta sin arrastrar residuos', () => {
    expect(aTexto(restar('1000000.00', '999999.99'))).toBe('0.01');
  });

  it('formatea en pesos colombianos', () => {
    // El separador que devuelve Intl puede ser un espacio fino según la plataforma
    expect(formatear('1234567.89').replace(/\s/g, ' ')).toContain('1.234.567,89');
  });
});
