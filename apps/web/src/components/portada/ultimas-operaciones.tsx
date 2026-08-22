'use client';

import {
  ETIQUETA_ESTADO_OPERACION,
  abreviarHash,
  formatear,
  type OperacionResumen,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoSeccion, Esqueleto } from '@/components/patrones';
import { peticion } from '@/lib/api/cliente';
import { formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * Lo último que se registró.
 *
 * Aquí la portada cambia de ritmo y se acerca al de las pantallas de trabajo: filas
 * apretadas, hash monoespaciado, cifras alineadas a la derecha. Es a propósito —
 * quien mira esto está buscando un dato concreto, no contemplando.
 */

const TONO_ESTADO: Record<string, string> = {
  BORRADOR: 'border-borde bg-superficie-alt text-grafito',
  REGISTRADA: 'border-acento-borde bg-acento-suave text-acento',
  CONCILIADA: 'border-exito-borde bg-exito-suave text-exito',
  ANULADA: 'border-peligro-borde bg-peligro-suave text-peligro',
};

export function UltimasOperaciones({ empresaId }: { empresaId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['operaciones-recientes', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<OperacionResumen>>('operaciones?porPagina=5&dir=desc', {
        empresaId,
      }),
  });

  return (
    <section>
      <EncabezadoSeccion
        titulo="Últimas operaciones"
        descripcion="Lo más reciente registrado en esta empresa."
        accion={
          <Link
            href="/operaciones"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-acento transition-colors hover:bg-acento-suave"
          >
            Ver todas
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      {isLoading ? (
        <Esqueleto className="h-[268px] rounded-xl" />
      ) : !data || data.datos.length === 0 ? (
        <div className="rounded-xl border border-borde bg-superficie px-5 py-8 text-center shadow-tarjeta">
          <p className="text-[14px] font-semibold text-tinta">Todavía no hay operaciones</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-grafito">
            La primera que registres aparece aquí, con su hash y su ganancia.
          </p>
          <Link
            href="/operaciones"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-acento px-4 text-[13px] font-medium text-sobre-acento transition-colors hover:bg-acento-fuerte"
          >
            Registrar una operación
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-tarjeta">
          {/* En móvil la tabla no cabe, así que el encabezado solo aparece cuando
              hay columnas que encabezar. */}
          <div className="hidden items-center gap-4 border-b border-borde bg-superficie-alt px-5 py-2.5 sm:flex">
            <span className="encabezado-columna flex-1">Operación</span>
            <span className="encabezado-columna w-[104px] text-right">Ganancia</span>
            <span className="encabezado-columna w-[92px]">Estado</span>
          </div>

          <ul className="divide-y divide-borde-suave">
            {data.datos.map((operacion) => (
              <li key={operacion.id}>
                <Link
                  href={`/operaciones/${operacion.id}`}
                  className="flex flex-col gap-2 px-5 py-3 transition-colors hover:bg-superficie-alt sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-tinta">
                      {operacion.cliente.nombre}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      {operacion.hash ? (
                        <span className="hash">{abreviarHash(operacion.hash, 12, 6)}</span>
                      ) : (
                        <span className="text-[12px] text-tenue">Sin hash</span>
                      )}
                      <span className="text-[12px] text-tenue">
                        · {formatearFecha(operacion.fechaOperacion)}
                      </span>
                    </span>
                  </span>

                  <span className="cifra shrink-0 text-tinta sm:w-[104px] sm:text-right">
                    {formatear(operacion.gananciaCOP, 'COP')}
                  </span>

                  <span className="shrink-0 sm:w-[92px]">
                    <span
                      className={cn(
                        'inline-flex rounded-pill border px-2 py-0.5 text-[11px] font-medium',
                        TONO_ESTADO[operacion.estado],
                      )}
                    >
                      {ETIQUETA_ESTADO_OPERACION[operacion.estado]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
