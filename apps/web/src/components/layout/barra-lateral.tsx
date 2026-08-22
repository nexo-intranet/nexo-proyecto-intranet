'use client';

import type { SesionActual } from '@nexo/shared';
import { ETIQUETA_MODULO, RUTA_MODULO, type ModuloSistema } from '@nexo/shared';
import {
  Building2,
  ChevronLeft,
  FileText,
  Home,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { modulosVisibles } from '@/lib/sesion';
import { cn } from '@/lib/utils';

/**
 * Barra lateral.
 *
 * Vuelve por decisión del cliente (2026-08-22), que la quiere como en su referencia
 * visual. Se había quitado para ganar ancho en las tablas densas, así que vuelve
 * **colapsable**: abierta muestra los nombres, plegada deja solo los iconos y
 * devuelve 148 de los 200 píxeles. La elección se recuerda.
 *
 * Los módulos van agrupados —lo que se opera y lo que se configura— porque una lista
 * de once entradas planas obliga a leerlas todas para encontrar una.
 */

const ICONO: Record<ModuloSistema, typeof Wallet> = {
  OPERACIONES: Wallet,
  EGRESOS: Receipt,
  EMPLEADOS: Users,
  CONTABILIDAD: FileText,
  CUMPLIMIENTO: ShieldCheck,
  CLIENTES: Building2,
  ADMINISTRACION: SlidersHorizontal,
};

const CLAVE_PLEGADA = 'nexo-lateral-plegada';

export function BarraLateral({ sesion }: { sesion: SesionActual | undefined }) {
  const ruta = usePathname();
  const [plegada, setPlegada] = useState(false);

  useEffect(() => {
    try {
      setPlegada(localStorage.getItem(CLAVE_PLEGADA) === '1');
    } catch {
      // Ventana privada: se queda abierta, que es el estado más útil por defecto.
    }
  }, []);

  const alternar = () => {
    setPlegada((previo) => {
      const siguiente = !previo;
      try {
        localStorage.setItem(CLAVE_PLEGADA, siguiente ? '1' : '0');
      } catch {
        /* sin almacenamiento, vale para esta sesión */
      }
      return siguiente;
    });
  };

  const todos = modulosVisibles(sesion);
  const operacion = todos.filter((modulo) => modulo !== 'ADMINISTRACION');
  const administracion = todos.filter((modulo) => modulo === 'ADMINISTRACION');

  const esActivo = (destino: string) => ruta === destino || ruta.startsWith(`${destino}/`);

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200',
        plegada ? 'w-[60px]' : 'w-[212px]',
      )}
    >
      <Link
        href="/"
        aria-label="Ir al inicio de Nexo"
        className={cn(
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-borde px-4',
          plegada && 'justify-center px-0',
        )}
      >
        {/* El sello dorado sobre negro es el logo. Es el único sitio de la interfaz
            donde la marca aparece a plena saturación. */}
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#0b0d12] text-[13px] font-bold text-marca"
          aria-hidden
        >
          N
        </span>
        {!plegada && (
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold tracking-[-0.02em] text-tinta">
              Nexo
            </span>
            <span className="block truncate text-[10px] uppercase tracking-[0.08em] text-tenue">
              Administración Integral
            </span>
          </span>
        )}
      </Link>

      <nav aria-label="Navegación principal" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <Entrada href="/" etiqueta="Inicio" Icono={Home} activo={ruta === '/'} plegada={plegada} />

        {operacion.length > 0 && (
          <Grupo titulo="Módulos" plegada={plegada}>
            {operacion.map((modulo) => (
              <Entrada
                key={modulo}
                href={RUTA_MODULO[modulo]}
                etiqueta={ETIQUETA_MODULO[modulo]}
                Icono={ICONO[modulo]}
                activo={esActivo(RUTA_MODULO[modulo])}
                plegada={plegada}
              />
            ))}
          </Grupo>
        )}

        {administracion.length > 0 && (
          <Grupo titulo="Administración" plegada={plegada}>
            {administracion.map((modulo) => (
              <Entrada
                key={modulo}
                href={RUTA_MODULO[modulo]}
                etiqueta={ETIQUETA_MODULO[modulo]}
                Icono={ICONO[modulo]}
                activo={esActivo(RUTA_MODULO[modulo])}
                plegada={plegada}
              />
            ))}
          </Grupo>
        )}
      </nav>

      <button
        type="button"
        onClick={alternar}
        aria-label={plegada ? 'Expandir la barra lateral' : 'Plegar la barra lateral'}
        className={cn(
          'flex h-11 shrink-0 items-center gap-2 border-t border-borde px-4 text-[12px] text-tenue transition-colors hover:bg-superficie-alt hover:text-tinta',
          plegada && 'justify-center px-0',
        )}
      >
        <ChevronLeft
          className={cn('size-4 shrink-0 transition-transform', plegada && 'rotate-180')}
          aria-hidden
        />
        {!plegada && 'Plegar'}
      </button>
    </aside>
  );
}

function Grupo({
  titulo,
  plegada,
  children,
}: {
  titulo: string;
  plegada: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      {plegada ? (
        <div className="mx-2 mb-2 border-t border-borde-suave" aria-hidden />
      ) : (
        <p className="encabezado-columna mb-1 px-2.5">{titulo}</p>
      )}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Entrada({
  href,
  etiqueta,
  Icono,
  activo,
  plegada,
}: {
  href: string;
  etiqueta: string;
  Icono: typeof Wallet;
  activo: boolean;
  plegada: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={activo ? 'page' : undefined}
        // Con la barra plegada el nombre no se ve, así que el `title` es lo único
        // que queda para saber a dónde lleva.
        title={plegada ? etiqueta : undefined}
        className={cn(
          'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
          plegada && 'justify-center px-0',
          activo
            ? 'bg-acento-suave font-medium text-acento'
            : 'text-grafito hover:bg-superficie-alt hover:text-tinta',
        )}
      >
        {/* El estado activo no depende solo del color: lleva relleno, peso y filete. */}
        {activo && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-pill bg-acento"
            aria-hidden
          />
        )}
        <Icono className="size-[17px] shrink-0" strokeWidth={1.7} aria-hidden />
        {!plegada && <span className="truncate">{etiqueta}</span>}
      </Link>
    </li>
  );
}
