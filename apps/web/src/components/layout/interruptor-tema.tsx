'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTema, type Tema } from '@/lib/tema';
import { cn } from '@/lib/utils';

/**
 * Claro, oscuro o seguir al sistema.
 *
 * Un menú y no un interruptor de dos posiciones, porque hay tres estados y el
 * tercero es el que más gente quiere: quien tiene el portátil en oscuro de noche y
 * claro de día espera que la aplicación lo acompañe sin tener que tocarla.
 *
 * El icono muestra **lo que se está viendo**, no lo que está elegido: con «sistema»
 * seleccionado de noche, un icono de monitor no diría nada; una luna sí.
 */

const OPCIONES: Array<{ valor: Tema; etiqueta: string; Icono: typeof Sun }> = [
  { valor: 'claro', etiqueta: 'Claro', Icono: Sun },
  { valor: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'sistema', etiqueta: 'Según el sistema', Icono: Monitor },
];

export function InterruptorTema() {
  const { tema, efectivo, cambiar } = useTema();
  const IconoActual = efectivo === 'oscuro' ? Moon : Sun;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="grid size-9 place-items-center rounded-md text-grafito transition-colors hover:bg-superficie-alt hover:text-tinta"
        aria-label={`Tema: ${efectivo === 'oscuro' ? 'oscuro' : 'claro'}. Cambiar.`}
        title="Cambiar el tema"
      >
        <IconoActual className="size-[17px]" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[180px] rounded-md border border-borde bg-superficie p-1 shadow-flotante"
        >
          {OPCIONES.map(({ valor, etiqueta, Icono }) => (
            <DropdownMenu.Item
              key={valor}
              onSelect={() => cambiar(valor)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] outline-none',
                tema === valor
                  ? 'bg-acento-suave font-medium text-acento'
                  : 'text-grafito hover:bg-superficie-alt hover:text-tinta focus:bg-superficie-alt',
              )}
            >
              <Icono className="size-3.5 shrink-0" aria-hidden />
              {etiqueta}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
