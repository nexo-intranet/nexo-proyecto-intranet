'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECCIONES = [
  { href: '/administracion/empresas', etiqueta: 'Empresas' },
  { href: '/administracion/usuarios', etiqueta: 'Usuarios' },
  { href: '/administracion/auditoria', etiqueta: 'Auditoría' },
] as const;

export default function LayoutAdministracion({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Secciones de administración"
        className="flex shrink-0 items-center gap-1 border-b border-borde px-4"
      >
        {SECCIONES.map((seccion) => {
          const activa = ruta.startsWith(seccion.href);
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
