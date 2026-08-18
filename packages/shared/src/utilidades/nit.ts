/**
 * Dígito de verificación del NIT (DIAN).
 *
 * Algoritmo oficial: a cada dígito del NIT, leído de derecha a izquierda, se le
 * aplica un peso primo fijo; se suma; el residuo módulo 11 define el dígito.
 */

const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function calcularDigitoVerificacion(nit: string): number {
  const digitos = soloDigitos(nit);
  if (digitos.length === 0 || digitos.length > PESOS.length) {
    throw new RangeError(`NIT fuera de rango: "${nit}"`);
  }

  let suma = 0;
  for (let i = 0; i < digitos.length; i += 1) {
    const digito = Number(digitos[digitos.length - 1 - i]);
    const peso = PESOS[i] ?? 0;
    suma += digito * peso;
  }

  const residuo = suma % 11;
  return residuo < 2 ? residuo : 11 - residuo;
}

export function digitoVerificacionEsValido(nit: string, digito: number): boolean {
  try {
    return calcularDigitoVerificacion(nit) === digito;
  } catch {
    return false;
  }
}

/** `901234567-8` para mostrar. */
export function formatearNit(nit: string, digitoVerificacion: number): string {
  return `${soloDigitos(nit)}-${digitoVerificacion}`;
}
