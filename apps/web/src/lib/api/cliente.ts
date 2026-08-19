import type { ErrorApi, CodigoError, RespuestaPaginada } from '@nexo/shared';
import { HEADER_CSRF, HEADER_EMPRESA } from '@nexo/shared';

/**
 * Cliente HTTP del navegador.
 *
 * Siempre apunta a `/api/...` de este mismo origen, que reenvía al backend. El
 * navegador nunca conoce la URL real del API ni habla con proveedores externos
 * (docs/SEGURIDAD.md §3.1).
 */

export class ErrorDeApi extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly estado: number,
    readonly detalles?: Record<string, string[]>,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }

  /** La sesión ya no sirve: hay que volver a la pantalla de ingreso. */
  get requiereIngreso(): boolean {
    return ['NO_AUTENTICADO', 'TOKEN_EXPIRADO', 'CUENTA_INACTIVA'].includes(this.codigo);
  }
}

const COOKIE_CSRF = 'nexo_csrf';

/** El token CSRF viaja en una cookie legible y se devuelve en el encabezado. */
function tokenCsrf(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((galleta) => galleta.startsWith(`${COOKIE_CSRF}=`))
    ?.split('=')[1];
}

export interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  /** Empresa activa. Sin ella, las rutas de negocio responden con un error claro. */
  empresaId?: string | null;
  signal?: AbortSignal;
}

export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, empresaId, signal } = opciones;

  const encabezados: Record<string, string> = {};
  if (cuerpo !== undefined) encabezados['content-type'] = 'application/json';
  if (empresaId) encabezados[HEADER_EMPRESA] = empresaId;

  if (metodo !== 'GET') {
    const csrf = tokenCsrf();
    if (csrf) encabezados[HEADER_CSRF] = csrf;
  }

  const respuesta = await fetch(`/api/${ruta.replace(/^\//, '')}`, {
    method: metodo,
    headers: encabezados,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    credentials: 'same-origin',
    signal,
  });

  if (respuesta.status === 204) return undefined as T;

  const texto = await respuesta.text();
  const datos: unknown = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    const error = (datos as ErrorApi)?.error;
    throw new ErrorDeApi(
      error?.codigo ?? 'ERROR_INTERNO',
      error?.mensaje ?? 'Ocurrió un error inesperado.',
      respuesta.status,
      error?.detalles,
    );
  }

  return datos as T;
}

/** Construye la cadena de consulta de una colección paginada. */
export function consulta(parametros: Record<string, string | number | undefined | null>): string {
  const partes = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') partes.set(clave, String(valor));
  }
  const texto = partes.toString();
  return texto ? `?${texto}` : '';
}

export type { RespuestaPaginada };
