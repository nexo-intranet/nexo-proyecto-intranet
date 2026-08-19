import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  DatosCambiarPassword,
  DatosIniciarSesion,
  DatosVerificarSegundoFactor,
  RespuestaIngreso,
  SesionActual,
} from '@nexo/shared';
import { ErrorNegocio } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { ContextoService } from '../../core/context/contexto.service';
import { CifradoService } from '../../core/crypto/cifrado.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PasswordService } from './servicios/password.service';
import { SesionService, type SesionEmitida } from './servicios/sesion.service';
import { TotpService } from './servicios/totp.service';

const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;
/** Un código TOTP no se reutiliza dentro de este lapso, aunque siga siendo válido. */
const SEGUNDOS_ANTIRREPLAY_TOTP = 90;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly totp: TotpService,
    private readonly sesiones: SesionService,
    private readonly cifrado: CifradoService,
    private readonly audit: AuditService,
    private readonly contexto: ContextoService,
  ) {}

  /**
   * Primer paso del ingreso. Nunca entrega sesión: solo acredita la contraseña y
   * devuelve el reto del segundo factor.
   */
  async ingresar(datos: DatosIniciarSesion): Promise<RespuestaIngreso> {
    const usuario = await this.prisma.db.usuario.findFirst({
      where: { email: datos.email, deletedAt: null },
      select: {
        id: true,
        passwordHash: true,
        activo: true,
        totpActivado: true,
        intentosFallidos: true,
        bloqueadoHasta: true,
      },
    });

    // Se verifica el hash incluso cuando el usuario no existe, con un valor
    // cualquiera: si no, el tiempo de respuesta delataría qué correos están
    // registrados.
    const hashParaComparar =
      usuario?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsYWRvZmFsc28$0000000000000000000000000000000000000000000';
    const coincide = await this.password.verificar(hashParaComparar, datos.password);

    if (!usuario) throw this.credencialesInvalidas();

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      throw new ErrorNegocio(
        'CUENTA_BLOQUEADA',
        `Demasiados intentos fallidos. Vuelve a intentar en ${MINUTOS_BLOQUEO} minutos.`,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!coincide) {
      await this.registrarIntentoFallido(usuario.id, usuario.intentosFallidos, datos.email);
      throw this.credencialesInvalidas();
    }

    if (!usuario.activo) {
      throw new ErrorNegocio(
        'CUENTA_INACTIVA',
        'Tu cuenta no está activa. Comunícate con un administrador.',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.db.usuario.update({
      where: { id: usuario.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });

    return {
      requiere2fa: true,
      tokenReto: await this.sesiones.emitirReto(usuario.id),
      debeRegistrar2fa: !usuario.totpActivado,
    };
  }

  /** Segundo paso: código de la aplicación autenticadora o código de respaldo. */
  async verificarSegundoFactor(
    datos: DatosVerificarSegundoFactor,
    peticion: { ip?: string; userAgent?: string },
  ): Promise<SesionEmitida> {
    const usuarioId = await this.sesiones.verificarReto(datos.tokenReto);

    const usuario = await this.prisma.db.usuario.findFirst({
      where: { id: usuarioId, deletedAt: null, activo: true },
      select: {
        id: true,
        totpActivado: true,
        totpSecretCifrado: true,
        ultimoTotpUsado: true,
        ultimoTotpEn: true,
      },
    });

    if (!usuario?.totpActivado || !usuario.totpSecretCifrado) {
      throw new ErrorNegocio(
        'REQUIERE_2FA',
        'Debes registrar la verificación en dos pasos antes de continuar.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (datos.codigoRespaldo) {
      await this.consumirCodigoRespaldo(usuario.id, datos.codigoRespaldo);
    } else {
      await this.verificarCodigoTotp(usuario, datos.codigo!);
    }

    return this.abrirSesion(usuario.id, peticion);
  }

  /** Genera el secreto y el QR. Todavía no activa nada. */
  async iniciarRegistro2fa(tokenReto: string): Promise<{ secreto: string; qr: string }> {
    const usuarioId = await this.sesiones.verificarReto(tokenReto);

    // El correo sale del registro, no del cliente: es lo que identifica la cuenta
    // dentro de la app autenticadora del usuario.
    const usuario = await this.prisma.db.usuario.findFirstOrThrow({
      where: { id: usuarioId, deletedAt: null, activo: true },
      select: { id: true, email: true },
    });

    const secreto = this.totp.generarSecreto();

    await this.prisma.db.usuario.update({
      where: { id: usuario.id },
      data: { totpSecretCifrado: this.cifrado.cifrar(secreto), totpActivado: false },
    });

    // Generar un secreto nuevo invalida el anterior, así que es un evento de
    // seguridad por derecho propio: queda registrado con su nombre.
    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Usuario',
      entidadId: usuario.id,
      usuarioId: usuario.id,
      valorNuevo: { totpSecretoGenerado: true },
    });

    return { secreto, qr: await this.totp.generarQr(usuario.email, secreto) };
  }

  /**
   * Confirma el registro del 2FA, entrega los códigos de respaldo —una sola vez— y
   * abre la sesión.
   */
  async confirmarRegistro2fa(
    tokenReto: string,
    codigo: string,
    peticion: { ip?: string; userAgent?: string },
  ): Promise<SesionEmitida & { codigosRespaldo: string[] }> {
    const usuarioId = await this.sesiones.verificarReto(tokenReto);

    const usuario = await this.prisma.db.usuario.findFirst({
      where: { id: usuarioId, deletedAt: null, activo: true },
      select: { id: true, totpSecretCifrado: true },
    });

    if (!usuario?.totpSecretCifrado) {
      throw new ErrorNegocio(
        'REQUIERE_2FA',
        'Primero genera el código QR de la verificación en dos pasos.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const secreto = this.cifrado.descifrar(usuario.totpSecretCifrado);
    if (!this.totp.verificar(codigo, secreto)) {
      throw this.codigoInvalido();
    }

    const codigosRespaldo = this.totp.generarCodigosRespaldo();

    // Los hashes de argon2 se calculan antes de abrir la transacción: son ocho y
    // cada uno es deliberadamente lento, así que no tienen por qué mantener una
    // transacción abierta ni una fila bloqueada mientras corren.
    const hashes = await Promise.all(
      codigosRespaldo.map(async (codigoRespaldo) => ({
        usuarioId: usuario.id,
        codigoHash: await this.password.hash(codigoRespaldo),
      })),
    );

    await this.prisma.enTransaccion(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { totpActivado: true, ultimoTotpUsado: codigo, ultimoTotpEn: new Date() },
      });
      // Registrar el 2FA otra vez invalida los códigos anteriores.
      await tx.codigoRespaldo.deleteMany({ where: { usuarioId: usuario.id } });
      await tx.codigoRespaldo.createMany({ data: hashes });
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Usuario',
      entidadId: usuario.id,
      usuarioId: usuario.id,
      valorNuevo: { totpActivado: true },
    });

    const sesion = await this.abrirSesion(usuario.id, peticion);
    return { ...sesion, codigosRespaldo };
  }

  async refrescar(
    tokenRefresco: string,
    peticion: { ip?: string; userAgent?: string },
  ): Promise<SesionEmitida> {
    return this.sesiones.rotar(tokenRefresco, peticion);
  }

  async salir(tokenRefresco: string | undefined, usuarioId: string): Promise<void> {
    if (tokenRefresco) await this.sesiones.revocar(tokenRefresco);
    await this.audit.registrar({ accion: 'SALIR', entidad: 'Usuario', entidadId: usuarioId });
  }

  /** Alimenta la barra lateral y el selector de empresas del frontend. */
  async sesionActual(usuarioId: string): Promise<SesionActual> {
    const usuario = await this.prisma.db.usuario.findFirstOrThrow({
      where: { id: usuarioId, deletedAt: null },
      select: {
        id: true,
        nombre: true,
        email: true,
        debeCambiarPassword: true,
        totpActivado: true,
        rol: { select: { nombre: true } },
        permisos: { select: { modulo: true, puedeVer: true, puedeEditar: true } },
      },
    });

    const esAdministrador = usuario.rol.nombre === 'ADMINISTRADOR';

    // El administrador llega a todas las empresas sin filas en UsuarioEmpresa.
    const empresas = await this.prisma.db.empresaAdministrada.findMany({
      where: {
        deletedAt: null,
        activa: true,
        ...(esAdministrador ? {} : { usuarios: { some: { usuarioId } } }),
      },
      select: { id: true, nombre: true, nit: true, digitoVerificacion: true },
      orderBy: [{ esNexo: 'desc' }, { nombre: 'asc' }],
    });

    return {
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol.nombre,
        debeCambiarPassword: usuario.debeCambiarPassword,
        totpActivado: usuario.totpActivado,
      },
      permisos: usuario.permisos,
      empresas,
      empresaActivaId: this.contexto.empresaId() ?? null,
    };
  }

  async cambiarPassword(usuarioId: string, datos: DatosCambiarPassword): Promise<void> {
    const usuario = await this.prisma.db.usuario.findFirstOrThrow({
      where: { id: usuarioId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    if (!(await this.password.verificar(usuario.passwordHash, datos.passwordActual))) {
      throw new ErrorNegocio(
        'CREDENCIALES_INVALIDAS',
        'La contraseña actual no es correcta.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.db.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await this.password.hash(datos.passwordNueva),
        debeCambiarPassword: false,
      },
    });

    // Cambiar la contraseña cierra las demás sesiones: si alguien más la tenía,
    // deja de tenerla ahora y no cuando expire su token.
    await this.sesiones.revocarTodas(usuario.id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Usuario',
      entidadId: usuario.id,
      valorNuevo: { passwordCambiada: true },
    });
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private async abrirSesion(
    usuarioId: string,
    peticion: { ip?: string; userAgent?: string },
  ): Promise<SesionEmitida> {
    const sesion = await this.sesiones.emitir(usuarioId, peticion);

    await this.prisma.db.usuario.update({
      where: { id: usuarioId },
      data: { ultimoAcceso: new Date(), intentosFallidos: 0, bloqueadoHasta: null },
    });

    await this.audit.registrar({
      accion: 'INGRESAR',
      entidad: 'Usuario',
      entidadId: usuarioId,
      usuarioId,
    });

    return sesion;
  }

  private async verificarCodigoTotp(
    usuario: {
      id: string;
      totpSecretCifrado: string | null;
      ultimoTotpUsado: string | null;
      ultimoTotpEn: Date | null;
    },
    codigo: string,
  ): Promise<void> {
    const usadoRecientemente =
      usuario.ultimoTotpUsado === codigo &&
      usuario.ultimoTotpEn !== null &&
      Date.now() - usuario.ultimoTotpEn.getTime() < SEGUNDOS_ANTIRREPLAY_TOTP * 1000;

    if (usadoRecientemente) throw this.codigoInvalido();

    const secreto = this.cifrado.descifrar(usuario.totpSecretCifrado!);
    if (!this.totp.verificar(codigo, secreto)) throw this.codigoInvalido();

    await this.prisma.db.usuario.update({
      where: { id: usuario.id },
      data: { ultimoTotpUsado: codigo, ultimoTotpEn: new Date() },
    });
  }

  private async consumirCodigoRespaldo(usuarioId: string, codigo: string): Promise<void> {
    const normalizado = this.totp.normalizarCodigoRespaldo(codigo);

    const disponibles = await this.prisma.db.codigoRespaldo.findMany({
      where: { usuarioId, usadoEn: null },
      select: { id: true, codigoHash: true },
    });

    for (const candidato of disponibles) {
      if (await this.password.verificar(candidato.codigoHash, normalizado)) {
        await this.prisma.db.codigoRespaldo.update({
          where: { id: candidato.id },
          data: { usadoEn: new Date() },
        });
        await this.audit.registrar({
          accion: 'INGRESAR',
          entidad: 'Usuario',
          entidadId: usuarioId,
          usuarioId,
          valorNuevo: { metodo: 'codigo_de_respaldo', restantes: disponibles.length - 1 },
        });
        return;
      }
    }

    throw this.codigoInvalido();
  }

  private async registrarIntentoFallido(
    usuarioId: string,
    intentosPrevios: number,
    email: string,
  ): Promise<void> {
    const intentos = intentosPrevios + 1;
    const bloquear = intentos >= MAX_INTENTOS_FALLIDOS;

    await this.prisma.db.usuario.update({
      where: { id: usuarioId },
      data: {
        intentosFallidos: bloquear ? 0 : intentos,
        bloqueadoHasta: bloquear ? new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000) : null,
      },
    });

    await this.audit.registrar({
      accion: 'INGRESO_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuarioId,
      usuarioId,
      valorNuevo: { email, intentos, bloqueada: bloquear },
    });
  }

  /**
   * Un solo mensaje para "no existe ese correo" y "la contraseña no coincide":
   * distinguirlos le confirmaría a un atacante qué correos están registrados.
   */
  private credencialesInvalidas(): ErrorNegocio {
    return new ErrorNegocio(
      'CREDENCIALES_INVALIDAS',
      'El correo o la contraseña no son correctos.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private codigoInvalido(): ErrorNegocio {
    return new ErrorNegocio(
      'CODIGO_2FA_INVALIDO',
      'El código no es válido. Revisa tu aplicación de verificación.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
