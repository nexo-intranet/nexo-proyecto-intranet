'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SesionActual } from '@nexo/shared';
import { RUTA_MODULO } from '@nexo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { peticion } from '@/lib/api/cliente';
import { modulosVisibles } from '@/lib/sesion';
import { InterruptorTema } from './interruptor-tema';
import { SelectorEmpresa } from './selector-empresa';

/**
 * La barra de arriba.
 *
 * Ya no lleva la navegación —volvió a la barra lateral, por decisión del cliente—,
 * así que aquí queda lo que **acompaña** al trabajo sin dirigirlo: sobre qué empresa
 * se opera, el buscador, el tema y la cuenta.
 *
 * El buscador se muestra ancho aunque abra la misma paleta que `Ctrl+K`. Un icono
 * suelto se descubre por accidente; una caja con su texto dice qué se puede buscar,
 * y pegar un hash es el gesto principal del sistema (brief §5).
 */

/** Iniciales para el avatar. Dos letras, en mayúscula: «Laura Restrepo» → LR. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}

export function BarraSuperior({
  sesion,
  onAbrirBuscador,
}: {
  sesion: SesionActual | undefined;
  onAbrirBuscador: () => void;
}) {
  const router = useRouter();
  const clienteConsultas = useQueryClient();

  const puedeAdministrar = modulosVisibles(sesion).includes('ADMINISTRACION');

  const salir = async () => {
    try {
      await peticion('auth/salir', { metodo: 'POST' });
    } finally {
      clienteConsultas.clear();
      router.push('/ingresar');
    }
  };

  return (
    <header className="z-40 shrink-0 border-b border-borde bg-superficie">
      <div className="flex h-16 items-center gap-3 px-5">
        <SelectorEmpresa sesion={sesion} />

        <div className="flex flex-1 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onAbrirBuscador}
            className="hidden h-9 w-[300px] items-center gap-2 rounded-md border border-borde bg-campo px-2.5 text-[13px] text-tenue transition-colors hover:border-borde-fuerte hover:bg-superficie-alt md:flex"
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-left">Buscar por hash, cliente o módulo…</span>
            <kbd className="cifra shrink-0 rounded-sm border border-borde bg-superficie px-1.5 py-px text-[10px] text-tenue">
              Ctrl K
            </kbd>
          </button>

          {/* En pantallas angostas la caja no cabe; el atajo sigue existiendo. */}
          <button
            type="button"
            onClick={onAbrirBuscador}
            aria-label="Buscar (Ctrl+K)"
            className="grid size-9 place-items-center rounded-md text-grafito transition-colors hover:bg-superficie-alt hover:text-tinta md:hidden"
          >
            <Search className="size-[17px]" aria-hidden />
          </button>

          <InterruptorTema />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="grid size-9 place-items-center rounded-md transition-colors hover:bg-superficie-alt"
              aria-label="Mi cuenta"
            >
              <span className="grid size-7 place-items-center rounded-full bg-acento-suave text-[11px] font-semibold text-acento">
                {sesion ? iniciales(sesion.usuario.nombre) : '·'}
              </span>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-[236px] rounded-md border border-borde bg-superficie p-1 shadow-flotante"
              >
                <div className="px-2.5 py-2">
                  <p className="truncate text-[13px] font-medium text-tinta">
                    {sesion?.usuario.nombre}
                  </p>
                  <p className="truncate text-[12px] text-tenue">{sesion?.usuario.email}</p>
                  {/* El distintivo del rol es de los pocos sitios donde la marca
                      aparece en la interfaz: identifica, no acciona. */}
                  <p className="mt-1.5 inline-flex rounded-sm border border-marca-borde bg-marca-suave px-1.5 py-px text-[10px] font-medium text-marca-fuerte">
                    {sesion?.usuario.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Equipo interno'}
                  </p>
                </div>

                <DropdownMenu.Separator className="my-1 h-px bg-borde" />

                <DropdownMenu.Item
                  onSelect={() => router.push('/perfil')}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-grafito outline-none hover:bg-superficie-alt hover:text-tinta focus:bg-superficie-alt focus:text-tinta"
                >
                  <UserRound className="size-3.5" aria-hidden />
                  Mi cuenta
                </DropdownMenu.Item>

                {puedeAdministrar && (
                  <DropdownMenu.Item
                    onSelect={() => router.push(RUTA_MODULO.ADMINISTRACION)}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-grafito outline-none hover:bg-superficie-alt hover:text-tinta focus:bg-superficie-alt focus:text-tinta"
                  >
                    <SlidersHorizontal className="size-3.5" aria-hidden />
                    Administración
                  </DropdownMenu.Item>
                )}

                {/* Separada del resto a propósito: cerrar sesión no se pulsa por error. */}
                <DropdownMenu.Separator className="my-1 h-px bg-borde" />

                <DropdownMenu.Item
                  onSelect={() => void salir()}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-peligro outline-none hover:bg-peligro-suave focus:bg-peligro-suave"
                >
                  <LogOut className="size-3.5" aria-hidden />
                  Cerrar sesión
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
