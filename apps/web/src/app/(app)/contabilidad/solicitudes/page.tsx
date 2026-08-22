'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ESTADOS_SOLICITUD,
  ETIQUETA_ESTADO_SOLICITUD,
  crearSolicitudEsquema,
  type Cliente,
  type DatosCrearSolicitud,
  type EstadoSolicitud,
  type RespuestaPaginada,
  type SolicitudDocumento,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AdjuntarArchivo } from '@/components/contabilidad/adjuntar-archivo';
import { Distintivo, EncabezadoPagina, EstadoError, Esqueleto } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFecha } from '@/lib/formato';
import { opcional } from '@/lib/formulario';
import { puedeEditar, useSesion } from '@/lib/sesion';
import { cn } from '@/lib/utils';

/**
 * Documentos que se le piden a un cliente.
 *
 * El estado «vencido» no existe en la base: es una solicitud abierta cuya fecha ya
 * pasó, y se calcula al leer. Eso significa que esta lista está al día sin que
 * ningún proceso nocturno tenga que recorrerla.
 */

const TONO: Record<EstadoSolicitud, 'neutro' | 'exito' | 'peligro'> = {
  SOLICITADO: 'neutro',
  RECIBIDO: 'exito',
  VENCIDO: 'peligro',
};

const columnas: ColumnDef<SolicitudDocumento, unknown>[] = [
  {
    id: 'documento',
    header: 'Documento',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="min-w-0">
        <span className="block truncate font-medium">{row.original.documento}</span>
        <span className="text-[11px] text-tenue">{row.original.cliente.nombre}</span>
      </span>
    ),
  },
  {
    id: 'fechaLimite',
    header: 'Se necesita para',
    cell: ({ row }) => (
      <span className="cifra text-grafito">{formatearFecha(row.original.fechaLimite)}</span>
    ),
  },
  {
    id: 'recibidoEn',
    header: 'Recibido',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.recibidoEn ? (
        <span className="cifra text-grafito">{formatearFecha(row.original.recibidoEn)}</span>
      ) : (
        <span className="text-[12px] text-tenue">—</span>
      ),
  },
  {
    id: 'estado',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => (
      <Distintivo tono={TONO[row.original.estado]} punto>
        {ETIQUETA_ESTADO_SOLICITUD[row.original.estado]}
      </Distintivo>
    ),
  },
];

