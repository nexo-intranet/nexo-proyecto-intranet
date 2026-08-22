'use client';

import {
  CATEGORIAS_GASTO,
  ETIQUETA_CATEGORIA_GASTO,
  formatear,
  type CategoriaGasto,
  type Gasto,
  type RespuestaPaginada,
  type ResumenGastos,
} from '@nexo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Paperclip, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { DetalleGasto } from '@/components/contabilidad/detalle-gasto';
import { FormularioGasto } from '@/components/contabilidad/formulario-gasto';
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
 * Gastos de la empresa.
 *
 * La columna del soporte va primero y es un ícono, no texto: lo que se revisa al
 * cerrar un período no es cuánto costó cada cosa —eso está en el resumen— sino
 * cuáles no tienen factura adjunta. Un vistazo a la columna basta para saberlo.
 */

const columnas: ColumnDef<Gasto, unknown>[] = [
  {
    id: 'soporte',
    header: '',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.soporte ? (
        <Paperclip className="size-3.5 text-acento" aria-label="Con soporte" />
      ) : (
        <span
          className="block size-1.5 rounded-full bg-alerta"
          role="img"
          aria-label="Sin soporte"
        />
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
          {ETIQUETA_CATEGORIA_GASTO[row.original.categoria]}
        </span>
      </span>
    ),
  },
  {
    id: 'proveedor',
    header: 'Proveedor',
    enableSorting: false,
    cell: ({ row }) => <span className="text-grafito">{row.original.proveedor ?? '—'}</span>,
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
    cell: ({ row }) =>
      row.original.moneda === 'COP' ? (
        <span className="text-[12px] text-tenue">—</span>
      ) : (
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
    id: 'deducible',
    header: 'Deducible',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.deducible ? (
        <Distintivo tono="acento">Sí</Distintivo>
      ) : (
        <span className="text-[12px] text-tenue">No</span>
      ),
  },
];

export default function PaginaGastos() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({
    pagina: 1,
    porPagina: 50,
    orden: 'fecha',
    dir: 'desc',
  });
  const [categoria, setCategoria] = useState<CategoriaGasto | null>(null);
  const [soloSinSoporte, setSoloSinSoporte] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  const puedeCrear = puedeEditar(sesion, 'CONTABILIDAD');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['gastos', empresaId, estado, categoria, soloSinSoporte, busqueda],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<Gasto>>(
        `gastos${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
          categoria: categoria ?? undefined,
          conSoporte: soloSinSoporte ? 'false' : undefined,
          busqueda: busqueda.trim() || undefined,
        })}`,
        { empresaId },
      ),
  });

  const { data: resumen } = useQuery({
    queryKey: ['gastos-resumen', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () => peticion<ResumenGastos>('gastos/resumen', { empresaId }),
  });

  const seleccionado = data?.datos.find((gasto) => gasto.id === seleccionadoId) ?? null;

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['gastos'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['gastos-resumen'] });
  };

  if (error) {
    return (
      <EstadoError
        mensaje={error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar los gastos.'}
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Gastos"
        descripcion="Lo que cuesta operar, con su soporte adjunto."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo gasto
            </Boton>
          )
        }
      />

      {resumen && resumen.cantidad > 0 && (
        <div className="shrink-0 border-b border-borde bg-superficie">
          <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-2.5 px-5 py-3 md:grid-cols-4 lg:px-8">
            <Cifra etiqueta="Gastos" valor={String(resumen.cantidad)} />
            <Cifra etiqueta="Total" valor={formatear(resumen.totalCOP, 'COP')} />
            <Cifra etiqueta="Deducible" valor={formatear(resumen.deducibleCOP, 'COP')} />
            {/* Este número es el que hace falta antes de cerrar el mes, y por eso es
                un botón: lleva directo a la lista filtrada. */}
            <button
              type="button"
              onClick={() => {
                setSoloSinSoporte(true);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
              disabled={resumen.sinSoporte === 0}
              className={cn(
                'rounded-md border px-3 py-2.5 text-left transition-colors',
                resumen.sinSoporte > 0
                  ? 'border-alerta-borde bg-alerta-suave hover:border-alerta'
                  : 'border-borde bg-superficie-alt',
              )}
            >
              <p className="encabezado-columna">Sin soporte</p>
              <p
                className={cn(
                  'cifra mt-1 text-[15px] font-semibold',
                  resumen.sinSoporte > 0 ? 'text-alerta' : 'text-tinta',
                )}
              >
                {resumen.sinSoporte}
              </p>
            </button>
          </div>
        </div>
      )}

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
              placeholder="Buscar por concepto o proveedor…"
              aria-label="Buscar gastos"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pastilla
              activa={!soloSinSoporte}
              onClick={() => {
                setSoloSinSoporte(false);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
            >
              Todos
            </Pastilla>
            <Pastilla
              activa={soloSinSoporte}
              onClick={() => {
                setSoloSinSoporte(true);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
            >
              Sin soporte
            </Pastilla>
          </div>

          <select
            value={categoria ?? ''}
            onChange={(evento) => {
              setCategoria((evento.target.value || null) as CategoriaGasto | null);
              setEstado((anterior) => ({ ...anterior, pagina: 1 }));
            }}
            aria-label="Filtrar por categoría"
            className="h-9 cursor-pointer rounded-md border border-borde bg-campo px-2.5 pr-8 text-[13px] text-tinta outline-none hover:border-borde-fuerte focus:border-acento"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS_GASTO.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_CATEGORIA_GASTO[valor]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TablaDatos
        columnas={columnas}
        datos={data?.datos}
        total={data?.total ?? 0}
        estado={estado}
        onCambiarEstado={setEstado}
        cargando={isLoading}
        idFila={(gasto) => gasto.id}
        filaSeleccionada={seleccionadoId}
        onSeleccionar={(gasto) => setSeleccionadoId(gasto.id)}
        vacio={{
          titulo:
            busqueda || categoria || soloSinSoporte ? 'Nada coincide' : 'Todavía no hay gastos',
          descripcion:
            busqueda || categoria || soloSinSoporte
              ? 'Prueba con otro término o quita el filtro.'
              : 'Registra el primero. El soporte se adjunta después, cuando llegue la factura.',
          accion:
            puedeCrear && !busqueda && !categoria && !soloSinSoporte ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                <Plus aria-hidden />
                Nuevo gasto
              </Boton>
            ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionadoId !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionadoId(null)}
        titulo="Gasto"
        descripcion="Detalle y soporte."
      >
        {!seleccionado ? (
          <Esqueleto className="h-64 rounded-md" />
        ) : (
          <DetalleGasto
            gasto={seleccionado}
            empresaId={empresaId}
            puedeEditar={puedeCrear}
            onCambio={() => {
              refrescar();
              // Si se eliminó, el panel se queda abierto sobre un gasto que ya no
              // está en la lista. Cerrarlo es más honesto que mostrarlo vacío.
              setSeleccionadoId(null);
            }}
          />
        )}
      </PanelLateral>

      <FormularioGasto
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreado={(gasto) => {
          setCreando(false);
          refrescar();
          setSeleccionadoId(gasto.id);
        }}
      />
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-md border border-borde bg-superficie-alt px-3 py-2.5">
      <p className="encabezado-columna">{etiqueta}</p>
      <p className="cifra mt-1 text-[15px] font-semibold text-tinta">{valor}</p>
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
