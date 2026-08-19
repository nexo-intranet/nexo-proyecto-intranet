'use client';

import type { ModuloSistema, SesionActual } from '@nexo/shared';
import { ETIQUETA_MODULO, RUTA_MODULO } from '@nexo/shared';
import {
  Building2,
  FileText,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { modulosVisibles } from '@/lib/sesion';
import { cn } from '@/lib/utils';

const ICONO: Record<ModuloSistema, typeof Wallet> = {
  OPERACIONES: Wallet,
  EGRESOS: Receipt,
  EMPLEADOS: Users,
  CONTABILIDAD: FileText,
  CUMPLIMIENTO: ShieldCheck,
  CLIENTES: Building2,
  ADMINISTRACION: Settings,
};

/**
 * Barra lateral.
 *
 * Los módulos que el usuario no tiene permitidos **no aparecen** — no se muestran
 * deshabilitados. Igual el backend los rechazaría, pero una lista de cosas que no
 * puedes hacer es ruido en una herramienta que se usa ocho horas al día.
 */
export function BarraLateral({ sesion }: { sesion: SesionActual | undefined }) {
  const ruta = usePathname();
  const modulos = modulosVisibles(sesion);

  return (
    <nav
      aria-label="Módulos"
      className="flex w-[200px] shrink-0 flex-col border-r border-[--color-borde] bg-[--color-superficie-alt]"
    >
      <div className="flex h-12 items-center px-4">
        <Link href="/" className="text-[15px] font-semibold tracking-[0.12em]">
          NEXO
        </Link>
      </div>

      <ul className="flex-1 space-y-0.5 px-2 py-2">
        {modulos.map((modulo) => {
          const destino = RUTA_MODULO[modulo];
          const activo = ruta === destino || ruta.startsWith(`${destino}/`);
          const Icono = ICONO[modulo];

          return (
            <li key={modulo}>
              <Link
                href={destino}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-[13px] transition-colors',
                  activo
                    ? 'bg-[--color-dorado-suave] font-medium text-[--color-texto]'
                    : 'text-[--color-texto-suave] hover:bg-white hover:text-[--color-texto]',
                )}
              >
                <Icono
                  className={cn('size-4', activo ? 'text-[--color-dorado]' : 'text-current')}
                  aria-hidden
                />
                {ETIQUETA_MODULO[modulo]}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-[--color-borde] px-2 py-2">
        <Link
          href="/perfil"
          className="flex items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-[13px] text-[--color-texto-suave] hover:bg-white hover:text-[--color-texto]"
        >
          <ScrollText className="size-4" aria-hidden />
          Mi cuenta
        </Link>
      </div>
    </nav>
  );
}
