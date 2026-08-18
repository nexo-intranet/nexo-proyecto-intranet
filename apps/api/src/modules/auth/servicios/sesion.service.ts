import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorNegocio } from '../../../common/errores';
import type { Entorno } from '../../../core/config/configuracion';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * Emisión y rotación de sesiones (docs/SEGURIDAD.md §4).
 *
 * El token de refresco **no es un JWT**: es un valor aleatorio del que solo se
 * guarda el hash. Así se puede revocar de verdad —un JWT firmado sigue siendo
 * válido hasta que expire, aunque el usuario cierre sesión— y si alguien se lleva
 * la base de datos, no se lleva sesiones utilizables.
 */

export type TipoToken = 'acceso' | 'reto';

export interface PayloadToken {
  sub: string;
  tipo: TipoToken;
}

export interface SesionEmitida {
  tokenAcceso: string;
  tokenRefresco: string;
  tokenCsrf: string;
}

const DIAS_REFRESCO = 7;
const MINUTOS_RETO = 5;

function hashear(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SesionService {
  private readonly registro = new Logger(SesionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Entorno, true>,
  ) {}

  /**
   * Token de reto: acredita que la contraseña ya se verificó y que falta el segundo
   * factor. Dura cinco minutos y no sirve para nada más — el guard de sesión
   * comprueba el campo `tipo` justamente para que no pueda usarse como acceso.
   */
  emitirReto(usuarioId: string): Promise<string> {
    return this.jwt.signAsync({ sub: usuarioId, tipo: 'reto' } satisfies PayloadToken, {
      expiresIn: `${MINUTOS_RETO}m`,
    });
  }

  async verificarReto(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<PayloadToken>(token);
      if (payload.tipo !== 'reto') throw new Error('tipo de token incorrecto');
      return payload.sub;
    } catch {
      throw new ErrorNegocio(
        'TOKEN_EXPIRADO',
        'La verificación expiró. Vuelve a ingresar tu contraseña.',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async emitir(
    usuarioId: string,
    datos: { ip?: string; userAgent?: string },
    familiaId: string = randomUUID(),
  ): Promise<SesionEmitida> {
    const tokenAcceso = await this.jwt.signAsync({
      sub: usuarioId,
      tipo: 'acceso',
    } satisfies PayloadToken);

    const tokenRefresco = randomBytes(32).toString('base64url');
    const expiraEn = new Date(Date.now() + DIAS_REFRESCO * 24 * 60 * 60 * 1000);

    await this.prisma.db.sesionRefresh.create({
      data: {
        usuarioId,
        tokenHash: hashear(tokenRefresco),
        familiaId,
        expiraEn,
        ip: datos.ip ?? null,
        userAgent: datos.userAgent ?? null,
      },
    });

    return {
      tokenAcceso,
      tokenRefresco,
      tokenCsrf: randomBytes(32).toString('base64url'),
    };
  }

  /**
   * Rota el refresco y detecta reuso.
   *
   * Si llega un token ya consumido, se asume que fue robado: se revoca la familia
   * completa, no solo esa sesión. El usuario legítimo tendrá que volver a ingresar,
   * que es exactamente lo que se quiere cuando hay un token circulando de más.
   */
  async rotar(
    tokenRefresco: string,
    datos: { ip?: string; userAgent?: string },
  ): Promise<SesionEmitida & { usuarioId: string }> {
    const sesion = await this.prisma.db.sesionRefresh.findUnique({
      where: { tokenHash: hashear(tokenRefresco) },
      select: {
        id: true,
        usuarioId: true,
        familiaId: true,
        expiraEn: true,
        revocadaEn: true,
      },
    });

    if (!sesion) throw this.sesionInvalida();

    if (sesion.revocadaEn) {
      this.registro.warn(
        `Reuso de token de refresco en la familia ${sesion.familiaId}. Se revocan todas sus sesiones.`,
      );
      await this.revocarFamilia(sesion.familiaId);
      throw this.sesionInvalida();
    }

    if (sesion.expiraEn <= new Date()) {
      throw this.sesionInvalida();
    }

    await this.prisma.db.sesionRefresh.update({
      where: { id: sesion.id },
      data: { revocadaEn: new Date() },
    });

    const emitida = await this.emitir(sesion.usuarioId, datos, sesion.familiaId);
    return { ...emitida, usuarioId: sesion.usuarioId };
  }

  async revocar(tokenRefresco: string): Promise<void> {
    await this.prisma.db.sesionRefresh.updateMany({
      where: { tokenHash: hashear(tokenRefresco), revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async revocarFamilia(familiaId: string): Promise<void> {
    await this.prisma.db.sesionRefresh.updateMany({
      where: { familiaId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  /**
   * Cierra todas las sesiones del usuario. Se llama al cambiar la contraseña, al
   * reiniciar el 2FA y al desactivar la cuenta: en los tres casos, dejar una sesión
   * viva es dejar abierta la puerta que se acaba de cerrar.
   */
  async revocarTodas(usuarioId: string): Promise<void> {
    await this.prisma.db.sesionRefresh.updateMany({
      where: { usuarioId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  private sesionInvalida(): ErrorNegocio {
    return new ErrorNegocio(
      'TOKEN_EXPIRADO',
      'Tu sesión expiró. Vuelve a ingresar.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
