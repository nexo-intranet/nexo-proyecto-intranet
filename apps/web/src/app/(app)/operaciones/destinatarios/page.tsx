'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  crearDestinatarioEsquema,
  type DatosCrearDestinatario,
  type Destinatario,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Distintivo, EncabezadoPagina, EstadoError } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { opcional } from '@/lib/formulario';
import { puedeEditar, useSesion } from '@/lib/sesion';

/**
 * Catálogo de destinatarios: a quién se le gira.
 *
 * Documento y número de cuenta se cifran en reposo y no vuelven completos al
 * navegador — juntos identifican a una persona y permiten mover plata
 * (docs/SEGURIDAD.md §5). De ahí que la tabla muestre «•••• 4821» y no haya
 * ninguna pantalla que enseñe el número entero.
 */

const ETIQUETA_CUENTA: Record<string, string> = {
  AHORROS: 'Ahorros',
  CORRIENTE: 'Corriente',
};

const columnas: ColumnDef<Destinatario, unknown>[] = [
  {
    id: 'nombre',
    header: 'Nombre',
    accessorKey: 'nombre',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{row.original.nombre}</span>
        {!row.original.activo && <Distintivo>Inactivo</Distintivo>}
      </span>
    ),
  },
  {
    id: 'documento',
    header: 'Documento',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra text-grafito">
        {row.original.tipoDoc} •••• {row.original.numeroDocFinal}
      </span>
    ),
  },
  {
    id: 'banco',
    header: 'Banco',
    enableSorting: false,
    cell: ({ row }) => <span className="text-grafito">{row.original.banco ?? '—'}</span>,
  },
  {
    id: 'cuenta',
    header: 'Cuenta',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.cuentaFinal ? (
        <span className="cifra text-grafito">
          {row.original.tipoCuenta ? `${ETIQUETA_CUENTA[row.original.tipoCuenta]} ` : ''}
          •••• {row.original.cuentaFinal}
        </span>
      ) : (
        <span className="text-[12px] text-tenue">Sin cuenta</span>
      ),
  },
];

