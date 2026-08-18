import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hash de contraseñas con argon2id (docs/SEGURIDAD.md §4).
 *
 * argon2id y no bcrypt: bcrypt trunca en 72 bytes y su costo solo escala en tiempo,
 * no en memoria, lo que lo deja expuesto a ataques con GPU. Los parámetros de abajo
 * son los recomendados por OWASP.
 */
const PARAMETROS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/** Sin caracteres ambiguos: nada de 0/O ni 1/l/I, que se dictan mal por teléfono. */
const ALFABETO_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, PARAMETROS);
  }

  async verificar(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Hash corrupto o de un algoritmo desconocido: se trata como no coincidente.
      return false;
    }
  }

  /**
   * Contraseña temporal para un usuario nuevo. Se muestra una sola vez al
   * administrador que lo crea y obliga a cambiarla al primer ingreso.
   */
  generarTemporal(longitud = 16): string {
    const bytes = randomBytes(longitud);
    let salida = '';
    for (let i = 0; i < longitud; i += 1) {
      salida += ALFABETO_TEMPORAL[bytes[i]! % ALFABETO_TEMPORAL.length];
    }
    return salida;
  }
}
