'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Boton } from '@/components/ui/boton';
import { EstadoVacio } from '@/components/patrones';
import { cn } from '@/lib/utils';

/**
 * Tabla base de la aplicación.
 *
 * Paginación y ordenamiento **en servidor**, siempre: estas tablas van a crecer a
 * miles de operaciones y traerlas completas al navegador para ordenarlas ahí sería
 * insostenible en la Etapa 2 (brief §7).
 *
 * Densa a propósito: filas de 36px, tipografía de 13px y bordes de un pixel. Esto
 * se mira ocho horas al día y la prioridad es cuántos datos caben en pantalla.
 */

export interface EstadoTabla {
  pagina: number;
  porPagina: number;
  orden?: string;
  dir: 'asc' | 'desc';
}

interface PropsTablaDatos<T> {
  columnas: ColumnDef<T, unknown>[];
  datos: T[] | undefined;
  total: number;
  estado: EstadoTabla;
  onCambiarEstado: (estado: EstadoTabla) => void;
  cargando?: boolean;
  /** Qué hacer cuando no hay ni una fila. */
  vacio: { titulo: string; descripcion: string; accion?: ReactNode };
  /** Se dispara al hacer clic en una fila; abre el panel de detalle. */
  onSeleccionar?: (fila: T) => void;
  idFila: (fila: T) => string;
  filaSeleccionada?: string | null;
}

export function TablaDatos<T>({
  columnas,
  datos,
  total,
  estado,
  onCambiarEstado,
  cargando,
  vacio,
  onSeleccionar,
  idFila,
  filaSeleccionada,
}: PropsTablaDatos<T>) {
  const tabla = useReactTable({
    data: datos ?? [],
    columns: columnas,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.max(1, Math.ceil(total / estado.porPagina)),
  });

  const desde = total === 0 ? 0 : (estado.pagina - 1) * estado.porPagina + 1;
  const hasta = Math.min(estado.pagina * estado.porPagina, total);
  const ultimaPagina = Math.max(1, Math.ceil(total / estado.porPagina));

  const ordenarPor = (campo: string) => {
    const mismoCampo = estado.orden === campo;
    onCambiarEstado({
      ...estado,
      orden: campo,
      dir: mismoCampo && estado.dir === 'asc' ? 'desc' : 'asc',
      pagina: 1,
    });
  };

  if (cargando) {
    return (
      <div className="space-y-px p-6">
        {Array.from({ length: 8 }, (_, indice) => (
          <div
            key={indice}
            className="h-9 animate-pulse rounded-[3px] bg-[--color-superficie-alt]"
          />
        ))}
      </div>
    );
  }

  if (!datos || datos.length === 0) {
    return <EstadoVacio {...vacio} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[--color-superficie-alt]">
            {tabla.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id} className="border-b border-[--color-borde]">
                {grupo.headers.map((encabezado) => {
                  const campo = encabezado.column.id;
                  const ordenable = encabezado.column.columnDef.enableSorting !== false;
                  const activo = estado.orden === campo;

                  return (
                    <th
                      key={encabezado.id}
                      scope="col"
                      className="encabezado-columna whitespace-nowrap px-3 py-2 text-left"
                      aria-sort={
                        activo ? (estado.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                    >
                      {ordenable ? (
                        <button
                          type="button"
                          onClick={() => ordenarPor(campo)}
                          className="inline-flex items-center gap-1 hover:text-[--color-texto]"
                        >
                          {flexRender(encabezado.column.columnDef.header, encabezado.getContext())}
                          {activo &&
                            (estado.dir === 'asc' ? (
                              <ArrowUp className="size-3" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden />
                            ))}
                        </button>
                      ) : (
                        flexRender(encabezado.column.columnDef.header, encabezado.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {tabla.getRowModel().rows.map((fila) => {
              const id = idFila(fila.original);
              const seleccionada = id === filaSeleccionada;

              return (
                <tr
                  key={fila.id}
                  onClick={() => onSeleccionar?.(fila.original)}
                  // Con `onSeleccionar` la fila es interactiva, así que tiene que
                  // poder alcanzarse y activarse con teclado, no solo con el ratón.
                  tabIndex={onSeleccionar ? 0 : undefined}
                  role={onSeleccionar ? 'button' : undefined}
                  onKeyDown={(evento) => {
                    if (!onSeleccionar) return;
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault();
                      onSeleccionar(fila.original);
                    }
                  }}
                  className={cn(
                    'border-b border-[--color-borde]',
                    onSeleccionar && 'cursor-pointer',
                    seleccionada
                      ? 'bg-[--color-dorado-suave]'
                      : 'hover:bg-[--color-superficie-alt]',
                  )}
                >
                  {fila.getVisibleCells().map((celda) => (
                    <td key={celda.id} className="px-3 py-2 text-[13px]">
                      {flexRender(celda.column.columnDef.cell, celda.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-[--color-borde] px-4 py-2">
        <p className="text-[12px] text-[--color-texto-suave]">
          <span className="cifra">{desde}</span>–<span className="cifra">{hasta}</span> de{' '}
          <span className="cifra">{total}</span>
        </p>

        <div className="flex items-center gap-1">
          <Boton
            variante="fantasma"
            tamano="icono"
            aria-label="Página anterior"
            disabled={estado.pagina <= 1}
            onClick={() => onCambiarEstado({ ...estado, pagina: estado.pagina - 1 })}
          >
            <ChevronLeft aria-hidden />
          </Boton>
          <span className="cifra px-2 text-[12px] text-[--color-texto-suave]">
            {estado.pagina} / {ultimaPagina}
          </span>
          <Boton
            variante="fantasma"
            tamano="icono"
            aria-label="Página siguiente"
            disabled={estado.pagina >= ultimaPagina}
            onClick={() => onCambiarEstado({ ...estado, pagina: estado.pagina + 1 })}
          >
            <ChevronRight aria-hidden />
          </Boton>
        </div>
      </div>
    </div>
  );
}
