import { describe, expect, it } from 'vitest';
import { booleanoEsquema } from './comunes.js';

/**
 * Esta prueba existe por un error que ya estaba en producción y no se veía.
 *
 * `z.coerce.boolean()` convierte la cadena `'false'` en `true`, porque en
 * JavaScript toda cadena no vacía es verdadera. Un filtro `?activo=false` devolvía
 * la lista contraria a la pedida, sin error y sin nada en los registros. Un fallo
 * que no rompe nada es el que más tarda en encontrarse.
 */
describe('booleanoEsquema', () => {
  it('lee «false» como falso, que es lo que z.coerce.boolean no hacía', () => {
    expect(booleanoEsquema.parse('false')).toBe(false);
    expect(booleanoEsquema.parse('0')).toBe(false);
  });

  it('lee «true» como verdadero', () => {
    expect(booleanoEsquema.parse('true')).toBe(true);
    expect(booleanoEsquema.parse('1')).toBe(true);
  });

  /** El mismo esquema valida cuerpos JSON, donde el booleano llega de verdad. */
  it('acepta booleanos reales sin tocarlos', () => {
    expect(booleanoEsquema.parse(true)).toBe(true);
    expect(booleanoEsquema.parse(false)).toBe(false);
  });

  it('rechaza cualquier otra cosa en vez de adivinar', () => {
    // «sí», «on» o un número suelto son ambiguos: mejor un error que una lista
    // silenciosamente invertida.
    for (const valor of ['si', 'on', '2', '', 'FALSE', null, 0]) {
      expect(() => booleanoEsquema.parse(valor)).toThrow();
    }
  });
});
