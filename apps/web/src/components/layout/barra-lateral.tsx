'use client';

import type { ModuloSistema, SesionActual } from '@nexo/shared';
import { ETIQUETA_MODULO, RUTA_MODULO } from '@nexo/shared';
import {
  Building2,
  FileText,
  Receipt,
  Settings,
  ShieldCheck,
  UserRound,
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

/** Administración se separa del resto: es configurar el sistema, no operarlo. */
const ES_CONFIGURACION = (modulo: ModuloSistema) => modulo === 'ADMINISTRACION';

/**
 * Barra lateral.
 *
 * Los módulos que el usuario no tiene permitidos **no aparecen** — no se muestran
 * deshabilitados. Igual el backend los rechazaría, pero una lista de cosas que no
 * puedes hacer es ruido en una herramienta de uso diario.
 *
 * El elemento activo lleva una barra azul de 2px pegada al borde izquierdo, no un
 * bloque de color: la posición se lee de reojo, sin que el fondo compita con el
 * contenido de la derecha.
 */
export function BarraLateral({ sesion }: { sesion: SesionActual | undefined }) {
  const ruta = usePathname();
  const modulos = modulosVisibles(sesion);

  const operativos = modulos.filter((modulo) => !ES_CONFIGURACION(modulo));
  const configuracion = modulos.filter(ES_CONFIGURACION);

  const enlace = (modulo: ModuloSistema) => {
    const destino = RUTA_MODULO[modulo];
    const activo = ruta === destino || ruta.startsWith(`${destino}/`);
    const Icono = ICONO[modulo];

    return (
      <li key={modulo}>
        <Link
          href={destino}
          aria-current={activo ? 'page' : undefined}
          className={cn(
            'relative flex items-center gap-2.5 rounded-sm py-1.5 pl-3 pr-2.5 text-[13px]',
            'transition-colors duration-100',
            activo
              ? 'bg-acento-suave font-medium text-acento-fuerte'
              : 'text-grafito hover:bg-superficie-alt hover:text-tinta',
          )}
        >
          {activo && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-r bg-acento"
            />
          )}
          <Icono className={cn('size-4', activo ? 'text-acento' : 'text-tenue')} aria-hidden />
          {ETIQUETA_MODULO[modulo]}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Módulos"
      className="flex w-[212px] shrink-0 flex-col border-r border-borde bg-superficie"
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-borde px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Ir al inicio">
          <span className="grid size-7 place-items-center rounded-sm bg-tinta text-[13px] font-semibold text-white">
            N
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[13px] font-semibold tracking-[0.14em] text-tinta">NEXO</span>
            <span className="mt-[3px] text-[10px] tracking-wide text-tenue">
              Administración Integral
            </span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {operativos.length > 0 && (
          <>
            <p className="encabezado-columna px-3 pb-1.5">Operación</p>
            <ul className="space-y-px">{operativos.map(enlace)}</ul>
          </>
        )}

        {configuracion.length > 0 && (
          <>
            <p className="encabezado-columna px-3 pb-1.5 pt-5">Configuración</p>
            <ul className="space-y-px">{configuracion.map(enlace)}</ul>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-borde px-2 py-2">
        <Link
          href="/perfil"
          aria-current={ruta === '/perfil' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-sm py-1.5 pl-3 pr-2.5 text-[13px] transition-colors',
            ruta === '/perfil'
              ? 'bg-acento-suave font-medium text-acento-fuerte'
              : 'text-grafito hover:bg-superficie-alt hover:text-tinta',
          )}
        >
          <UserRound
            className={cn('size-4', ruta === '/perfil' ? 'text-acento' : 'text-tenue')}
            aria-hidden
          />
          Mi cuenta
        </Link>
      </div>
    </nav>
  );
}
