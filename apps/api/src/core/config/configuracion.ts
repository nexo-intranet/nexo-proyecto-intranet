import { z } from 'zod';

/**
 * Configuración del servicio, validada al arrancar.
 *
 * Si falta un secreto o está mal formado, el proceso **no arranca**. Es deliberado:
 * un servicio que arranca sin ENCRYPTION_KEY guardaría credenciales en claro, y un
 * arranque a medias es peor que un arranque fallido.
 */

const claveBase64De32Bytes = (nombre: string) =>
  z.string({ required_error: `Falta ${nombre} en el entorno` }).refine((valor) => {
    try {
      return Buffer.from(valor, 'base64').length === 32;
    } catch {
      return false;
    }
  }, `${nombre} debe ser 32 bytes en base64 — generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);

const entornoEsquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL de conexión válida'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  ENCRYPTION_KEY: claveBase64De32Bytes('ENCRYPTION_KEY'),
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  HMAC_DOC_KEY: claveBase64De32Bytes('HMAC_DOC_KEY'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_URL_TTL_SEGUNDOS: z.coerce.number().int().min(30).max(3600).default(300),
});

export type Entorno = z.infer<typeof entornoEsquema>;

export function validarEntorno(fuente: Record<string, unknown>): Entorno {
  const resultado = entornoEsquema.safeParse(fuente);

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida. Revisa el archivo .env:\n${problemas}`);
  }

  const entorno = resultado.data;

  // Los secretos de ejemplo no pueden llegar a producción.
  if (entorno.NODE_ENV === 'production') {
    const sospechosos = [entorno.JWT_ACCESS_SECRET, entorno.JWT_REFRESH_SECRET].filter((valor) =>
      /cambiar|ejemplo|secret|test|local/i.test(valor),
    );
    if (sospechosos.length > 0) {
      throw new Error('Hay secretos de ejemplo configurados en producción. Genera valores nuevos.');
    }
  }

  return entorno;
}

/** Orígenes permitidos por CORS. Nunca `*`: siempre una lista exacta. */
export function origenesPermitidos(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
}
