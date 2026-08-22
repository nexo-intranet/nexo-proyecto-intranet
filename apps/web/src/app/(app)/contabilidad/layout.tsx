'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Contabilidad: gastos, calendario tributario y documentos pedidos a clientes.
 *
 * Tres pestañas y no tres módulos porque las tres son la misma persona en el mismo
 * momento del mes: quien cierra el período revisa los gastos, mira qué vence y
 * persigue lo que falta.
 */
const SECCIONES = [
  { href: '/contabilidad', etiqueta: 'Gastos', exacta: true },
  { href: '/contabilidad/calendario', etiqueta: 'Calendario tributario' },
  { href: '/contabilidad/solicitudes', etiqueta: 'Documentos solicitados' },
] as const;

export default function LayoutContabilidad({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Secciones de contabilidad"
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
