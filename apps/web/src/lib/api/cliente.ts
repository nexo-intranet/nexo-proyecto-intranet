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

/**
 * Renovación silenciosa de la sesión.
 *
 * El token de acceso dura quince minutos; el de refresco, siete días. Sin esto, a
 * los quince minutos de trabajo la aplicación mandaba a la pantalla de ingreso
 * —con su código de dos factores— aunque hubiera una sesión perfectamente válida en
 * la cookie de refresco. Para alguien que usa esto ocho horas al día, eso son unas
 * treinta interrupciones diarias.
 *
 * **Una sola renovación a la vez, y esto no es una optimización.** El refresco rota
 * el token y el servidor detecta reuso: presentar dos veces el mismo token revoca
 * toda la familia de sesiones, porque eso es lo que parece un token robado. Si cinco
 * peticiones caducan juntas —y caducan juntas, porque comparten el mismo token— y
 * cada una pidiera su renovación, cuatro llegarían con un token ya consumido y
 * cerrarían la sesión de verdad. Aquí la primera renueva y las demás esperan su
 * resultado.
 */
let renovacionEnCurso: Promise<boolean> | null = null;

async function renovarSesion(): Promise<boolean> {
  renovacionEnCurso ??= (async () => {
    try {
      const respuesta = await fetch('/api/auth/refrescar', {
        method: 'POST',
        credentials: 'same-origin',
      });
      return respuesta.ok;
    } catch {
      // Sin red no hay renovación posible; que la petición original falle sola.
      return false;
    } finally {
      renovacionEnCurso = null;
    }
  })();

  return renovacionEnCurso;
}

/** Códigos con los que vale la pena intentar renovar antes de rendirse. */
const RENOVABLES = new Set(['NO_AUTENTICADO', 'TOKEN_EXPIRADO']);

async function enviar(
  ruta: string,
  { metodo = 'GET', cuerpo, empresaId, signal }: OpcionesPeticion,
): Promise<Response> {
  const encabezados: Record<string, string> = {};
  if (cuerpo !== undefined) encabezados['content-type'] = 'application/json';
  if (empresaId) encabezados[HEADER_EMPRESA] = empresaId;

  if (metodo !== 'GET') {
    // Se lee en cada envío, no una sola vez: al renovar, el servidor emite un token
    // CSRF nuevo, y reintentar con el viejo fallaría por otra razón distinta.
    const csrf = tokenCsrf();
    if (csrf) encabezados[HEADER_CSRF] = csrf;
  }

  return fetch(`/api/${ruta.replace(/^\//, '')}`, {
    method: metodo,
    headers: encabezados,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    credentials: 'same-origin',
    signal,
  });
}

async function leer<T>(
  respuesta: Response,
): Promise<{ datos: T; error?: never } | { error: ErrorDeApi }> {
  if (respuesta.status === 204) return { datos: undefined as T };

  const texto = await respuesta.text();
  const datos: unknown = texto ? JSON.parse(texto) : null;

  if (respuesta.ok) return { datos: datos as T };

  const error = (datos as ErrorApi)?.error;
  return {
    error: new ErrorDeApi(
      error?.codigo ?? 'ERROR_INTERNO',
      error?.mensaje ?? 'Ocurrió un error inesperado.',
      respuesta.status,
      error?.detalles,
    ),
  };
}

