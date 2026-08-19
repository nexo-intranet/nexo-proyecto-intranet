'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarraLateral } from '@/components/layout/barra-lateral';
import { BarraSuperior } from '@/components/layout/barra-superior';
import { PaletaComandos } from '@/components/layout/paleta-comandos';
import { ErrorDeApi } from '@/lib/api/cliente';
import { useSesion } from '@/lib/sesion';

/**
 * Marco de la aplicación (brief §7): barra lateral fija a la izquierda, barra
 * superior con el selector de empresa y la búsqueda global, contenido a la derecha.
 *
 * Que aquí se redirija al ingreso es comodidad de navegación, no seguridad: el
 * backend rechaza igual cualquier petición sin sesión.
 */
export default function LayoutAplicacion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: sesion, isLoading, error } = useSesion();
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

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
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <div className="w-[200px] border-r border-[--color-borde] bg-[--color-superficie-alt]" />
        <div className="flex-1">
          <div className="h-12 border-b border-[--color-borde]" />
          <div className="space-y-3 p-6">
            <div className="h-6 w-48 animate-pulse rounded-[4px] bg-[--color-superficie-alt]" />
            <div className="h-40 animate-pulse rounded-[6px] bg-[--color-superficie-alt]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <BarraLateral sesion={sesion} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior sesion={sesion} onAbrirBuscador={() => setBuscadorAbierto(true)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <PaletaComandos
        sesion={sesion}
        abierto={buscadorAbierto}
        onCambiarAbierto={setBuscadorAbierto}
      />
    </div>
  );
}
