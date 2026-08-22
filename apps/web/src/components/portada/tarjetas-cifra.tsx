'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Esqueleto } from '@/components/patrones';
import { cn } from '@/lib/utils';

/**
 * La fila de cifras de la portada.
 *
 * Cada tarjeta responde una pregunta de una sola mirada y lleva a donde se resuelve.
 * Solo aparece la que tiene un dato detrás: una tarjeta que siempre marca cero
 * enseña a ignorar la fila entera, y el día que haya algo nadie lo va a mirar.
 *
 * El tono `alerta` no es decoración — se reserva para lo que está esperando a
 * alguien, y por eso el número va en color solo cuando es mayor que cero.
 */

export interface Cifra {
  etiqueta: string;
  valor: string | number;
  Icono: LucideIcon;
  href: string;
  /** `alerta` cuando el número representa algo pendiente. */
  tono?: 'neutro' | 'alerta';
}

export function TarjetasCifra({ cifras, cargando }: { cifras: Cifra[]; cargando?: boolean }) {
  if (cargando) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, indice) => (
          <Esqueleto key={indice} className="h-[86px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (cifras.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cifras.map((cifra) => {
        const pendiente = cifra.tono === 'alerta' && Number(cifra.valor) > 0;

        return (
          <Link
            key={cifra.etiqueta}
            href={cifra.href}
            className="group flex items-center gap-3.5 rounded-xl border border-borde bg-superficie px-4 py-3.5 shadow-tarjeta transition-colors hover:border-borde-fuerte"
          >
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-lg border transition-colors',
                pendiente
                  ? 'border-alerta-borde bg-alerta-suave text-alerta'
                  : 'border-borde bg-superficie-alt text-acento',
              )}
            >
              <cifra.Icono className="size-[18px]" strokeWidth={1.7} aria-hidden />
            </span>

            <span className="min-w-0">
              <span className="block truncate text-[12px] leading-tight text-grafito">
                {cifra.etiqueta}
              </span>
              <span
                className={cn(
                  'cifra mt-0.5 block text-[20px] font-semibold leading-none',
                  pendiente ? 'text-alerta' : 'text-tinta',
                )}
              >
                {cifra.valor}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
