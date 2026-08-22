import { describe, expect, it } from 'vitest';
import { CONCEPTOS_SUGERIDOS, NominaInvalidaError, totalizarManual } from './index.js';

/**
 * Liquidación de nómina.
 *
 * Es lógica de dinero, así que el brief exige pruebas (§4.15). Lo que se verifica:
 * que sume lo que debe, que no acepte un neto negativo —que es un dato mal digitado,
 * no un cálculo raro— y que los centavos no se pierdan por el camino.
 */

describe('totalizarManual', () => {
  it('suma devengados, resta deducciones y devuelve el neto', () => {
    const r = totalizarManual.liquidar([
      { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '2000000.00' },
      { tipo: 'DEVENGADO', concepto: 'Auxilio de transporte', valor: '162000.00' },
      { tipo: 'DEDUCCION', concepto: 'Salud', valor: '80000.00' },
      { tipo: 'DEDUCCION', concepto: 'Pensión', valor: '80000.00' },
    ]);

    expect(r.totalDevengado).toBe('2162000.00');
    expect(r.totalDeducido).toBe('160000.00');
    expect(r.neto).toBe('2002000.00');
  });

  it('un recibo sin deducciones da neto igual al devengado', () => {
    const r = totalizarManual.liquidar([
      { tipo: 'DEVENGADO', concepto: 'Honorarios', valor: '3500000.00' },
    ]);

    expect(r.totalDeducido).toBe('0.00');
    expect(r.neto).toBe('3500000.00');
  });

  it('acepta que el neto quede en cero', () => {
    // Raro, pero legítimo: un período que se descuenta completo contra un préstamo.
    const r = totalizarManual.liquidar([
      { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '1000000.00' },
      { tipo: 'DEDUCCION', concepto: 'Préstamo', valor: '1000000.00' },
    ]);

    expect(r.neto).toBe('0.00');
  });

  it('rechaza que las deducciones superen a los devengados', () => {
    // No es un cálculo raro: es un dato mal digitado, y descubrirlo al imprimir
    // el PDF sería tarde.
    expect(() =>
      totalizarManual.liquidar([
        { tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '1000000.00' },
        { tipo: 'DEDUCCION', concepto: 'Embargo', valor: '1500000.00' },
      ]),
    ).toThrow(NominaInvalidaError);
  });

  it('rechaza un valor negativo y dice qué hacer en su lugar', () => {
    expect(() =>
      totalizarManual.liquidar([{ tipo: 'DEVENGADO', concepto: 'Ajuste', valor: '-50000.00' }]),
    ).toThrow(/deducción/);
  });

  it('no liquida un recibo vacío', () => {
    expect(() => totalizarManual.liquidar([])).toThrow(/al menos un concepto/);
  });

  it('no acepta montos como número', () => {
    expect(() =>
      totalizarManual.liquidar([
        // @ts-expect-error el tipo lo prohíbe; se confirma que también falla en runtime
        { tipo: 'DEVENGADO', concepto: 'Salario', valor: 1000000 },
      ]),
    ).toThrow(TypeError);
  });

  it('conserva los centavos al sumar muchas líneas', () => {
    const r = totalizarManual.liquidar([
      { tipo: 'DEVENGADO', concepto: 'Uno', valor: '333333.33' },
      { tipo: 'DEVENGADO', concepto: 'Dos', valor: '333333.33' },
      { tipo: 'DEVENGADO', concepto: 'Tres', valor: '333333.34' },
    ]);

    expect(r.totalDevengado).toBe('1000000.00');
  });

  it('la calculadora dice cuál es, para poder auditarla después', () => {
    // Cuando exista la versión con fórmulas, saber cuál liquidó un recibo va a
    // importar: dos implementaciones pueden dar números distintos y ser correctas.
    expect(totalizarManual.nombre).toBe('TotalizadorManual');
  });
});

describe('conceptos sugeridos', () => {
  it('son sugerencias, no un catálogo cerrado', () => {
    // La prueba de que son sugerencias es que la liquidación acepta cualquier texto.
    const r = totalizarManual.liquidar([
      { tipo: 'DEVENGADO', concepto: 'Concepto que no está en la lista', valor: '100.00' },
    ]);

    expect(r.neto).toBe('100.00');
    expect(CONCEPTOS_SUGERIDOS.DEVENGADO).not.toContain('Concepto que no está en la lista');
  });

  it('trae los habituales de una nómina colombiana', () => {
    expect(CONCEPTOS_SUGERIDOS.DEVENGADO).toContain('Auxilio de transporte');
    expect(CONCEPTOS_SUGERIDOS.DEDUCCION).toContain('Salud');
    expect(CONCEPTOS_SUGERIDOS.DEDUCCION).toContain('Pensión');
  });
});
