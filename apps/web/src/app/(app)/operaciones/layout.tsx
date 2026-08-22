'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Las cuatro pantallas de Operaciones.
 *
 * Las dos primeras son trabajo diario; las dos últimas son el catálogo del que ese
 * trabajo depende. Van juntas porque nadie configura una regla de dispersión sin
 * estar pensando en la operación que va a repartir — mandarlas a Administración
 * las escondería justo de quien las usa.
 */
const SECCIONES = [
  { href: '/operaciones', etiqueta: 'Operaciones', exacta: true },
  { href: '/operaciones/dispersiones', etiqueta: 'Dispersiones' },
  { href: '/operaciones/destinatarios', etiqueta: 'Destinatarios' },
  { href: '/operaciones/reglas', etiqueta: 'Reglas de reparto' },
] as const;

export default function LayoutOperaciones({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Secciones de operaciones"
        className="mx-auto flex w-full max-w-[1240px] shrink-0 items-center gap-1 border-b border-borde px-5 lg:px-8"
      >
        {SECCIONES.map((seccion) => {
          // «Operaciones» es prefijo de todas las demás: sin esto quedaría siempre
          // marcada como activa.
          const activa =
            'exacta' in seccion ? ruta === seccion.href : ruta.startsWith(seccion.href);

          return (
            <Link
              key={seccion.href}
              href={seccion.href}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors',
                activa
                  ? 'border-acento font-medium text-tinta'
                  : 'border-transparent text-grafito hover:text-tinta',
              )}
            >
              {seccion.etiqueta}
            </Link>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
