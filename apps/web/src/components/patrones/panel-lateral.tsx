'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Boton } from '@/components/ui/boton';

/**
 * Panel lateral deslizante.
 *
 * Los detalles se ven aquí y no en una página nueva: así no se pierde el contexto
 * de la tabla —qué filtro estaba puesto, en qué página iba— que es lo que hace
 * lenta la operación cuando hay que revisar veinte registros seguidos (brief §7).
 */
export function PanelLateral({
  abierto,
  onCambiarAbierto,
  titulo,
  descripcion,
  children,
  pie,
}: {
  abierto: boolean;
  onCambiarAbierto: (abierto: boolean) => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
}) {
  return (
    <Dialog.Root open={abierto} onOpenChange={onCambiarAbierto}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-borde bg-superficie shadow-flotante"
          aria-describedby={descripcion ? 'panel-descripcion' : undefined}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-borde px-5 py-4">
            <div className="space-y-0.5">
              <Dialog.Title className="text-[16px] font-semibold">{titulo}</Dialog.Title>
              {descripcion && (
                <Dialog.Description id="panel-descripcion" className="text-[13px] text-grafito">
                  {descripcion}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Boton variante="fantasma" tamano="icono" aria-label="Cerrar">
                <X aria-hidden />
              </Boton>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>

          {pie && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-borde px-5 py-3">
              {pie}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