export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const primera = await leer<T>(await enviar(ruta, opciones));
  if (!primera.error) return primera.datos;

  // Las rutas de autenticación no se reintentan: si `refrescar` devuelve 401, es
  // que no hay sesión que renovar, y reintentarlo sería un ciclo.
  const esAuth = ruta.replace(/^\//, '').startsWith('auth/');

  if (esAuth || !RENOVABLES.has(primera.error.codigo)) throw primera.error;

  if (!(await renovarSesion())) throw primera.error;

  // Un solo reintento. Si vuelve a fallar, la sesión de verdad se acabó.
  const segunda = await leer<T>(await enviar(ruta, opciones));
  if (segunda.error) throw segunda.error;
  return segunda.datos;
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

/**
 * Descarga un archivo generado por el backend.
 *
 * Va aparte de `peticion` porque la respuesta es binaria, no JSON, pero comparte lo
 * que importa: la sesión, la empresa activa y **la renovación silenciosa**. Sin esto
 * una descarga que cae justo después de que expira el token de acceso fallaría con
 * un «no se pudo descargar» que no dice nada.
 *
 * Nunca un enlace directo al API: el backend verifica permisos antes de generar un
 * byte (brief §4.13).
 */
export async function descargarArchivo(
  ruta: string,
  nombre: string,
  empresaId: string | null,
  /** Algunos documentos se emiten y se descargan en el mismo paso: van por POST. */
  opciones: { metodo?: 'GET' | 'POST'; cuerpo?: unknown } = {},
): Promise<void> {
  const { metodo = 'GET', cuerpo } = opciones;

  const pedir = () => {
    const encabezados: Record<string, string> = {};
    if (empresaId) encabezados[HEADER_EMPRESA] = empresaId;
    if (cuerpo !== undefined) encabezados['content-type'] = 'application/json';

    if (metodo !== 'GET') {
      // Se lee en cada envío: al renovar la sesión el servidor emite un token nuevo.
      const csrf = tokenCsrf();
      if (csrf) encabezados[HEADER_CSRF] = csrf;
    }

    return fetch(`/api/${ruta.replace(/^\//, '')}`, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin',
    });
  };

  let respuesta = await pedir();

  if (respuesta.status === 401 && (await renovarSesion())) {
    respuesta = await pedir();
  }

  if (!respuesta.ok) {
    // El servidor sí explica qué pasó —«ese período ya está liquidado»— y perder ese
    // mensaje dejaría al usuario con un «no se pudo» que no dice nada.
    const texto = await respuesta.text().catch(() => '');
    const detalle = texto ? (JSON.parse(texto) as ErrorApi)?.error : undefined;

    throw new ErrorDeApi(
      detalle?.codigo ?? 'ERROR_INTERNO',
      detalle?.mensaje ?? 'No se pudo generar el documento.',
      respuesta.status,
      detalle?.detalles,
    );
  }

  const url = URL.createObjectURL(await respuesta.blob());
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sube un archivo.
 *
 * Va aparte de `peticion` porque el cuerpo es `multipart/form-data` y **no se
 * declara el `content-type`**: lo pone el navegador con el `boundary` que él mismo
 * genera. Escribirlo a mano produce un cuerpo que el servidor no sabe partir.
 *
 * Lo demás es igual: la empresa activa, el token CSRF leído en cada envío y la
 * renovación silenciosa de la sesión. Sin ella, subir un soporte justo cuando
 * caduca el token de acceso fallaría después de que la persona ya eligió el
 * archivo, que es el peor momento posible.
 */
export async function subirArchivo<T>(
  ruta: string,
  archivo: File,
  empresaId: string | null,
  /** Nombre del campo del formulario. El API espera «archivo». */
  campo = 'archivo',
): Promise<T> {
  const pedir = () => {
    const encabezados: Record<string, string> = {};
    if (empresaId) encabezados[HEADER_EMPRESA] = empresaId;

    const csrf = tokenCsrf();
    if (csrf) encabezados[HEADER_CSRF] = csrf;

    const cuerpo = new FormData();
    cuerpo.append(campo, archivo);

    return fetch(`/api/${ruta.replace(/^\//, '')}`, {
      method: 'POST',
      headers: encabezados,
      body: cuerpo,
      credentials: 'same-origin',
    });
  };

  let resultado = await leer<T>(await pedir());

  if (resultado.error && RENOVABLES.has(resultado.error.codigo) && (await renovarSesion())) {
    resultado = await leer<T>(await pedir());
  }

  if (resultado.error) throw resultado.error;
  return resultado.datos;
}
