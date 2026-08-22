'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_CLIENTE,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_CLIENTE,
  TIPOS_DOCUMENTO,
  crearClienteEsquema,
  type Cliente,
  type DatosCrearCliente,
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
import { opcional } from '@/lib/formulario';
import { useEmpresa } from '@/lib/empresa';
import { puedeEditar, useSesion } from '@/lib/sesion';

/**
 * Clientes de la empresa activa.
 *
 * El documento nunca se muestra completo: la API solo devuelve los últimos cuatro
 * dígitos (Ley 1581, docs/SEGURIDAD.md §5). Por eso la columna dice «•••• 8327» y
 * no hay ninguna pantalla, en ninguna parte, que enseñe el número entero.
 */

const columnas: ColumnDef<Cliente, unknown>[] = [
  {
    id: 'nombre',
    header: 'Nombre',
    accessorKey: 'nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
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
    id: 'tipo',
    header: 'Tipo',
    enableSorting: false,
    cell: ({ row }) => (
      <Distintivo tono={row.original.tipo === 'PERSONA_JURIDICA' ? 'acento' : 'neutro'}>
        {ETIQUETA_TIPO_CLIENTE[row.original.tipo]}
      </Distintivo>
    ),
  },
  {
    id: 'municipio',
    header: 'Municipio',
    enableSorting: false,
    cell: ({ row }) => <span className="text-grafito">{row.original.municipio ?? '—'}</span>,
  },
  {
    id: 'contacto',
    header: 'Contacto',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-grafito">{row.original.email ?? row.original.telefono ?? '—'}</span>
    ),
  },
];

export default function PaginaClientes() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'asc' });
  const [creando, setCreando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);

  const puedeCrear = puedeEditar(sesion, 'CLIENTES');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clientes', empresaId, estado],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<Cliente>>(
        `clientes${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
        })}`,
        { empresaId },
      ),
  });

  if (error) {
    return (
      <EstadoError
        mensaje="No se pudieron cargar los clientes."
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="A quién le presta servicios la empresa activa."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo cliente
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
        idFila={(cliente) => cliente.id}
        filaSeleccionada={seleccionado?.id}
        onSeleccionar={setSeleccionado}
        vacio={{
          titulo: 'Todavía no hay clientes',
          descripcion: 'Registra el primero para poder asociarle operaciones.',
          accion: puedeCrear ? (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo cliente
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
      >
        {seleccionado && <DetalleCliente cliente={seleccionado} />}
      </PanelLateral>

      <FormularioCliente
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreado={() => {
          setCreando(false);
          void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
        }}
      />
    </div>
  );
}

function DetalleCliente({ cliente }: { cliente: Cliente }) {
  const filas: Array<[string, string]> = [
    ['Nombre', cliente.nombre],
    ['Tipo', ETIQUETA_TIPO_CLIENTE[cliente.tipo]],
    ['Documento', `${ETIQUETA_TIPO_DOCUMENTO[cliente.tipoDoc]} •••• ${cliente.numeroDocFinal}`],
    ['Municipio', cliente.municipio ?? '—'],
    ['Correo', cliente.email ?? '—'],
    ['Teléfono', cliente.telefono ?? '—'],
  ];

  if (cliente.ultimoDigitoNit !== null) {
    filas.push(['Último dígito del NIT', String(cliente.ultimoDigitoNit)]);
  }

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
        El número de documento se guarda cifrado y no sale del servidor completo. Aquí solo se ven
        sus últimos cuatro dígitos.
      </p>
    </>
  );
}

function FormularioCliente({
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
    watch,
    formState: { errors },
  } = useForm<DatosCrearCliente>({
    resolver: zodResolver(crearClienteEsquema),
    defaultValues: { tipo: 'PERSONA_NATURAL', tipoDoc: 'CC' },
  });

  const tipo = watch('tipo');

  const crear = useMutation({
    mutationFn: (datos: DatosCrearCliente) =>
      peticion<Cliente>('clientes', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: (cliente) => {
      toast.success(`Cliente «${cliente.nombre}» registrado.`);
      reset();
      onCreado();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo registrar el cliente.');
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
      titulo="Nuevo cliente"
      descripcion="Queda registrado bajo la empresa activa."
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
            {crear.isPending ? 'Guardando…' : 'Registrar cliente'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        className="space-y-4"
        noValidate
      >
        <Campo
          etiqueta="Nombre o razón social"
          htmlFor="nombre"
          obligatorio
          error={errors.nombre?.message}
        >
          <Entrada
            id="nombre"
            autoFocus
            {...register('nombre')}
            aria-invalid={Boolean(errors.nombre)}
          />
        </Campo>

        <Campo etiqueta="Tipo" htmlFor="tipo" obligatorio error={errors.tipo?.message}>
          <Seleccion id="tipo" {...register('tipo')}>
            {TIPOS_CLIENTE.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_CLIENTE[valor]}
              </option>
            ))}
          </Seleccion>
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
            ayuda={
              tipo === 'PERSONA_JURIDICA' ? 'Sin el dígito de verificación.' : 'Solo los dígitos.'
            }
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

        <Campo etiqueta="Municipio" htmlFor="municipio" error={errors.municipio?.message}>
          <Entrada id="municipio" {...register('municipio', opcional)} />
        </Campo>

        <Campo etiqueta="Correo" htmlFor="email" error={errors.email?.message}>
          <Entrada id="email" type="email" autoComplete="off" {...register('email', opcional)} />
        </Campo>

        <Campo etiqueta="Teléfono" htmlFor="telefono" error={errors.telefono?.message}>
          <Entrada
            id="telefono"
            type="tel"
            autoComplete="off"
            {...register('telefono', opcional)}
          />
        </Campo>

        <p className="rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[12px] leading-relaxed text-grafito">
          El documento se cifra antes de guardarse. Ni esta pantalla ni ninguna otra vuelve a
          mostrarlo completo.
        </p>
      </form>
    </PanelLateral>
  );
}
