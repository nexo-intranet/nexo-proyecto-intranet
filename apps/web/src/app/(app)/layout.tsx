'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarraSuperior } from '@/components/layout/barra-superior';
import { PaletaComandos } from '@/components/layout/paleta-comandos';
import { ErrorDeApi } from '@/lib/api/cliente';
import { EVENTO_ABRIR_BUSCADOR, type DetalleAbrirBuscador } from '@/lib/buscador';
import { useSesion } from '@/lib/sesion';

/**
 * Marco de la aplicación.
 *
 * Una sola barra arriba y todo el ancho para el contenido. La barra lateral se
 * quitó: duplicaba el mosaico de la portada y le robaba 200px a pantallas que son,
 * en su mayoría, tablas de datos. Su navegación se mudó al encabezado.
 *
 * Que aquí se redirija al ingreso es comodidad de navegación, no seguridad: el
 * backend rechaza igual cualquier petición sin sesión.
 */
export default function LayoutAplicacion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: sesion, isLoading, error } = useSesion();
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [consultaInicial, setConsultaInicial] = useState('');

  useEffect(() => {
    if (error instanceof ErrorDeApi && error.requiereIngreso) router.replace('/ingresar');
  }, [error, router]);

  // Contraseña temporal: hay que cambiarla antes de seguir.
  useEffect(() => {
    if (sesion?.usuario.debeCambiarPassword) router.replace('/perfil?cambiar=1');
  }, [sesion, router]);

  useEffect(() => {
    const atajo = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        setBuscadorAbierto(true);
      }
    };

    // La portada abre el buscador con un evento en vez de recibirlo por props:
    // el estado vive aquí y la página no tiene por qué conocer el marco.
    const desdeLaPagina = (evento: Event) => {
      setConsultaInicial((evento as CustomEvent<DetalleAbrirBuscador>).detail?.consulta ?? '');
      setBuscadorAbierto(true);
    };

    window.addEventListener('keydown', atajo);
    window.addEventListener(EVENTO_ABRIR_BUSCADOR, desdeLaPagina);
    return () => {
      window.removeEventListener('keydown', atajo);
      window.removeEventListener(EVENTO_ABRIR_BUSCADOR, desdeLaPagina);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="h-16 border-b border-borde bg-superficie" />
        <div className="mx-auto max-w-[1240px] space-y-4 px-5 py-14 lg:px-8">
          <div className="mx-auto h-12 w-[420px] max-w-full animate-pulse rounded-lg bg-superficie" />
          <div className="mx-auto h-11 w-[520px] max-w-full animate-pulse rounded-pill bg-superficie" />
          <div className="mx-auto h-24 w-full max-w-[760px] animate-pulse rounded-xl bg-superficie" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Primera parada del tabulador: saltar la navegación y entrar al contenido. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-acento focus:px-4 focus:py-2 focus:text-[13px] focus:text-superficie"
      >
        Saltar al contenido
      </a>

      <BarraSuperior sesion={sesion} onAbrirBuscador={() => setBuscadorAbierto(true)} />

      {/* El marco tiene altura fija y el contenido hace su propio scroll: es lo que
          permite que una tabla densa fije su encabezado mientras corren las filas. */}
      <main id="contenido" tabIndex={-1} className="min-h-0 flex-1 overflow-auto">
        {children}
      </main>

      <PaletaComandos
        sesion={sesion}
        abierto={buscadorAbierto}
        consultaInicial={consultaInicial}
        onCambiarAbierto={setBuscadorAbierto}
      />
    </div>
  );
}
