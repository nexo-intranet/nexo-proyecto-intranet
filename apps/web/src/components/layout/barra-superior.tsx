'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SesionActual } from '@nexo/shared';
import { ETIQUETA_MODULO, RUTA_MODULO } from '@nexo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { peticion } from '@/lib/api/cliente';
import { modulosVisibles } from '@/lib/sesion';
import { cn } from '@/lib/utils';
import { SelectorEmpresa } from './selector-empresa';

/**
 * La única navegación del sistema.
 *
 * Antes había barra lateral. Se quitó porque duplicaba el mosaico de la portada y
 * se comía 200px de ancho en pantallas que son, sobre todo, tablas.
 *
 * Pero quitarla sin más habría dejado un agujero: desde el detalle de una operación
 * no habría forma de llegar a Egresos sin volver al inicio. La navegación principal
 * tiene que seguir alcanzable desde cualquier profundidad, así que se mudó aquí.
 *
 * Administración no está en la fila: es configuración, no trabajo diario. Vive en
 * el menú de la cuenta, separada de lo que se usa todos los días.
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
  const ruta = usePathname();
  const clienteConsultas = useQueryClient();

  const modulos = modulosVisibles(sesion).filter((modulo) => modulo !== 'ADMINISTRACION');
  const puedeAdministrar = modulosVisibles(sesion).includes('ADMINISTRACION');

  const esActivo = (destino: string) => ruta === destino || ruta.startsWith(`${destino}/`);

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
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-5 px-5 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="Ir al inicio de Nexo"
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-tinta text-[13px] font-bold text-superficie"
            aria-hidden
          >
            N
          </span>
          <span className="hidden text-[15px] font-bold tracking-[-0.02em] text-tinta sm:block">
            Nexo
          </span>
        </Link>

        {/* Navegación principal. Con texto, no solo iconos: un icono suelto en una
            barra horizontal se adivina, no se lee. */}
        <nav aria-label="Módulos" className="hidden min-w-0 flex-1 lg:block">
          <ul className="flex items-center gap-0.5">
            {modulos.map((modulo) => {
              const destino = RUTA_MODULO[modulo];
              const activo = esActivo(destino);

              return (
                <li key={modulo}>
                  <Link
                    href={destino}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(
                      'relative flex h-10 items-center rounded-md px-3 text-[13.5px] transition-colors',
                      activo
                        ? 'font-semibold text-acento'
                        : 'font-medium text-grafito hover:bg-superficie-alt hover:text-tinta',
                    )}
                  >
                    {ETIQUETA_MODULO[modulo]}
                    {/* El estado activo no depende solo del color: también lleva peso
                        tipográfico y esta marca. */}
                    {activo && (
                      <span
                        className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-pill bg-acento"
                        aria-hidden
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Por debajo de 1024px la fila no cabe: los mismos módulos, plegados. */}
        {modulos.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] font-medium text-grafito transition-colors hover:bg-superficie-alt hover:text-tinta lg:hidden">
              Módulos
              <ChevronDown className="size-3.5" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                className="z-50 min-w-[200px] rounded-md border border-borde bg-superficie p-1 shadow-flotante"
              >
                {modulos.map((modulo) => (
                  <DropdownMenu.Item
                    key={modulo}
                    onSelect={() => router.push(RUTA_MODULO[modulo])}
                    className={cn(
                      'flex cursor-pointer items-center rounded-sm px-2.5 py-2 text-[13.5px] outline-none',
                      esActivo(RUTA_MODULO[modulo])
                        ? 'font-semibold text-acento'
                        : 'text-grafito hover:bg-superficie-alt hover:text-tinta focus:bg-superficie-alt',
                    )}
                  >
                    {ETIQUETA_MODULO[modulo]}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SelectorEmpresa sesion={sesion} />

          {/* El buscador grande vive en la portada. Aquí queda el acceso, porque
              desde una pantalla de trabajo también hay que poder pegar un hash. */}
          <button
            type="button"
            onClick={onAbrirBuscador}
            aria-label="Buscar (Ctrl+K)"
            title="Buscar · Ctrl+K"
            className="grid size-10 place-items-center rounded-md text-grafito transition-colors hover:bg-superficie-alt hover:text-tinta"
          >
            <Search className="size-[17px]" aria-hidden />
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="grid size-10 place-items-center rounded-md transition-colors hover:bg-superficie-alt"
              aria-label="Mi cuenta"
            >
              <span className="grid size-7 place-items-center rounded-full bg-acento-suave text-[11px] font-semibold text-acento-fuerte">
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
                  <p className="mt-1.5 inline-flex rounded-sm border border-borde bg-superficie-alt px-1.5 py-px text-[10px] font-medium text-grafito">
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
