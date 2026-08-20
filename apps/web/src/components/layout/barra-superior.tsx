'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SesionActual } from '@nexo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { peticion } from '@/lib/api/cliente';
import { SelectorEmpresa } from './selector-empresa';

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

  const salir = async () => {
    try {
      await peticion('auth/salir', { metodo: 'POST' });
    } finally {
      clienteConsultas.clear();
      router.push('/ingresar');
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-borde bg-superficie px-4">
      <SelectorEmpresa sesion={sesion} />

      <div className="h-5 w-px bg-borde" aria-hidden />

      {/* El buscador ocupa el centro porque es lo que más se usa: pegar un hash
          y caer en la operación es el gesto principal del sistema. */}
      <button
        type="button"
        onClick={onAbrirBuscador}
        className="group flex h-8 max-w-[460px] flex-1 items-center gap-2 rounded-sm border border-borde bg-campo px-2.5 text-[13px] text-tenue transition-colors hover:border-borde-fuerte hover:bg-superficie-alt"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Buscar operación, hash o empresa…</span>
        <kbd className="cifra shrink-0 rounded-[3px] border border-borde bg-superficie px-1.5 py-px text-[10px] text-tenue">
          Ctrl K
        </kbd>
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="flex h-8 items-center gap-2 rounded-sm pl-1 pr-2 text-[13px] transition-colors hover:bg-superficie-alt"
          aria-label="Mi cuenta"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-acento-suave text-[10px] font-semibold text-acento-fuerte">
            {sesion ? iniciales(sesion.usuario.nombre) : '·'}
          </span>
          <span className="hidden max-w-[140px] truncate text-tinta sm:block">
            {sesion?.usuario.nombre ?? '…'}
          </span>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[228px] rounded-md border border-borde bg-superficie p-1 shadow-flotante"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-medium text-tinta">
                {sesion?.usuario.nombre}
              </p>
              <p className="truncate text-[12px] text-tenue">{sesion?.usuario.email}</p>
              <p className="mt-1.5 inline-flex rounded-[3px] border border-borde bg-superficie-alt px-1.5 py-px text-[10px] font-medium text-grafito">
                {sesion?.usuario.rol === 'ADMINISTRADOR' ? 'Administrador' : 'Equipo interno'}
              </p>
            </div>

            <DropdownMenu.Separator className="my-1 h-px bg-borde" />

            <DropdownMenu.Item
              onSelect={() => router.push('/perfil')}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] text-grafito outline-none hover:bg-superficie-alt hover:text-tinta focus:bg-superficie-alt focus:text-tinta"
            >
              <UserRound className="size-3.5" aria-hidden />
              Mi cuenta
            </DropdownMenu.Item>

            <DropdownMenu.Item
              onSelect={() => void salir()}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] text-peligro outline-none hover:bg-peligro-suave focus:bg-peligro-suave"
            >
              <LogOut className="size-3.5" aria-hidden />
              Cerrar sesión
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
