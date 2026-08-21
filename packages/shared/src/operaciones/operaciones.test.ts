import { describe, expect, it } from 'vitest';
import {
  OperacionInvalidaError,
  abreviarHash,
  calcularGanancia,
  normalizarHash,
  pareceHash,
} from './index.js';

/**
 * Ganancia de una operación.
 *
 * Es lógica de dinero, así que el brief exige pruebas (§4.15). Lo que se verifica:
 * que la conversión use la tasa que se le pasa y no otra, que una operación en
 * pérdida se pueda registrar, y que falte la tasa sea un error explícito y no un
 * cero silencioso.
 */

describe('ganancia', () => {
  it('resta directa cuando compra y venta están en pesos', () => {
    const r = calcularGanancia(
      { valor: '40000000.00', moneda: 'COP' },
      { valor: '42000000.00', moneda: 'COP' },
    );

    expect(r.gananciaCOP).toBe('2000000.00');
    expect(r.compraCOP).toBe('40000000.00');
    expect(r.ventaCOP).toBe('42000000.00');
  });

  it('convierte con la tasa que se le pasa, no con ninguna otra', () => {
    // 1.000 USDT comprados a 4.000 y vendidos a 4.200.
    const r = calcularGanancia(
      { valor: '1000.00', moneda: 'USDT', tasa: '4000.00' },
      { valor: '1000.00', moneda: 'USDT', tasa: '4200.00' },
    );

    expect(r.compraCOP).toBe('4000000.00');
    expect(r.ventaCOP).toBe('4200000.00');
    expect(r.gananciaCOP).toBe('200000.00');
  });

  it('admite compra y venta en monedas distintas', () => {
    const r = calcularGanancia(
      { valor: '1000.00', moneda: 'USDT', tasa: '4000.00' },
      { valor: '4300000.00', moneda: 'COP' },
    );

    expect(r.gananciaCOP).toBe('300000.00');
  });

  it('registra una operación en pérdida sin quejarse', () => {
    // Una operación puede cerrarse en pérdida. Rechazarla sería falsear la contabilidad.
    const r = calcularGanancia(
      { valor: '5000000.00', moneda: 'COP' },
      { valor: '4800000.00', moneda: 'COP' },
    );

    expect(r.gananciaCOP).toBe('-200000.00');
    expect(r.margen).toBe('-4.00');
  });

  it('calcula el margen sobre la compra', () => {
    const r = calcularGanancia(
      { valor: '1000000.00', moneda: 'COP' },
      { valor: '1150000.00', moneda: 'COP' },
    );

    expect(r.margen).toBe('15.00');
  });

  it('no divide por cero cuando la compra es cero', () => {
    const r = calcularGanancia(
      { valor: '0.00', moneda: 'COP' },
      { valor: '500000.00', moneda: 'COP' },
    );

    expect(r.gananciaCOP).toBe('500000.00');
    expect(r.margen).toBeNull();
  });

  it('exige la tasa cuando la moneda no es peso', () => {
    expect(() =>
      calcularGanancia(
        { valor: '1000.00', moneda: 'USDT' },
        { valor: '4200000.00', moneda: 'COP' },
      ),
    ).toThrow(OperacionInvalidaError);
  });

  it('el mensaje de la tasa faltante dice cuál lado y en qué moneda', () => {
    expect(() =>
      calcularGanancia({ valor: '100.00', moneda: 'USD' }, { valor: '1.00', moneda: 'COP' }),
    ).toThrow(/la compra.*USD/s);
  });

  it('rechaza una tasa en cero o negativa', () => {
    expect(() =>
      calcularGanancia(
        { valor: '1000.00', moneda: 'USDT', tasa: '0' },
        { valor: '1.00', moneda: 'COP' },
      ),
    ).toThrow(/mayor que cero/);
  });

  it('rechaza valores negativos', () => {
    expect(() =>
      calcularGanancia({ valor: '-100.00', moneda: 'COP' }, { valor: '1.00', moneda: 'COP' }),
    ).toThrow(/negativo/);
  });

  it('no acepta montos como número', () => {
    expect(() =>
      // @ts-expect-error el tipo lo prohíbe; se confirma que también falla en runtime
      calcularGanancia({ valor: 1000, moneda: 'COP' }, { valor: '1.00', moneda: 'COP' }),
    ).toThrow(TypeError);
  });

  it('redondea a dos decimales sin arrastrar residuos', () => {
    // 333,333333 USDT a 3.000,555 da un valor con muchos decimales.
    const r = calcularGanancia(
      { valor: '333.33', moneda: 'USDT', tasa: '3000.555' },
      { valor: '1000000.00', moneda: 'COP' },
    );

    expect(r.compraCOP).toMatch(/^\d+\.\d{2}$/);
  });
});

describe('hash', () => {
  const HASH = '0x9f2c4b1e8a7d3f5c6b0e2a4d8c1f7b3e5a9d2c4b6e8f0a1d3c5b7e9f2a4c6d8e';

  it('abrevia mostrando los extremos, que es lo que se compara', () => {
    const abreviado = abreviarHash(HASH);
    expect(abreviado.startsWith('0x9f2c4b1e')).toBe(true);
    expect(abreviado.endsWith('2a4c6d8e')).toBe(true);
    expect(abreviado.length).toBeLessThan(HASH.length);
  });

  it('deja intacto lo que ya es corto', () => {
    expect(abreviarHash('0x1234')).toBe('0x1234');
  });

  it('reconoce un hash hexadecimal con y sin 0x', () => {
    expect(pareceHash(HASH)).toBe(true);
    expect(pareceHash(HASH.slice(2))).toBe(true);
  });

  it('reconoce una firma en base58, como las de Solana', () => {
    expect(pareceHash('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')).toBe(true);
  });

  it('no confunde una palabra corriente con un hash', () => {
    expect(pareceHash('operaciones')).toBe(false);
    expect(pareceHash('Nexo')).toBe(false);
    expect(pareceHash('')).toBe(false);
  });

  it('normaliza a minúscula y sin espacios, para que la búsqueda no dependa de cómo se pegó', () => {
    expect(normalizarHash('  0xABCDEF123456  ')).toBe('0xabcdef123456');
  });
});
