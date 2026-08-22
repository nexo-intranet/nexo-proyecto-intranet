'use client';

import { ETIQUETA_MODULO, type ModuloSistema } from '@nexo/shared';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoPagina } from '@/components/patrones';

/**
 * Un módulo que la navegación ofrece pero que todavía no existe.
 *
 * La alternativa era esconderlo del menú hasta tenerlo listo, y es peor: el equipo
 * ya sabe por el brief que son ocho módulos, y no encontrar uno se lee como una
 * falla del sistema. Decir «va en la etapa 4» convierte una ausencia sospechosa en
 * un plan visible.
 */
export function ModuloPendiente({
  modulo,
  etapa,
  resumen,
  incluye,
}: {
  modulo: ModuloSistema;
  etapa: number;
  resumen: string;
  incluye: string[];
}) {
  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina titulo={ETIQUETA_MODULO[modulo]} descripcion={resumen} />

      <div className="mx-auto w-full max-w-[640px] px-5 py-14 text-center lg:px-8">
        <span
          className="mx-auto grid size-12 place-items-center rounded-xl border border-borde bg-superficie text-decorativo"
          aria-hidden
        >
          <CalendarClock className="size-5" strokeWidth={1.6} />
        </span>

        <h2 className="mt-4 text-[18px] font-semibold text-tinta">
          Este módulo llega en la etapa {etapa}
        </h2>
        <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-grafito">
          {resumen}
        </p>

        <ul className="mx-auto mt-6 max-w-[420px] space-y-2 text-left">
          {incluye.map((linea) => (
            <li
              key={linea}
              className="rounded-md border border-borde bg-superficie px-3.5 py-2.5 text-[13px] text-grafito shadow-tarjeta"
            >
              {linea}
            </li>
          ))}
        </ul>

        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center rounded-md border border-borde bg-superficie px-4 text-[13px] font-medium text-grafito transition-colors hover:border-borde-fuerte hover:text-tinta"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
