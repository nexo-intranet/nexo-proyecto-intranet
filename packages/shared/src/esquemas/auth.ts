import { z } from 'zod';
import { emailEsquema, idEsquema, textoRequerido } from './comunes.js';
import type { ModuloSistema, NombreRol } from '../enums/index.js';

/** Contraseñas: mínimo 12 caracteres (docs/SEGURIDAD.md §4). */
export const MIN_LONGITUD_PASSWORD = 12;

export const passwordEsquema = z
  .string({ required_error: 'La contraseña es obligatoria' })
  .min(
    MIN_LONGITUD_PASSWORD,
    `La contraseña debe tener al menos ${MIN_LONGITUD_PASSWORD} caracteres`,
  )
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .refine((valor) => /[a-z]/.test(valor), 'Incluye al menos una letra minúscula')
  .refine((valor) => /[A-Z]/.test(valor), 'Incluye al menos una letra mayúscula')
  .refine((valor) => /\d/.test(valor), 'Incluye al menos un número');

export const iniciarSesionEsquema = z.object({
  email: emailEsquema,
  password: z.string().min(1, 'La contraseña es obligatoria'),
});
export type DatosIniciarSesion = z.infer<typeof iniciarSesionEsquema>;

export const codigoTotpEsquema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código debe tener 6 dígitos');

export const codigoRespaldoEsquema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i, 'El código de respaldo no tiene el formato esperado');

export const verificarSegundoFactorEsquema = z
  .object({
    tokenReto: textoRequerido('El token de verificación', 500),
    codigo: codigoTotpEsquema.optional(),
    codigoRespaldo: codigoRespaldoEsquema.optional(),
  })
  .refine(({ codigo, codigoRespaldo }) => Boolean(codigo) !== Boolean(codigoRespaldo), {
    message: 'Ingresa el código de la aplicación o un código de respaldo',
    path: ['codigo'],
  });
export type DatosVerificarSegundoFactor = z.infer<typeof verificarSegundoFactorEsquema>;

/**
 * Registro del segundo factor. Ocurre antes de que exista sesión —un usuario nuevo
 * debe activar el 2FA en su primer ingreso—, así que se acredita con el token de
 * reto que devuelve `/auth/ingresar`.
 */
export const iniciar2faEsquema = z.object({
  tokenReto: textoRequerido('El token de verificación', 500),
});
export type DatosIniciar2fa = z.infer<typeof iniciar2faEsquema>;

export const confirmar2faEsquema = z.object({
  tokenReto: textoRequerido('El token de verificación', 500),
  codigo: codigoTotpEsquema,
});
export type DatosConfirmar2fa = z.infer<typeof confirmar2faEsquema>;

export const cambiarPasswordEsquema = z
  .object({
    passwordActual: z.string().min(1, 'La contraseña actual es obligatoria'),
    passwordNueva: passwordEsquema,
    confirmacion: z.string(),
  })
  .refine(({ passwordNueva, confirmacion }) => passwordNueva === confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  })
  .refine(({ passwordActual, passwordNueva }) => passwordActual !== passwordNueva, {
    message: 'La nueva contraseña debe ser distinta de la actual',
    path: ['passwordNueva'],
  });
export type DatosCambiarPassword = z.infer<typeof cambiarPasswordEsquema>;

/** Respuesta de `POST /auth/ingresar`. Nunca entrega sesión: solo el reto de 2FA. */
export interface RespuestaIngreso {
  requiere2fa: true;
  tokenReto: string;
  /** El usuario aún no ha registrado su TOTP y debe hacerlo antes de continuar. */
  debeRegistrar2fa: boolean;
}

/** Respuesta de `GET /auth/yo`. Es lo que alimenta la barra lateral y los guards. */
export interface SesionActual {
  usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: NombreRol;
    debeCambiarPassword: boolean;
    totpActivado: boolean;
  };
  permisos: Array<{ modulo: ModuloSistema; puedeVer: boolean; puedeEditar: boolean }>;
  empresas: Array<{ id: string; nombre: string; nit: string; digitoVerificacion: number }>;
  empresaActivaId: string | null;
}

export const seleccionarEmpresaEsquema = z.object({
  empresaId: idEsquema,
});
