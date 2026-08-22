'use client';

import {
  ESTADOS_EGRESO,
  ETIQUETA_ESTADO_EGRESO,
  ETIQUETA_TIPO_INTANGIBLE,
  formatear,
  type EgresoDetalle,
  type EgresoResumen,
  type EstadoEgreso,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { DetalleEgreso } from '@/components/egresos/detalle-egreso';
import { FormularioEgreso } from '@/components/egresos/formulario-egreso';
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
 * Egresos: pagos por intangibles.
 *
 * Cada fila tiene su orden de pago con consecutivo. La columna del consecutivo es
 * lo primero que mira quien está buscando un documento, así que va temprano y en
 * monoespaciada.
 */

const columnas: ColumnDef<EgresoResumen, unknown>[] = [
  {
    id: 'orden',
    header: 'Orden',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.ordenVigente ? (
        <span className="cifra font-medium">{row.original.ordenVigente.consecutivo}</span>
      ) : (
        <span className="text-[12px] text-tenue">—</span>
      ),
  },
  {
    id: 'concepto',
    header: 'Concepto',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.original.concepto}</span>
        <span className="text-[11px] text-tenue">
          {ETIQUETA_TIPO_INTANGIBLE[row.original.tipoIntangible]}
        </span>
      </span>
    ),
  },
  {
    id: 'beneficiario',
    header: 'Beneficiario',
    enableSorting: false,
    cell: ({ row }) => <span className="text-grafito">{row.original.beneficiario}</span>,
  },
  {
    id: 'fecha',
    header: 'Fecha',
    cell: ({ row }) => (
      <span className="cifra text-grafito">{formatearFecha(row.original.fecha)}</span>
    ),
  },
  {
    id: 'monto',
    header: 'Monto',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra">{formatear(row.original.monto, row.original.moneda)}</span>
    ),
  },
  {
    id: 'montoCOP',
    header: 'En pesos',
    cell: ({ row }) => (
      <span className="cifra font-medium">{formatear(row.original.montoCOP, 'COP')}</span>
    ),
  },
  {
    id: 'estado',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => (
      <Distintivo tono={row.original.estado === 'ANULADO' ? 'peligro' : 'acento'} punto>
        {ETIQUETA_ESTADO_EGRESO[row.original.estado]}
      </Distintivo>
    ),
  },
];

export default function PaginaEgresos() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({
    pagina: 1,
    porPagina: 50,
    orden: 'fecha',
    dir: 'desc',
  });
  const [filtroEstado, setFiltroEstado] = useState<EstadoEgreso | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  const puedeCrear = puedeEditar(sesion, 'EGRESOS');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['egresos', empresaId, estado, filtroEstado, busqueda],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<EgresoResumen>>(
        `egresos${consulta({
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

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['egreso', seleccionadoId, empresaId],
    enabled: Boolean(seleccionadoId),
    queryFn: () => peticion<EgresoDetalle>(`egresos/${seleccionadoId}`, { empresaId }),
  });

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['egresos'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['egreso'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['egresos-resumen'] });
  };

  if (error) {
    return (
      <EstadoError
        mensaje={error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar los egresos.'}
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Egresos"
        descripcion="Pagos por intangibles y sus órdenes de pago."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo egreso
            </Boton>
          )
        }
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
              placeholder="Buscar por concepto, beneficiario o consecutivo…"
              aria-label="Buscar egresos"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filtrar por estado"
          >
            <Pastilla
              activa={filtroEstado === null}
              onClick={() => {
                setFiltroEstado(null);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
            >
              Todos
            </Pastilla>
            {ESTADOS_EGRESO.map((valor) => (
              <Pastilla
                key={valor}
                activa={filtroEstado === valor}
                onClick={() => {
                  setFiltroEstado(valor);
                  setEstado((anterior) => ({ ...anterior, pagina: 1 }));
                }}
              >
                {ETIQUETA_ESTADO_EGRESO[valor]}
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
        idFila={(egreso) => egreso.id}
        filaSeleccionada={seleccionadoId}
        onSeleccionar={(egreso) => setSeleccionadoId(egreso.id)}
        vacio={{
          titulo: busqueda || filtroEstado ? 'Nada coincide' : 'Todavía no hay egresos',
          descripcion:
            busqueda || filtroEstado
              ? 'Prueba con otro término o quita el filtro.'
              : 'Registra el primero. Al guardarlo se emite su orden de pago con consecutivo.',
          accion:
            puedeCrear && !busqueda && !filtroEstado ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                <Plus aria-hidden />
                Nuevo egreso
              </Boton>
            ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionadoId !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionadoId(null)}
        titulo="Egreso"
        descripcion="Detalle, órdenes de pago y anulación."
      >
        {cargandoDetalle || !detalle ? (
          <Esqueleto className="h-64 rounded-md" />
        ) : (
          <DetalleEgreso egreso={detalle} empresaId={empresaId} onCambio={refrescar} />
        )}
      </PanelLateral>

      <FormularioEgreso
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreado={(egreso) => {
          setCreando(false);
          refrescar();
          setSeleccionadoId(egreso.id);
        }}
      />
    </div>
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
