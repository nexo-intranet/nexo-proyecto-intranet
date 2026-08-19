'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SesionActual } from '@nexo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { peticion } from '@/lib/api/cliente';
import { SelectorEmpresa } from './selector-empresa';

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
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[--color-borde] bg-white px-4">
      <SelectorEmpresa sesion={sesion} />

      <button
        type="button"
        onClick={onAbrirBuscador}
        className="flex h-8 max-w-[420px] flex-1 items-center gap-2 rounded-[4px] border border-[--color-borde] px-2.5 text-[13px] text-[--color-texto-suave] hover:bg-[--color-superficie-alt]"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="cifra rounded-[3px] border border-[--color-borde] px-1 text-[11px]">
          Ctrl K
        </kbd>
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="flex h-8 items-center gap-2 rounded-[4px] px-2 text-[13px] hover:bg-[--color-superficie-alt]"
          aria-label="Mi cuenta"
        >
          <User className="size-4 text-[--color-texto-suave]" aria-hidden />
          <span className="max-w-[160px] truncate">{sesion?.usuario.nombre ?? '…'}</span>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[220px] rounded-[6px] border border-[--color-borde] bg-white p-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
          >
            <div className="px-2.5 py-2">
              <p className="text-[13px] font-medium">{sesion?.usuario.nombre}</p>
              <p className="text-[12px] text-[--color-texto-suave]">{sesion?.usuario.email}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-[--color-borde]" />
            <DropdownMenu.Item
              onSelect={() => router.push('/perfil')}
              className="cursor-pointer rounded-[4px] px-2.5 py-1.5 text-[13px] outline-none hover:bg-[--color-superficie-alt] focus:bg-[--color-superficie-alt]"
            >
              Mi cuenta
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => void salir()}
              className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-[13px] text-[--color-peligro] outline-none hover:bg-[#fef2f2] focus:bg-[#fef2f2]"
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
