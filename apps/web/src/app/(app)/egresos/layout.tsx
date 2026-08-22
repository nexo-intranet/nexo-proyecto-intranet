'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Egresos y sus órdenes: el registro operativo y su documento legal.
 *
 * Van en pestañas y no en una sola pantalla porque se consultan por razones
 * distintas: los egresos, por lo que se pagó; las órdenes, por un consecutivo que
 * alguien tiene anotado.
 */
const SECCIONES = [
  { href: '/egresos', etiqueta: 'Egresos', exacta: true },
  { href: '/egresos/ordenes', etiqueta: 'Órdenes de pago' },
] as const;

export default function LayoutEgresos({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Secciones de egresos"
        className="mx-auto flex w-full max-w-[1240px] shrink-0 items-center gap-1 border-b border-borde px-5 lg:px-8"
      >
        {SECCIONES.map((seccion) => {
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
