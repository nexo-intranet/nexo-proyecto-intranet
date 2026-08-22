import { describe, expect, it } from 'vitest';
import { interpretarCalendarioCsv } from './index.js';

/**
 * Estas pruebas existen porque el archivo que se carga aquí define las fechas
 * legales de todo un año. Una fila mal leída no rompe nada visible: produce una
 * fecha equivocada, que alguien cumple, y el error aparece con la sanción.
 */

describe('interpretarCalendarioCsv', () => {
  it('lee un CSV con comas y fechas ISO', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      ['obligacion,digito,fecha', 'Renta,7,2031-04-15', 'Retenciones,7,2031-02-10'].join('\n'),
    );

    expect(errores).toEqual([]);
    expect(filas).toEqual([
      { tipoObligacion: 'RENTA', ultimoDigito: 7, fechaLimite: '2031-04-15' },
      { tipoObligacion: 'RETENCIONES', ultimoDigito: 7, fechaLimite: '2031-02-10' },
    ]);
  });

  /** Excel en español exporta con punto y coma, porque la coma es el decimal. */
  it('detecta el punto y coma como separador', () => {
    const { filas } = interpretarCalendarioCsv(
      ['Obligación;Último dígito;Fecha límite', 'Renta;3;20/04/2031'].join('\n'),
    );

    expect(filas).toEqual([
      { tipoObligacion: 'RENTA', ultimoDigito: 3, fechaLimite: '2031-04-20' },
    ]);
  });

  it('lee las fechas como día/mes/año, no como mes/día', () => {
    const { filas } = interpretarCalendarioCsv(
      ['obligacion,digito,fecha', 'Renta,1,04/05/2031'].join('\n'),
    );

    // 4 de mayo, no 5 de abril: es lo que teclea quien arma la hoja aquí.
    expect(filas[0]!.fechaLimite).toBe('2031-05-04');
  });

  it('rechaza una fecha que no existe en vez de correrla al mes siguiente', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      ['obligacion,digito,fecha', 'Renta,1,31/04/2031'].join('\n'),
    );

    expect(filas).toEqual([]);
    expect(errores[0]!.mensaje).toContain('No se entiende la fecha');
  });

  it('respeta las comas dentro de una descripción entre comillas', () => {
    const { filas } = interpretarCalendarioCsv(
      [
        'obligacion,digito,fecha,descripcion',
        'Renta,5,2031-04-18,"Grandes contribuyentes, primera cuota"',
      ].join('\n'),
    );

    expect(filas[0]!.descripcion).toBe('Grandes contribuyentes, primera cuota');
  });

  it('acepta el municipio en ICA y lo ignora en el resto', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      [
        'obligacion,digito,municipio,fecha',
        'ICA,7,05001,2031-05-30',
        'Renta,7,05001,2031-04-15',
      ].join('\n'),
    );

    expect(errores).toEqual([]);
    expect(filas[0]!.codigoDaneMunicipio).toBe('05001');
    // El servidor rechaza un municipio fuera de ICA: una columna llena de más no
    // puede invalidar la carga entera.
    expect(filas[1]!.codigoDaneMunicipio).toBeUndefined();
  });

  it('lee el tipo de contribuyente escrito como lo escribiría una persona', () => {
    const { filas } = interpretarCalendarioCsv(
      [
        'obligacion,digito,contribuyente,fecha',
        'Renta,2,Persona jurídica,2031-04-16',
        'Renta,2,gran contribuyente,2031-02-10',
        'Renta,2,,2031-08-01',
      ].join('\n'),
    );

    expect(filas[0]!.tipoContribuyente).toBe('PERSONA_JURIDICA');
    expect(filas[1]!.tipoContribuyente).toBe('GRAN_CONTRIBUYENTE');
    // Vacío significa «aplica a cualquiera», no un error.
    expect(filas[2]!.tipoContribuyente).toBeUndefined();
  });

  /**
   * Una línea mala no puede tumbar el archivo: se reporta y las demás siguen.
   * Cargar cuarenta fechas y que la número doce cancele todo obliga a repetir el
   * ciclo entero por un error de tecleo.
   */
  it('informa la línea que falló y conserva las buenas', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      [
        'obligacion,digito,fecha',
        'Renta,7,2031-04-15',
        'Vehículos,7,2031-04-15',
        'Renta,X,2031-04-15',
        'Renta,8,2031-04-16',
      ].join('\n'),
    );

    expect(filas).toHaveLength(2);
    expect(errores).toHaveLength(2);
    // El número es el que se ve en Excel, para poder ir a la fila.
    expect(errores[0]!.linea).toBe(3);
    expect(errores[1]!.linea).toBe(4);
    expect(errores[0]!.mensaje).toContain('Vehículos');
  });

  it('avisa cuando faltan columnas en vez de leer basura', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      ['obligacion,fecha', 'Renta,2031-04-15'].join('\n'),
    );

    expect(filas).toEqual([]);
    expect(errores[0]!.mensaje).toContain('dígito');
  });

  it('sobrevive al BOM y a las líneas en blanco que deja Excel', () => {
    const { filas, errores } = interpretarCalendarioCsv(
      '﻿obligacion,digito,fecha\r\nRenta,7,2031-04-15\r\n\r\n',
    );

    expect(errores).toEqual([]);
    expect(filas).toHaveLength(1);
  });

  it('devuelve un error legible con un archivo vacío', () => {
    expect(interpretarCalendarioCsv('   \n\n').errores[0]!.mensaje).toContain('vacío');
  });
});
