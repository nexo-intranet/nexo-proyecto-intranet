'use client';

import { type ModuloSistema } from '@nexo/shared';
import { FileSignature, FileText, Receipt, UserPlus, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoSeccion } from '@/components/patrones';

/**
 * Atajos.
 *
 * Reemplazan al mosaico de módulos que había antes: con la barra lateral de vuelta,
 * repetir la navegación en la portada no aporta nada. Estos son **acciones** —lo que
 * alguien viene a hacer— y no destinos.
 *
 * Cada uno depende del permiso de su módulo. Un atajo que lleva a un 403 es peor que
 * no tener el atajo.
 */

interface Atajo {
  etiqueta: string;
  href: string;
  Icono: typeof Wallet;
  modulo: ModuloSistema;
}

const ATAJOS: Atajo[] = [
  { etiqueta: 'Nueva operación', href: '/operaciones', Icono: Wallet, modulo: 'OPERACIONES' },
  { etiqueta: 'Nuevo egreso', href: '/egresos', Icono: Receipt, modulo: 'EGRESOS' },
  { etiqueta: 'Liquidar nómina', href: '/empleados', Icono: Users, modulo: 'EMPLEADOS' },
  { etiqueta: 'Nuevo cliente', href: '/clientes', Icono: UserPlus, modulo: 'CLIENTES' },
  {
    etiqueta: 'Órdenes de pago',
    href: '/egresos/ordenes',
    Icono: FileSignature,
    modulo: 'EGRESOS',
  },
  {
    etiqueta: 'Reglas de reparto',
    href: '/operaciones/reglas',
    Icono: FileText,
    modulo: 'OPERACIONES',
  },
];

export function Atajos({ modulos }: { modulos: ModuloSistema[] }) {
  const disponibles = ATAJOS.filter((atajo) => modulos.includes(atajo.modulo));
  if (disponibles.length === 0) return null;

  return (
    <section>
      <EncabezadoSeccion
        titulo="Atajos"
        descripcion="Lo que se hace todos los días."
        tono="decorativo"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {disponibles.map((atajo) => (
          <Link
            key={atajo.etiqueta}
            href={atajo.href}
            className="group flex flex-col items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-4 text-center shadow-tarjeta transition-colors hover:border-acento-borde hover:bg-acento-suave"
          >
            <span className="grid size-9 place-items-center rounded-lg border border-borde bg-superficie-alt text-acento transition-colors group-hover:border-acento-borde">
              <atajo.Icono className="size-[17px]" strokeWidth={1.7} aria-hidden />
            </span>
            <span className="text-[12px] font-medium leading-tight text-tinta">
              {atajo.etiqueta}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
