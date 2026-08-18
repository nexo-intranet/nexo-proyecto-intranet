import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

/**
 * Segundo factor TOTP, obligatorio para todos los usuarios (brief §3).
 *
 * El secreto se guarda cifrado con AES-256-GCM, nunca en claro.
 */

// Una ventana de tolerancia hacia atrás y otra hacia adelante: cubre el desfase
// normal del reloj del teléfono sin ampliar de más la superficie de adivinanza.
authenticator.options = { window: 1 };

const EMISOR = 'Nexo Administración';
const CANTIDAD_CODIGOS_RESPALDO = 8;
const ALFABETO_RESPALDO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class TotpService {
  generarSecreto(): string {
    return authenticator.generateSecret();
  }

  /** URI `otpauth://` que se convierte en el código QR de la app autenticadora. */
  construirUri(email: string, secreto: string): string {
    return authenticator.keyuri(email, EMISOR, secreto);
  }

  async generarQr(email: string, secreto: string): Promise<string> {
    return QRCode.toDataURL(this.construirUri(email, secreto), { margin: 1, width: 240 });
  }

  verificar(codigo: string, secreto: string): boolean {
    try {
      return authenticator.check(codigo, secreto);
    } catch {
      return false;
    }
  }

  /**
   * Códigos de respaldo de un solo uso, para cuando se pierde el teléfono.
   * Se muestran una vez al activar el 2FA y se guardan solo como hash.
   */
  generarCodigosRespaldo(): string[] {
    const codigos: string[] = [];
    for (let i = 0; i < CANTIDAD_CODIGOS_RESPALDO; i += 1) {
      const bloque = () =>
        Array.from(
          { length: 4 },
          () => ALFABETO_RESPALDO[randomInt(ALFABETO_RESPALDO.length)],
        ).join('');
      codigos.push(`${bloque()}-${bloque()}`);
    }
    return codigos;
  }

  normalizarCodigoRespaldo(codigo: string): string {
    return codigo.trim().toUpperCase();
  }
}
