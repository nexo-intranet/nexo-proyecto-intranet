import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Cifrado en reposo (docs/SEGURIDAD.md §2.3 y §5).
 *
 * Se cifran: el secreto TOTP de cada usuario, las credenciales de Siigo y demás
 * proveedores de cada empresa, y los documentos de identidad de empleados y
 * clientes (Ley 1581).
 *
 * Formato del texto cifrado: `v<versión>.<iv>.<tag>.<datos>`, todo en base64url.
 * La versión viaja con el dato para poder rotar la clave: al rotar se sube la
 * versión, se descifra con la anterior y se recifra con la nueva.
 */

const ALGORITMO = 'aes-256-gcm';
const LONGITUD_IV = 12; // 96 bits, lo recomendado para GCM
const SEPARADOR = '.';

export class TextoCifradoInvalidoError extends Error {
  constructor(motivo: string) {
    super(`No se pudo descifrar el valor: ${motivo}`);
    this.name = 'TextoCifradoInvalidoError';
  }
}

@Injectable()
export class CifradoService {
  private readonly clave: Buffer;
  private readonly claveHmac: Buffer;

  constructor(
    claveBase64: string,
    private readonly version: number,
    claveHmacBase64: string,
  ) {
    this.clave = Buffer.from(claveBase64, 'base64');
    this.claveHmac = Buffer.from(claveHmacBase64, 'base64');

    if (this.clave.length !== 32) {
      throw new Error('ENCRYPTION_KEY debe ser de 32 bytes');
    }
    if (this.claveHmac.length !== 32) {
      throw new Error('HMAC_DOC_KEY debe ser de 32 bytes');
    }
  }

  cifrar(textoPlano: string): string {
    const iv = randomBytes(LONGITUD_IV);
    const cifrador = createCipheriv(ALGORITMO, this.clave, iv);

    const datos = Buffer.concat([cifrador.update(textoPlano, 'utf8'), cifrador.final()]);
    const tag = cifrador.getAuthTag();

    return [
      `v${this.version}`,
      iv.toString('base64url'),
      tag.toString('base64url'),
      datos.toString('base64url'),
    ].join(SEPARADOR);
  }

  descifrar(textoCifrado: string): string {
    const partes = textoCifrado.split(SEPARADOR);
    if (partes.length !== 4) {
      throw new TextoCifradoInvalidoError('el formato no corresponde');
    }

    const [etiquetaVersion, ivB64, tagB64, datosB64] = partes as [string, string, string, string];
    if (!etiquetaVersion.startsWith('v')) {
      throw new TextoCifradoInvalidoError('falta la versión de clave');
    }

    // TODO [CONFIRMAR] Cuando exista una segunda versión de clave, aquí se elige la
    // clave correspondiente a `etiquetaVersion` en vez de usar siempre la actual.
    try {
      const descifrador = createDecipheriv(ALGORITMO, this.clave, Buffer.from(ivB64, 'base64url'));
      descifrador.setAuthTag(Buffer.from(tagB64, 'base64url'));

      return Buffer.concat([
        descifrador.update(Buffer.from(datosB64, 'base64url')),
        descifrador.final(),
      ]).toString('utf8');
    } catch {
      // El mensaje no distingue entre clave equivocada y dato alterado: esa
      // diferencia solo le sirve a quien esté probando valores.
      throw new TextoCifradoInvalidoError('la clave no corresponde o el dato fue alterado');
    }
  }

  /**
   * HMAC determinista de un documento de identidad.
   *
   * Es lo que permite buscar por cédula o NIT sin descifrar ni indexar el número en
   * claro: se guarda junto al valor cifrado y es el único de los dos que se indexa.
   * Determinista a propósito — misma cédula, mismo hash— así que **nunca** debe
   * usarse para contraseñas.
   */
  hashDocumento(numeroDocumento: string): string {
    const normalizado = numeroDocumento.replace(/\D/g, '');
    return createHmac('sha256', this.claveHmac).update(normalizado).digest('base64url');
  }

  /** Comparación en tiempo constante, para tokens y códigos de un solo uso. */
  sonIguales(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }
}
