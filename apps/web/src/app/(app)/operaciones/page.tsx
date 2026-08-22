'use client';

import {
  ESTADOS_OPERACION,
  ETIQUETA_ESTADO_OPERACION,
  abreviarHash,
  formatear,
  type EstadoOperacion,
  type OperacionResumen,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { DetalleOperacion } from '@/components/operaciones/detalle-operacion';
import { FormularioOperacion } from '@/components/operaciones/formulario-operacion';
import { Distintivo, EncabezadoPagina, EstadoError, Esqueleto } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFecha } from '@/lib/formato';
import { puedeEditar, useSesion } from '@/lib/sesion';
import { cn } from '@/lib/utils';

/**
 * Operaciones de la empresa activa.
 *
 * El centro del sistema. La tabla es densa a propósito —veinte filas por pantalla—
 * y el detalle se abre en panel lateral para no perder el filtro ni la página en la
 * que iba quien está revisando (brief §7).
 */

const TONO_ESTADO: Record<EstadoOperacion, 'neutro' | 'acento' | 'exito' | 'peligro'> = {
  BORRADOR: 'neutro',
  REGISTRADA: 'acento',
  CONCILIADA: 'exito',
  ANULADA: 'peligro',
};

const columnas: ColumnDef<OperacionResumen, unknown>[] = [
  {
    id: 'hash',
    header: 'Hash',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.hash ? (
        <span className="hash" title={row.original.hash}>
          {abreviarHash(row.original.hash, 10, 6)}
        </span>
      ) : (
        <span className="text-[12px] text-tenue">—</span>
      ),
  },
  {
    id: 'cliente',
    header: 'Cliente',
    enableSorting: false,
    cell: ({ row }) => <span className="font-medium">{row.original.cliente.nombre}</span>,
  },
  {
    id: 'fechaOperacion',
    header: 'Fecha',
    cell: ({ row }) => (
      <span className="cifra text-grafito">{formatearFecha(row.original.fechaOperacion)}</span>
    ),
  },
  {
    id: 'compra',
    header: 'Compra',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra">
        {formatear(row.original.valorCompra, row.original.monedaCompra)}
      </span>
    ),
  },
  {
    id: 'venta',
    header: 'Venta',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra">{formatear(row.original.valorVenta, row.original.monedaVenta)}</span>
    ),
  },
  {
    id: 'gananciaCOP',
    header: 'Ganancia',
    cell: ({ row }) => {
      const perdida = row.original.gananciaCOP.startsWith('-');
      return (
        <span className={cn('cifra font-medium', perdida ? 'text-peligro' : 'text-tinta')}>
          {formatear(row.original.gananciaCOP, 'COP')}
        </span>
      );
    },
  },
  {
    id: 'estado',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => (
      <Distintivo tono={TONO_ESTADO[row.original.estado]} punto>
        {ETIQUETA_ESTADO_OPERACION[row.original.estado]}
      </Distintivo>
    ),
  },
  {
    id: 'dispersion',
    header: 'Dispersión',
    enableSorting: false,
    cell: ({ row }) => {
      const dispersion = row.original.dispersion;
      if (!dispersion) return <span className="text-[12px] text-tenue">Sin repartir</span>;

      return (
        <Distintivo tono={dispersion.estado === 'EJECUTADA' ? 'exito' : 'alerta'}>
          {dispersion.estado === 'EJECUTADA'
            ? 'Ejecutada'
            : dispersion.estado === 'PARCIAL'
              ? 'Parcial'
              : 'Pendiente'}
        </Distintivo>
      );
    },
  },
];

export default function PaginaOperaciones() {
  // `useSearchParams` obliga a un límite de Suspense en el App Router.
  return (
    <Suspense fallback={<Esqueleto className="m-6 h-64 rounded-md" />}>
      <Contenido />
    </Suspense>
  );
}

function Contenido() {
  const parametros = useSearchParams();
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({
    pagina: 1,
    porPagina: 50,
    orden: 'fechaOperacion',
    dir: 'desc',
  });
  const [filtroEstado, setFiltroEstado] = useState<EstadoOperacion | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);

  const puedeCrear = puedeEditar(sesion, 'OPERACIONES');

  // Llegar con `?operacion=` abre su panel directo. Es lo que hace que pegar un
  // hash en el buscador global caiga en la operación y no en una lista filtrada.
  const desdeUrl = parametros.get('operacion');
  useEffect(() => {
    if (desdeUrl) setSeleccionadaId(desdeUrl);
  }, [desdeUrl]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['operaciones', empresaId, estado, filtroEstado, busqueda],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<OperacionResumen>>(
        `operaciones${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
          estado: filtroEstado ?? undefined,
          busqueda: busqueda.trim() || undefined,
        })}`,
        { empresaId },
      ),
  });

  if (error) {
    return (
      <EstadoError
        mensaje={
          error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar las operaciones.'
        }
        onReintentar={() => void refetch()}
      />
    );
  }

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['operaciones'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['operaciones-resumen'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['operaciones-recientes'] });
  };

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Operaciones"
        descripcion="Compra, venta y ganancia de la empresa activa."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nueva operación
            </Boton>
          )
        }
      />

      {/* Filtros. Las pastillas de estado son lo primero que se toca al revisar:
          «muéstrame lo que falta por conciliar» es la pregunta de todos los días. */}
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
              placeholder="Buscar por hash o cliente…"
              aria-label="Buscar operaciones"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filtrar por estado"
          >
            <PastillaFiltro
              activa={filtroEstado === null}
              onClick={() => {
                setFiltroEstado(null);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
            >
              Todas
            </PastillaFiltro>

            {ESTADOS_OPERACION.map((valor) => (
              <PastillaFiltro
                key={valor}
                activa={filtroEstado === valor}
                onClick={() => {
                  setFiltroEstado(valor);
                  setEstado((anterior) => ({ ...anterior, pagina: 1 }));
                }}
              >
                {ETIQUETA_ESTADO_OPERACION[valor]}
              </PastillaFiltro>
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
        idFila={(operacion) => operacion.id}
        filaSeleccionada={seleccionadaId}
        onSeleccionar={(operacion) => setSeleccionadaId(operacion.id)}
        vacio={{
          titulo: busqueda || filtroEstado ? 'Nada coincide' : 'Todavía no hay operaciones',
          descripcion:
            busqueda || filtroEstado
              ? 'Prueba con otro término o quita el filtro de estado.'
              : 'Registra la primera para empezar a llevar la ganancia y su reparto.',
          accion:
            puedeCrear && !busqueda && !filtroEstado ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                <Plus aria-hidden />
                Nueva operación
              </Boton>
            ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionadaId !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionadaId(null)}
        titulo="Operación"
        descripcion="Detalle, reparto y conciliación."
      >
        {seleccionadaId && (
          <DetalleOperacion
            operacionId={seleccionadaId}
            empresaId={empresaId}
            onCambio={refrescar}
          />
        )}
      </PanelLateral>

      <FormularioOperacion
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreada={() => {
          setCreando(false);
          refrescar();
        }}
      />
    </div>
  );
}

/** Filtro en pastilla. Activo lleva relleno, no solo color de texto. */
function PastillaFiltro({
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
