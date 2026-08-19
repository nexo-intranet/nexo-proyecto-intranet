'use client';

import {
  ACCIONES_AUDIT,
  ETIQUETA_ACCION_AUDIT,
  type AccionAudit,
  type RegistroAuditoria,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { Distintivo, EncabezadoPagina, EstadoError } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Entrada } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFechaHora } from '@/lib/formato';

const TONO_ACCION: Partial<Record<AccionAudit, 'exito' | 'alerta' | 'peligro'>> = {
  ANULAR: 'alerta',
  ELIMINAR: 'peligro',
  INGRESO_FALLIDO: 'peligro',
  EXPORTAR: 'alerta',
};

const columnas: ColumnDef<RegistroAuditoria, unknown>[] = [
  {
    id: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) => <span className="cifra">{formatearFechaHora(row.original.createdAt)}</span>,
  },
  {
    id: 'usuario',
    header: 'Usuario',
    enableSorting: false,
    cell: ({ row }) => row.original.usuario?.nombre ?? '—',
  },
  {
    id: 'accion',
    header: 'Acción',
    enableSorting: false,
    cell: ({ row }) => (
      <Distintivo tono={TONO_ACCION[row.original.accion] ?? 'neutro'}>
        {ETIQUETA_ACCION_AUDIT[row.original.accion]}
      </Distintivo>
    ),
  },
  { id: 'entidad', header: 'Entidad', enableSorting: false, accessorKey: 'entidad' },
  {
    id: 'ip',
    header: 'Origen',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra text-[--color-texto-suave]">{row.original.ip ?? '—'}</span>
    ),
  },
];

export default function PaginaAuditoria() {
  const { empresaId } = useEmpresa();
  const [estado, setEstado] = useState<EstadoTabla>({
    pagina: 1,
    porPagina: 50,
    orden: 'createdAt',
    dir: 'desc',
  });
  const [accion, setAccion] = useState<AccionAudit | ''>('');
  const [entidad, setEntidad] = useState('');
  const [seleccionado, setSeleccionado] = useState<RegistroAuditoria | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auditoria', estado, accion, entidad, empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<RegistroAuditoria>>(
        `auditoria${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          dir: estado.dir,
          accion: accion || undefined,
          entidad: entidad || undefined,
        })}`,
        { empresaId },
      ),
  });

  if (error) {
    return (
      <>
        <EncabezadoPagina titulo="Auditoría" />
        <EstadoError
          mensaje={error instanceof ErrorDeApi ? error.message : 'No se pudo cargar el historial.'}
          onReintentar={() => void refetch()}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Historial de la empresa activa. Es de solo lectura: no se puede editar ni borrar."
      />

      <div className="flex items-center gap-2 border-b border-[--color-borde] px-6 py-2.5">
        <select
          aria-label="Filtrar por acción"
          className="h-8 rounded-[4px] border border-[--color-borde] bg-white px-2 text-[13px]"
          value={accion}
          onChange={(evento) => {
            setAccion(evento.target.value as AccionAudit | '');
            setEstado((anterior) => ({ ...anterior, pagina: 1 }));
          }}
        >
          <option value="">Todas las acciones</option>
          {ACCIONES_AUDIT.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ACCION_AUDIT[valor]}
            </option>
          ))}
        </select>

        <Entrada
          aria-label="Filtrar por entidad"
          placeholder="Entidad (Usuario, EmpresaAdministrada…)"
          className="h-8 max-w-[280px]"
          value={entidad}
          onChange={(evento) => {
            setEntidad(evento.target.value);
            setEstado((anterior) => ({ ...anterior, pagina: 1 }));
          }}
        />
      </div>

      <TablaDatos
        columnas={columnas}
        datos={data?.datos}
        total={data?.total ?? 0}
        estado={estado}
        onCambiarEstado={setEstado}
        cargando={isLoading}
        idFila={(registro) => registro.id}
        filaSeleccionada={seleccionado?.id}
        onSeleccionar={setSeleccionado}
        vacio={{
          titulo: 'Sin movimientos registrados',
          descripcion:
            'Aquí aparece cada cambio hecho en esta empresa, con quién lo hizo y desde dónde.',
        }}
      />

      <PanelLateral
        abierto={seleccionado !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionado(null)}
        titulo={seleccionado ? ETIQUETA_ACCION_AUDIT[seleccionado.accion] : ''}
        descripcion={
          seleccionado
            ? `${seleccionado.entidad} · ${formatearFechaHora(seleccionado.createdAt)}`
            : undefined
        }
      >
        {seleccionado && (
          <div className="space-y-4">
            <dl className="space-y-2">
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <dt className="text-[13px] text-[--color-texto-suave]">Usuario</dt>
                <dd className="text-[13px]">{seleccionado.usuario?.nombre ?? '—'}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <dt className="text-[13px] text-[--color-texto-suave]">Registro</dt>
                <dd className="cifra text-[13px]">{seleccionado.entidadId ?? '—'}</dd>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <dt className="text-[13px] text-[--color-texto-suave]">Origen</dt>
                <dd className="cifra text-[13px]">{seleccionado.ip ?? '—'}</dd>
              </div>
            </dl>

            <ComparacionValores
              titulo="Antes"
              valor={seleccionado.valorAnterior}
              vacio="No había un valor previo."
            />
            <ComparacionValores
              titulo="Después"
              valor={seleccionado.valorNuevo}
              vacio="No quedó un valor nuevo."
            />
          </div>
        )}
      </PanelLateral>
    </div>
  );
}

function ComparacionValores({
  titulo,
  valor,
  vacio,
}: {
  titulo: string;
  valor: Record<string, unknown> | null;
  vacio: string;
}) {
  return (
    <section className="space-y-1.5">
      <h2>{titulo}</h2>
      {valor === null ? (
        <p className="text-[13px] text-[--color-texto-suave]">{vacio}</p>
      ) : (
        <pre className="cifra overflow-auto rounded-[4px] border border-[--color-borde] bg-[--color-superficie-alt] p-2.5 text-[12px]">
          {JSON.stringify(valor, null, 2)}
        </pre>
      )}
    </section>
  );
}
