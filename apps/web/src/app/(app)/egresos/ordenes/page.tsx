'use client';

import {
  ESTADOS_ORDEN_PAGO,
  ETIQUETA_ESTADO_ORDEN_PAGO,
  type EstadoOrdenPago,
  type OrdenPagoResumen,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Distintivo, EncabezadoPagina, EstadoError } from '@/components/patrones';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * El historial de órdenes de pago.
 *
 * Se consulta por una razón distinta a la tabla de egresos: alguien tiene un
 * consecutivo anotado —en un correo, en un extracto— y necesita llegar al
 * documento. Por eso el buscador filtra por consecutivo y la descarga está en la
 * fila, sin abrir nada.
 *
 * Las anuladas se muestran junto a las vigentes. Un documento anulado que
 * desaparece de la lista deja un hueco en la serie que nadie sabe explicar.
 */
export default function PaginaOrdenesPago() {
  const { empresaId } = useEmpresa();

  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'desc' });
  const [filtro, setFiltro] = useState<EstadoOrdenPago | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ordenes-pago', empresaId, estado, filtro, busqueda],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<OrdenPagoResumen>>(
        `ordenes-pago${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          estado: filtro ?? undefined,
          busqueda: busqueda.trim() || undefined,
        })}`,
        { empresaId },
      ),
  });

  const columnas: ColumnDef<OrdenPagoResumen, unknown>[] = [
    {
      id: 'consecutivo',
      header: 'Consecutivo',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="min-w-0">
          <span className="cifra block font-medium text-tinta">{row.original.consecutivo}</span>
          {row.original.reemplazaA && (
            <span className="text-[11px] text-tenue">
              reemplaza a <span className="cifra">{row.original.reemplazaA}</span>
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'emitidaEn',
      header: 'Emitida',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-grafito">{formatearFechaHora(row.original.emitidaEn)}</span>
      ),
    },
    {
      id: 'emitidaPor',
      header: 'Por',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-grafito">{row.original.emitidaPor?.nombre ?? '—'}</span>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <Distintivo tono={row.original.estado === 'VIGENTE' ? 'exito' : 'peligro'} punto>
            {ETIQUETA_ESTADO_ORDEN_PAGO[row.original.estado]}
          </Distintivo>
          {row.original.motivoAnulacion && (
            <span className="truncate text-[11px] text-tenue" title={row.original.motivoAnulacion}>
              {row.original.motivoAnulacion}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'descargar',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Boton
          variante="fantasma"
          tamano="iconoPequeno"
          aria-label={`Descargar ${row.original.consecutivo}`}
          onClick={(evento) => {
            evento.stopPropagation();
            void descargar(row.original, empresaId);
          }}
        >
          <Download aria-hidden />
        </Boton>
      ),
    },
  ];

  if (error) {
    return (
      <EstadoError
        mensaje={error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar las órdenes.'}
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Órdenes de pago"
        descripcion="El historial completo, incluidas las anuladas."
      />

      <div className="shrink-0 border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-5 py-3 lg:px-8">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-borde bg-campo px-2.5 transition-colors focus-within:border-acento">
            <Search className="size-3.5 shrink-0 text-tenue" aria-hidden />
            <input
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
              placeholder="Buscar por consecutivo…"
              aria-label="Buscar órdenes de pago"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar por estado">
            <Pastilla activa={filtro === null} onClick={() => setFiltro(null)}>
              Todas
            </Pastilla>
            {ESTADOS_ORDEN_PAGO.map((valor) => (
              <Pastilla key={valor} activa={filtro === valor} onClick={() => setFiltro(valor)}>
                {ETIQUETA_ESTADO_ORDEN_PAGO[valor]}
              </Pastilla>
            ))}
          </div>
        </div>
      </div>

      <TablaDatos
        columnas={columnas}
        datos={data?.datos}
        total={data?.total ?? 0}
        estado={estado}
        onCambiarEstado={setEstado}
        cargando={isLoading}
        idFila={(orden) => orden.id}
        vacio={{
          titulo: busqueda || filtro ? 'Nada coincide' : 'Todavía no hay órdenes',
          descripcion:
            busqueda || filtro
              ? 'Prueba con otro consecutivo o quita el filtro.'
              : 'Una orden se emite sola al registrar un egreso.',
        }}
      />
    </div>
  );
}

/** El PDF pasa por el proxy con la sesión y la empresa activa. Nunca enlace directo. */
async function descargar(orden: OrdenPagoResumen, empresaId: string | null): Promise<void> {
  try {
    const respuesta = await fetch(`/api/ordenes-pago/${orden.id}/pdf`, {
      headers: empresaId ? { 'x-empresa-id': empresaId } : {},
      credentials: 'same-origin',
    });
    if (!respuesta.ok) throw new Error('descarga fallida');

    const blob = await respuesta.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${orden.consecutivo}.pdf`;
    enlace.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error('No se pudo descargar la orden.');
  }
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
          ? 'border-acento bg-acento text-superficie'
          : 'border-borde bg-superficie text-grafito hover:border-borde-fuerte hover:text-tinta',
      )}
    >
      {children}
    </button>
  );
}
