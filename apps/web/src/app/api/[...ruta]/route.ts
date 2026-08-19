import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy hacia el API (docs/SEGURIDAD.md §3.2).
 *
 * El navegador **solo** habla con este origen. Dos razones:
 *
 *   1. Frontend en Vercel y backend en Railway son sitios distintos, lo que
 *      obligaría a cookies `SameSite=None` y reabriría la puerta a CSRF. Pasando
 *      por aquí, las cookies de sesión son first-party.
 *   2. La URL real del API nunca sale al cliente.
 *
 * Cuando el cliente tenga dominio propio con `app.` y `api.` como subdominios,
 * este proxy se puede quitar y el navegador hablar directo con el API.
 */

function urlDelApi(): string {
  const configurada = process.env.API_INTERNAL_URL;
  if (configurada) return configurada;

  // En producción, caer al localhost por defecto haría que cada petición fallara
  // con un error de red y nadie sabría por qué. Mejor que el despliegue avise.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta API_INTERNAL_URL: el proxy no sabe a dónde reenviar.');
  }

  return 'http://localhost:3001';
}

/** Encabezados que se dejan pasar hacia el API. Lista cerrada, no lo que llegue. */
const HEADERS_PERMITIDOS = [
  'accept',
  'content-type',
  'cookie',
  'x-empresa-id',
  'x-csrf-token',
  'user-agent',
];

async function reenviar(peticion: NextRequest, segmentos: string[]): Promise<NextResponse> {
  const consulta = peticion.nextUrl.search;
  const destino = `${urlDelApi()}/api/v1/${segmentos.join('/')}${consulta}`;

  const encabezados = new Headers();
  for (const nombre of HEADERS_PERMITIDOS) {
    const valor = peticion.headers.get(nombre);
    if (valor) encabezados.set(nombre, valor);
  }

  // El API va detrás de este proxy: sin esto registraría la IP del proxy en el
  // audit log y en el límite de tasa, no la del usuario.
  const origen = peticion.headers.get('x-forwarded-for');
  if (origen) encabezados.set('x-forwarded-for', origen);

  const tieneCuerpo = !['GET', 'HEAD'].includes(peticion.method);

  let respuestaApi: Response;
  try {
    respuestaApi = await fetch(destino, {
      method: peticion.method,
      headers: encabezados,
      body: tieneCuerpo ? await peticion.text() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // El API no respondió. No se filtra el motivo ni la dirección de destino.
    return NextResponse.json(
      {
        error: {
          codigo: 'ERROR_INTERNO',
          mensaje: 'No se pudo conectar con el servidor. Inténtalo de nuevo en un momento.',
        },
      },
      { status: 503 },
    );
  }

  const cuerpo = await respuestaApi.text();
  const respuesta = new NextResponse(cuerpo || null, {
    status: respuestaApi.status,
    headers: {
      'content-type': respuestaApi.headers.get('content-type') ?? 'application/json',
    },
  });

  // Las cookies de sesión llegan del API y hay que reemitirlas tal cual; pueden
  // ser varias, así que no sirve `set`.
  for (const galleta of respuestaApi.headers.getSetCookie()) {
    respuesta.headers.append('set-cookie', galleta);
  }

  return respuesta;
}

type Contexto = { params: Promise<{ ruta: string[] }> };

const manejador = async (peticion: NextRequest, contexto: Contexto): Promise<NextResponse> => {
  const { ruta } = await contexto.params;
  return reenviar(peticion, ruta);
};

export const GET = manejador;
export const POST = manejador;
export const PATCH = manejador;
export const PUT = manejador;
export const DELETE = manejador;

export const dynamic = 'force-dynamic';
