'use client';

import {
  ESTADOS_DISPERSION,
  ETIQUETA_ESTADO_DISPERSION,
  formatear,
  type DispersionVista,
  type EstadoDispersion,
  type Moneda,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Cuadre,
  Distintivo,
  EncabezadoPagina,
  EstadoError,
  Esqueleto,
} from '@/components/patrones';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { cn } from '@/lib/utils';

/**
 * La lista de conciliación.
 *
 * Es la pantalla del «qué me falta girar hoy». A diferencia de la tabla de
 * operaciones, aquí lo que manda no es la operación sino el giro: cada dispersión
 * se muestra abierta, con sus destinos, porque quien concilia va marcando de a uno
 * y no quiere abrir un panel por cada uno.
 */

export default function PaginaDispersiones() {
  return (
    <Suspense fallback={<Esqueleto className="m-6 h-64 rounded-md" />}>
      <Contenido />
    </Suspense>
  );
}

function Contenido() {
  const parametros = useSearchParams();
  const { empresaId } = useEmpresa();

  const inicial = parametros.get('estado');
  const [filtro, setFiltro] = useState<EstadoDispersion | null>(
    ESTADOS_DISPERSION.includes(inicial as EstadoDispersion) ? (inicial as EstadoDispersion) : null,
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dispersiones', empresaId, filtro],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<DispersionVista>>(
        `dispersiones${consulta({ porPagina: 50, estado: filtro ?? undefined })}`,
        { empresaId },
      ),
  });

  if (error) {
    return (
      <EstadoError
        mensaje={
          error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar las dispersiones.'
        }
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Dispersiones"
        descripcion="Los repartos y el estado de cada giro."
        acciones={
          <Link
            href="/operaciones"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-borde bg-superficie px-3 text-[13px] font-medium text-grafito transition-colors hover:border-borde-fuerte hover:text-tinta"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Operaciones
          </Link>
        }
      />

      <div className="shrink-0 border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-1.5 px-5 py-3 lg:px-8">
          <Pastilla activa={filtro === null} onClick={() => setFiltro(null)}>
            Todas
          </Pastilla>
          {ESTADOS_DISPERSION.map((estado) => (
            <Pastilla key={estado} activa={filtro === estado} onClick={() => setFiltro(estado)}>
              {ETIQUETA_ESTADO_DISPERSION[estado]}
            </Pastilla>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1240px] space-y-4 px-5 py-6 lg:px-8">
          {isLoading ? (
            <>
              <Esqueleto className="h-40 rounded-xl" />
              <Esqueleto className="h-40 rounded-xl" />
            </>
          ) : !data || data.datos.length === 0 ? (
            <div className="rounded-xl border border-borde bg-superficie px-5 py-10 text-center">
              <p className="text-[14px] font-semibold text-tinta">
                {filtro ? 'Nada en ese estado' : 'Todavía no hay dispersiones'}
              </p>
              <p className="mx-auto mt-1 max-w-[48ch] text-[13px] leading-relaxed text-grafito">
                {filtro
                  ? 'Prueba con otro estado o quita el filtro.'
                  : 'Una dispersión se crea desde el detalle de una operación, repartiendo su ganancia.'}
              </p>
            </div>
          ) : (
            data.datos.map((dispersion) => (
              <TarjetaDispersion key={dispersion.id} dispersion={dispersion} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaDispersion({ dispersion }: { dispersion: DispersionVista }) {
  const cuadra = dispersion.diferencia === '0.00';
  const ejecutados = dispersion.destinos.filter((destino) => destino.estado === 'EJECUTADO').length;

  return (
    <article className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-tarjeta">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-superficie-alt px-5 py-3">
        <div className="min-w-0">
          <Link
            href={`/operaciones?operacion=${dispersion.operacionId}`}
            className="text-[13.5px] font-semibold text-acento hover:underline"
          >
            {formatear(dispersion.montoTotal, dispersion.moneda as Moneda)}
          </Link>
          <p className="mt-0.5 text-[12px] text-grafito">
            {dispersion.regla ? dispersion.regla.nombre : 'Reparto manual'} ·{' '}
            <span className="cifra">
              {ejecutados}/{dispersion.destinos.length}
            </span>{' '}
            girados
          </p>
        </div>

        <Distintivo
          tono={
            dispersion.estado === 'EJECUTADA'
              ? 'exito'
              : dispersion.estado === 'PARCIAL'
                ? 'alerta'
                : 'neutro'
          }
          punto
        >
          {ETIQUETA_ESTADO_DISPERSION[dispersion.estado]}
        </Distintivo>
      </div>

      <div className="px-5 py-3">
        {!cuadra && (
          <div className="mb-3">
            <Cuadre
              cuadra={false}
              detalle={`Diferencia ${formatear(dispersion.diferencia, 'COP')}`}
            />
          </div>
        )}

        <ul className="divide-y divide-borde-suave">
          {dispersion.destinos.map((destino) => (
            <li key={destino.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-tinta">
                  {destino.nombreSnapshot}
                </span>
                <span className="text-[11px] text-tenue">
                  {destino.cuentaSnapshot ? `•••• ${destino.cuentaSnapshot}` : 'sin cuenta'}
                  {destino.referenciaPago ? ` · ${destino.referenciaPago}` : ''}
                </span>
              </span>

              <span className="cifra shrink-0 text-tinta">{formatear(destino.monto, 'COP')}</span>

              <span className="shrink-0">
                <Distintivo
                  tono={
                    destino.estado === 'EJECUTADO'
                      ? 'exito'
                      : destino.estado === 'DEVUELTO'
                        ? 'peligro'
                        : 'neutro'
                  }
                >
                  {destino.estado === 'EJECUTADO'
                    ? 'Ejecutado'
                    : destino.estado === 'DEVUELTO'
                      ? 'Devuelto'
                      : 'Pendiente'}
                </Distintivo>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Pastilla({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'h-9 rounded-pill border px-3.5 text-[12.5px] font-medium transition-colors',
        activa
          ? 'border-acento bg-acento text-sobre-acento'
          : 'border-borde bg-superficie text-grafito hover:border-borde-fuerte hover:text-tinta',
      )}
    >
      {children}
    </button>
  );
}
