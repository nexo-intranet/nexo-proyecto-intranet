'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SesionActual } from '@nexo/shared';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect } from 'react';
import { useEmpresa } from '@/lib/empresa';
import { cn } from '@/lib/utils';

/**
 * Selector de empresa administrada (decisión #1 del brief).
 *
 * Cambiar de empresa vacía la caché de consultas: lo que estaba en pantalla
 * pertenece a la empresa anterior.
 */
export function SelectorEmpresa({ sesion }: { sesion: SesionActual | undefined }) {
  const { empresaId, cambiarEmpresa, listo } = useEmpresa();
  const empresas = sesion?.empresas ?? [];

  // Si no hay ninguna elegida —primer ingreso— o la guardada ya no está entre las
  // accesibles, se toma la primera. El orden pone a Nexo de primera.
  useEffect(() => {
    if (!listo || empresas.length === 0) return;
    const vigente = empresas.some((empresa) => empresa.id === empresaId);
    if (!vigente) cambiarEmpresa(empresas[0]!.id);
  }, [listo, empresas, empresaId, cambiarEmpresa]);

  const actual = empresas.find((empresa) => empresa.id === empresaId);

  if (empresas.length === 0) {
    return <span className="text-[13px] text-grafito">Sin empresas asignadas</span>;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-8 items-center gap-2 rounded-[4px] border border-borde bg-superficie px-2.5 text-[13px] hover:bg-superficie-alt"
        aria-label="Cambiar de empresa"
      >
        <span className="max-w-[220px] truncate font-medium">
          {actual?.nombre ?? 'Selecciona una empresa'}
        </span>
        <ChevronsUpDown className="size-3.5 text-grafito" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[260px] rounded-[6px] border border-borde bg-superficie p-1 shadow-flotante"
        >
          {empresas.map((empresa) => {
            const seleccionada = empresa.id === empresaId;
            return (
              <DropdownMenu.Item
                key={empresa.id}
                onSelect={() => cambiarEmpresa(empresa.id)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-[4px] px-2.5 py-1.5 text-[13px] outline-none',
                  seleccionada
                    ? 'bg-acento-suave'
                    : 'hover:bg-superficie-alt focus:bg-superficie-alt',
                )}
              >
                <span className="flex flex-col">
                  <span className="truncate">{empresa.nombre}</span>
                  <span className="cifra text-[11px] text-grafito">
                    {empresa.nit}-{empresa.digitoVerificacion}
                  </span>
                </span>
                {seleccionada && <Check className="size-3.5 text-acento" aria-hidden />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