export default function PaginaDestinatarios() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'asc' });
  const [creando, setCreando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Destinatario | null>(null);

  const puedeCrear = puedeEditar(sesion, 'OPERACIONES');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['destinatarios', empresaId, estado],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<Destinatario>>(
        `destinatarios${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
        })}`,
        { empresaId },
      ),
  });

  const desactivar = useMutation({
    mutationFn: (id: string) =>
      peticion<void>(`destinatarios/${id}`, { metodo: 'DELETE', empresaId }),
    onSuccess: () => {
      toast.success('Destinatario retirado del catálogo.');
      setSeleccionado(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['destinatarios'] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo retirar.');
    },
  });

  if (error) {
    return (
      <EstadoError
        mensaje="No se pudieron cargar los destinatarios."
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Destinatarios"
        descripcion="A quién puede girarse cuando se reparte una operación."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo destinatario
            </Boton>
          )
        }
      />

      <TablaDatos
        columnas={columnas}
        datos={data?.datos}
        total={data?.total ?? 0}
        estado={estado}
        onCambiarEstado={setEstado}
        cargando={isLoading}
        idFila={(destinatario) => destinatario.id}
        filaSeleccionada={seleccionado?.id}
        onSeleccionar={setSeleccionado}
        vacio={{
          titulo: 'Todavía no hay destinatarios',
          descripcion:
            'Sin destinatarios no se puede armar una regla de reparto, y sin regla no se puede dispersar.',
          accion: puedeCrear ? (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo destinatario
            </Boton>
          ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionado !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionado(null)}
        titulo={seleccionado?.nombre ?? ''}
        descripcion={
          seleccionado
            ? `${ETIQUETA_TIPO_DOCUMENTO[seleccionado.tipoDoc]} •••• ${seleccionado.numeroDocFinal}`
            : undefined
        }
        pie={
          seleccionado?.activo && puedeCrear ? (
            <Boton
              variante="peligroSuave"
              disabled={desactivar.isPending}
              onClick={() => desactivar.mutate(seleccionado.id)}
            >
              {desactivar.isPending ? 'Retirando…' : 'Retirar del catálogo'}
            </Boton>
          ) : undefined
        }
      >
        {seleccionado && <DetalleDestinatario destinatario={seleccionado} />}
      </PanelLateral>

      <FormularioDestinatario
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreado={() => {
          setCreando(false);
          void clienteConsultas.invalidateQueries({ queryKey: ['destinatarios'] });
        }}
      />
    </div>
  );
}

function DetalleDestinatario({ destinatario }: { destinatario: Destinatario }) {
  const filas: Array<[string, string]> = [
    ['Nombre', destinatario.nombre],
    [
      'Documento',
      `${ETIQUETA_TIPO_DOCUMENTO[destinatario.tipoDoc]} •••• ${destinatario.numeroDocFinal}`,
    ],
    ['Banco', destinatario.banco ?? '—'],
    [
      'Cuenta',
      destinatario.cuentaFinal
        ? `${destinatario.tipoCuenta ? `${ETIQUETA_CUENTA[destinatario.tipoCuenta]} ` : ''}•••• ${destinatario.cuentaFinal}`
        : '—',
    ],
    ['Estado', destinatario.activo ? 'Activo' : 'Retirado'],
  ];

  return (
    <>
      <dl className="space-y-3">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-baseline justify-between gap-4">
            <dt className="etiqueta shrink-0">{etiqueta}</dt>
            <dd className="min-w-0 text-right text-[13px] text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[12px] leading-relaxed text-grafito">
        Retirar a un destinatario no borra nada: cada giro que ya recibió conserva su propia copia
        del nombre y la cuenta, para que el histórico siga diciendo a dónde se giró realmente.
      </p>
    </>
  );
}

function FormularioDestinatario({
  abierto,
  empresaId,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  empresaId: string | null;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosCrearDestinatario>({
    resolver: zodResolver(crearDestinatarioEsquema),
    defaultValues: { tipoDoc: 'CC' },
  });

  const crear = useMutation({
    mutationFn: (datos: DatosCrearDestinatario) =>
      peticion<Destinatario>('destinatarios', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: (destinatario) => {
      toast.success(`«${destinatario.nombre}» agregado al catálogo.`);
      reset();
      onCreado();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo guardar.');
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
      titulo="Nuevo destinatario"
      descripcion="Queda disponible para las reglas de reparto de esta empresa."
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
            {crear.isPending ? 'Guardando…' : 'Agregar'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        className="space-y-4"
        noValidate
      >
        <Campo etiqueta="Nombre" htmlFor="nombre" obligatorio error={errors.nombre?.message}>
          <Entrada
            id="nombre"
            autoFocus
            {...register('nombre')}
            aria-invalid={Boolean(errors.nombre)}
          />
        </Campo>

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Campo etiqueta="Documento" htmlFor="tipoDoc" obligatorio error={errors.tipoDoc?.message}>
            <Seleccion id="tipoDoc" {...register('tipoDoc')}>
              {TIPOS_DOCUMENTO.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Número"
            htmlFor="numeroDoc"
            obligatorio
            error={errors.numeroDoc?.message}
            ayuda="Solo los dígitos."
          >
            <Entrada
              id="numeroDoc"
              inputMode="numeric"
              autoComplete="off"
              {...register('numeroDoc')}
              aria-invalid={Boolean(errors.numeroDoc)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Banco" htmlFor="banco" error={errors.banco?.message}>
          <Entrada id="banco" {...register('banco', opcional)} />
        </Campo>

        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Campo etiqueta="Tipo de cuenta" htmlFor="tipoCuenta" error={errors.tipoCuenta?.message}>
            <Seleccion id="tipoCuenta" {...register('tipoCuenta', opcional)} defaultValue="">
              <option value="">—</option>
              <option value="AHORROS">Ahorros</option>
              <option value="CORRIENTE">Corriente</option>
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Número de cuenta"
            htmlFor="cuenta"
            error={errors.cuenta?.message}
            ayuda="Se cifra al guardarse."
          >
            <Entrada
              id="cuenta"
              inputMode="numeric"
              autoComplete="off"
              className="cifra"
              {...register('cuenta', opcional)}
            />
          </Campo>
        </div>

        <p className="rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[12px] leading-relaxed text-grafito">
          El documento y la cuenta se cifran antes de guardarse. De vuelta solo salen sus últimos
          cuatro dígitos: suficiente para reconocer la cuenta correcta en una lista, inútil para
          cualquier otra cosa.
        </p>
      </form>
    </PanelLateral>
  );
}
