import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  cambiarPasswordEsquema,
  confirmar2faEsquema,
  iniciar2faEsquema,
  iniciarSesionEsquema,
  verificarSegundoFactorEsquema,
  type DatosCambiarPassword,
  type DatosConfirmar2fa,
  type DatosIniciar2fa,
  type DatosIniciarSesion,
  type DatosVerificarSegundoFactor,
  type RespuestaIngreso,
  type SesionActual,
} from '@nexo/shared';
import type { Request, Response } from 'express';
import {
  Publico,
  SinAuditoriaGenerica,
  SinEmpresa,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../common/decoradores';
import { noAutenticado } from '../../common/errores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import type { Entorno } from '../../core/config/configuracion';
import {
  COOKIE_ACCESO,
  COOKIE_CSRF,
  COOKIE_REFRESCO,
  opcionesAcceso,
  opcionesCsrf,
  opcionesRefresco,
  type OpcionesCookie,
} from '../../core/auth/cookies';
import { AuthService } from './auth.service';
import type { SesionEmitida } from './servicios/sesion.service';

/** Límite estricto para las rutas que aceptan credenciales. */
const LIMITE_CREDENCIALES = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
@SinEmpresa()
@SinAuditoriaGenerica()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Entorno, true>,
  ) {}

  @Post('ingresar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_CREDENCIALES)
  ingresar(@Body(zod(iniciarSesionEsquema)) datos: DatosIniciarSesion): Promise<RespuestaIngreso> {
    return this.auth.ingresar(datos);
  }

  @Post('2fa/verificar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_CREDENCIALES)
  async verificar(
    @Body(zod(verificarSegundoFactorEsquema)) datos: DatosVerificarSegundoFactor,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ ok: true }> {
    const sesion = await this.auth.verificarSegundoFactor(datos, this.datosPeticion(peticion));
    this.escribirCookies(respuesta, sesion);
    return { ok: true };
  }

  @Post('2fa/iniciar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_CREDENCIALES)
  iniciar2fa(
    @Body(zod(iniciar2faEsquema)) datos: DatosIniciar2fa,
  ): Promise<{ secreto: string; qr: string }> {
    return this.auth.iniciarRegistro2fa(datos.tokenReto);
  }

  @Post('2fa/confirmar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_CREDENCIALES)
  async confirmar2fa(
    @Body(zod(confirmar2faEsquema)) datos: DatosConfirmar2fa,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ codigosRespaldo: string[] }> {
    const { codigosRespaldo, ...sesion } = await this.auth.confirmarRegistro2fa(
      datos.tokenReto,
      datos.codigo,
      this.datosPeticion(peticion),
    );
    this.escribirCookies(respuesta, sesion);
    // Se devuelven una única vez: después solo existen como hash.
    return { codigosRespaldo };
  }

  @Post('refrescar')
  @Publico()
  @HttpCode(HttpStatus.OK)
  async refrescar(
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ ok: true }> {
    const tokenRefresco = this.leerCookie(peticion, COOKIE_REFRESCO);
    if (!tokenRefresco) throw noAutenticado();

    const sesion = await this.auth.refrescar(tokenRefresco, this.datosPeticion(peticion));
    this.escribirCookies(respuesta, sesion);
    return { ok: true };
  }

  @Post('salir')
  @HttpCode(HttpStatus.OK)
  async salir(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ ok: true }> {
    await this.auth.salir(this.leerCookie(peticion, COOKIE_REFRESCO), usuario.id);
    this.borrarCookies(respuesta);
    return { ok: true };
  }

  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioAutenticado): Promise<SesionActual> {
    return this.auth.sesionActual(usuario.id);
  }

  @Post('password/cambiar')
  @HttpCode(HttpStatus.OK)
  async cambiarPassword(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body(zod(cambiarPasswordEsquema)) datos: DatosCambiarPassword,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ ok: true }> {
    await this.auth.cambiarPassword(usuario.id, datos);
    // Se revocaron todas las sesiones, incluida la de quien hizo el cambio.
    this.borrarCookies(respuesta);
    return { ok: true };
  }

  // ── Cookies ───────────────────────────────────────────────────────────────

  private get opcionesBase(): OpcionesCookie {
    return {
      dominio: this.config.get('COOKIE_DOMAIN', { infer: true }),
      produccion: this.config.get('NODE_ENV', { infer: true }) === 'production',
    };
  }

  private escribirCookies(respuesta: Response, sesion: SesionEmitida): void {
    const opciones = this.opcionesBase;
    respuesta.cookie(COOKIE_ACCESO, sesion.tokenAcceso, opcionesAcceso(opciones));
    respuesta.cookie(COOKIE_REFRESCO, sesion.tokenRefresco, opcionesRefresco(opciones));
    respuesta.cookie(COOKIE_CSRF, sesion.tokenCsrf, opcionesCsrf(opciones));
  }

  private borrarCookies(respuesta: Response): void {
    const opciones = this.opcionesBase;
    respuesta.clearCookie(COOKIE_ACCESO, opcionesAcceso(opciones));
    respuesta.clearCookie(COOKIE_REFRESCO, opcionesRefresco(opciones));
    respuesta.clearCookie(COOKIE_CSRF, opcionesCsrf(opciones));
  }

  private leerCookie(peticion: Request, nombre: string): string | undefined {
    return (peticion.cookies as Record<string, string> | undefined)?.[nombre];
  }

  private datosPeticion(peticion: Request): { ip?: string; userAgent?: string } {
    return { ip: peticion.ip, userAgent: peticion.get('user-agent') ?? undefined };
  }
}
