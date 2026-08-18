import { describe, expect, it } from 'vitest';
import { calcularDigitoVerificacion, digitoVerificacionEsValido, formatearNit } from './nit.js';

describe('dígito de verificación del NIT', () => {
  // NIT reales y públicos, con su dígito verificado
  it.each([
    ['890903938', 8], // Bancolombia
    ['899999068', 1], // Ecopetrol
    ['890904996', 1], // EPM
    ['890900608', 9], // Grupo Éxito
    ['800153993', 7], // Comcel
  ])('NIT %s → DV %i', (nit, esperado) => {
    expect(calcularDigitoVerificacion(nit)).toBe(esperado);
  });

  it('ignora puntos y guiones al calcular', () => {
    expect(calcularDigitoVerificacion('890.903.938')).toBe(calcularDigitoVerificacion('890903938'));
  });

  it('rechaza un NIT vacío o demasiado largo', () => {
    expect(() => calcularDigitoVerificacion('')).toThrow(RangeError);
    expect(() => calcularDigitoVerificacion('1234567890123456')).toThrow(RangeError);
  });

  it('valida sin lanzar excepción', () => {
    expect(digitoVerificacionEsValido('890903938', 8)).toBe(true);
    expect(digitoVerificacionEsValido('890903938', 7)).toBe(false);
    expect(digitoVerificacionEsValido('', 0)).toBe(false);
  });

  it('formatea para mostrar', () => {
    expect(formatearNit('890.903.938', 8)).toBe('890903938-8');
  });
});