export default function PaginaSolicitudes() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({
    pagina: 1,
    porPagina: 50,
    orden: 'fechaLimite',
    dir: 'asc',
  });
  const [filtro, setFiltro] = useState<EstadoSolicitud | null>(null);
  const [creando, setCreando] = useState(false);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);

  const puedeCrear = puedeEditar(sesion, 'CONTABILIDAD');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['solicitudes', empresaId, estado, filtro],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<SolicitudDocumento>>(
        `solicitudes-documento${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          estado: filtro ?? undefined,
        })}`,
        { empresaId },
      ),
  });

  const seleccionada = data?.datos.find((fila) => fila.id === seleccionadaId) ?? null;

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['solicitudes'] });
  };

  if (error) {
    return (
      <EstadoError
        mensaje={
          error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar las solicitudes.'
        }
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Documentos solicitados"
        descripcion="Lo que se le pidió a cada cliente y todavía no llega."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Pedir un documento
            </Boton>
          )
        }
      />

      <div className="shrink-0 border-b border-borde bg-superficie">
        <div
          className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-1.5 px-5 py-3 lg:px-8"
          role="group"
          aria-label="Filtrar por estado"
        >
          <Pastilla
            activa={filtro === null}
            onClick={() => {
              setFiltro(null);
              setEstado((anterior) => ({ ...anterior, pagina: 1 }));
            }}
          >
            Todas
          </Pastilla>
          {ESTADOS_SOLICITUD.map((valor) => (
            <Pastilla
              key={valor}
              activa={filtro === valor}
              onClick={() => {
                setFiltro(valor);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
            >
              {ETIQUETA_ESTADO_SOLICITUD[valor]}
            </Pastilla>
          ))}
        </div>
      </div>

      <TablaDatos
        columnas={columnas}
        datos={data?.datos}
        total={data?.total ?? 0}
        estado={estado}
        onCambiarEstado={setEstado}
        cargando={isLoading}
        idFila={(solicitud) => solicitud.id}
        filaSeleccionada={seleccionadaId}
        onSeleccionar={(solicitud) => setSeleccionadaId(solicitud.id)}
        vacio={{
          titulo: filtro ? 'Nada coincide' : 'No hay documentos pendientes',
          descripcion: filtro
            ? 'Prueba con otro estado.'
            : 'Cuando le pidas un documento a un cliente, queda aquí con su plazo.',
          accion:
            puedeCrear && !filtro ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                <Plus aria-hidden />
                Pedir un documento
              </Boton>
            ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionadaId !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionadaId(null)}
        titulo="Documento solicitado"
        descripcion="Estado y archivo recibido."
      >
        {!seleccionada ? (
          <Esqueleto className="h-64 rounded-md" />
        ) : (
          <DetalleSolicitud
            solicitud={seleccionada}
            empresaId={empresaId}
            puedeEditar={puedeCrear}
            onCambio={refrescar}
          />
        )}
      </PanelLateral>

      <FormularioSolicitud
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

function DetalleSolicitud({
  solicitud,
  empresaId,
  puedeEditar: permitido,
  onCambio,
}: {
  solicitud: SolicitudDocumento;
  empresaId: string | null;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-semibold leading-snug text-tinta">{solicitud.documento}</p>
        <p className="mt-1 text-[13px] text-grafito">{solicitud.cliente.nombre}</p>
      </div>

      <Distintivo tono={TONO[solicitud.estado]} punto>
        {ETIQUETA_ESTADO_SOLICITUD[solicitud.estado]}
      </Distintivo>

      {solicitud.descripcion && (
        <p className="rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[13px] leading-relaxed text-grafito">
          {solicitud.descripcion}
        </p>
      )}

      <dl className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="etiqueta shrink-0">Se necesita para</dt>
          <dd className="text-[13px] text-tinta">{formatearFecha(solicitud.fechaLimite)}</dd>
        </div>
        {solicitud.recibidoEn && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="etiqueta shrink-0">Recibido</dt>
            <dd className="text-[13px] text-tinta">{formatearFecha(solicitud.recibidoEn)}</dd>
          </div>
        )}
      </dl>

      {/* Subir el archivo es lo que cierra la solicitud: no hay un botón aparte de
          «marcar como recibida», porque marcarla sin el documento la deja cerrada y
          vacía, que es justo el estado que nadie quiere encontrarse en una auditoría. */}
      <AdjuntarArchivo
        rutaSubida={`solicitudes-documento/${solicitud.id}/recibir`}
        rutaDescarga={`solicitudes-documento/${solicitud.id}/archivo`}
        empresaId={empresaId}
        archivo={solicitud.archivo}
        puedeEditar={permitido && solicitud.estado !== 'RECIBIDO'}
        etiqueta="documento"
        onSubido={onCambio}
      />

      {solicitud.estado === 'RECIBIDO' && (
        <p className="text-[12px] leading-relaxed text-tenue">
          Una solicitud recibida no se reabre. Si hace falta otra versión del documento, se pide de
          nuevo: así queda el rastro de las dos entregas.
        </p>
      )}
    </div>
  );
}

function FormularioSolicitud({
  abierto,
  empresaId,
  onCerrar,
  onCreada,
}: {
  abierto: boolean;
  empresaId: string | null;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosCrearSolicitud>({ resolver: zodResolver(crearSolicitudEsquema) });

  const { data: clientes } = useQuery({
    queryKey: ['clientes-selector', empresaId],
    enabled: abierto && Boolean(empresaId),
    queryFn: () => peticion<RespuestaPaginada<Cliente>>('clientes?porPagina=200', { empresaId }),
  });

  const crear = useMutation({
    mutationFn: (datos: DatosCrearSolicitud) =>
      peticion<SolicitudDocumento>('solicitudes-documento', {
        metodo: 'POST',
        cuerpo: datos,
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Documento solicitado.');
      reset();
      onCreada();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo crear la solicitud.');
    },
  });

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => {
        if (!valor) {
          reset();
          onCerrar();
        }
      }}
      titulo="Pedir un documento"
      descripcion="Queda con su plazo y se cierra sola cuando llegue el archivo."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={crear.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={handleSubmit((datos) => crear.mutate(datos))}
            disabled={crear.isPending}
          >
            {crear.isPending ? 'Guardando…' : 'Pedir el documento'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        className="space-y-4"
        noValidate
      >
        <Campo etiqueta="Cliente" htmlFor="clienteId" obligatorio error={errors.clienteId?.message}>
          <Seleccion id="clienteId" defaultValue="" {...register('clienteId')}>
            <option value="" disabled>
              Elige un cliente
            </option>
            {clientes?.datos.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Documento"
          htmlFor="documento"
          obligatorio
          error={errors.documento?.message}
        >
          <Entrada
            id="documento"
            autoFocus
            placeholder="Certificado de existencia y representación legal"
            {...register('documento')}
          />
        </Campo>

        <Campo
          etiqueta="Se necesita para"
          htmlFor="fechaLimite"
          obligatorio
          error={errors.fechaLimite?.message}
          ayuda="Pasada esa fecha, la solicitud aparece como vencida."
        >
          <Entrada id="fechaLimite" type="date" className="cifra" {...register('fechaLimite')} />
        </Campo>

        <Campo
          etiqueta="Para qué se necesita"
          htmlFor="descripcion"
          error={errors.descripcion?.message}
        >
          <Entrada id="descripcion" placeholder="Opcional" {...register('descripcion', opcional)} />
        </Campo>
      </form>
    </PanelLateral>
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
