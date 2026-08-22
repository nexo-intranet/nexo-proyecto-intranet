'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_CLIENTE,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_CLIENTE,
  TIPOS_CONTRIBUYENTE,
  TIPOS_DOCUMENTO,
  actualizarClienteEsquema,
  crearClienteEsquema,
  type Cliente,
  type DatosActualizarCliente,
  type DatosCrearCliente,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FichaCliente } from '@/components/clientes/ficha-cliente';
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
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const [documento, setDocumento] = useState('');

  const puedeCrear = puedeEditar(sesion, 'CLIENTES');

  const retirar = useMutation({
    mutationFn: (id: string) => peticion<void>(`clientes/${id}`, { metodo: 'DELETE', empresaId }),
    onSuccess: () => {
      toast.success('Cliente retirado del portafolio. Su historial se conserva.');
      setSeleccionado(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo retirar.');
    },
  });

  /**
   * Buscar por documento completo.
   *
   * Va por una ruta aparte del filtro de la tabla porque hace algo distinto: no
   * filtra, encuentra. El servidor compara el HMAC del número, así que la tabla
   * nunca se descifra para buscar a alguien.
   */
  const buscarPorDocumento = async () => {
    const numero = documento.replace(/\D/g, '');
    if (numero.length < 5) return;

    try {
      const cliente = await peticion<Cliente>(`clientes/buscar?documento=${numero}`, { empresaId });
      setSeleccionado(cliente);
      setDocumento('');
    } catch (error) {
      toast.error(
        error instanceof ErrorDeApi && error.codigo === 'NO_ENCONTRADO'
          ? 'Ningún cliente con ese documento en esta empresa.'
          : 'No se pudo buscar.',
      );
    }
  };

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

      <div className="shrink-0 border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-5 py-3 lg:px-8">
          <form
            role="search"
            onSubmit={(evento) => {
              evento.preventDefault();
              void buscarPorDocumento();
            }}
            className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-borde bg-campo px-2.5 transition-colors focus-within:border-acento"
          >
            <Search className="size-3.5 shrink-0 text-tenue" aria-hidden />
            <input
              value={documento}
              onChange={(evento) => setDocumento(evento.target.value)}
              inputMode="numeric"
              placeholder="Buscar por cédula o NIT completo…"
              aria-label="Buscar cliente por documento"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
          </form>

          <p className="text-[12px] text-tenue">
            El número no se descifra para buscarlo: se compara su huella.
          </p>
        </div>
      </div>

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
        pie={
          seleccionado &&
          puedeCrear && (
            <>
              {seleccionado.activo && (
                <Boton
                  variante="peligroSuave"
                  disabled={retirar.isPending}
                  onClick={() => retirar.mutate(seleccionado.id)}
                >
                  {retirar.isPending ? 'Retirando…' : 'Retirar del portafolio'}
                </Boton>
              )}
              <Boton variante="secundario" onClick={() => setEditando(seleccionado)}>
                Editar
              </Boton>
            </>
          )
        }
      >
        {seleccionado && <FichaCliente cliente={seleccionado} empresaId={empresaId} />}
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

      <EditarCliente
        cliente={editando}
        empresaId={empresaId}
        onCerrar={() => setEditando(null)}
        onGuardado={(cliente) => {
          setEditando(null);
          setSeleccionado(cliente);
          void clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
        }}
      />
    </div>
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

/**
 * Editar un cliente.
 *
 * Separado del formulario de creación porque piden cosas distintas: al crear, el
 * documento es obligatorio; al editar, no se puede tocar. Meter las dos cosas en un
 * componente con banderas lo vuelve más difícil de leer que tenerlos aparte.
 */
function EditarCliente({
  cliente,
  empresaId,
  onCerrar,
  onGuardado,
}: {
  cliente: Cliente | null;
  empresaId: string | null;
  onCerrar: () => void;
  onGuardado: (cliente: Cliente) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosActualizarCliente>({
    resolver: zodResolver(actualizarClienteEsquema),
    values: cliente
      ? {
          nombre: cliente.nombre,
          tipo: cliente.tipo,
          tipoDoc: cliente.tipoDoc,
          tipoContribuyente: cliente.tipoContribuyente ?? undefined,
          municipio: cliente.municipio ?? undefined,
          codigoDaneMunicipio: cliente.codigoDaneMunicipio ?? undefined,
          direccion: cliente.direccion ?? undefined,
          nombreContacto: cliente.nombreContacto ?? undefined,
          email: cliente.email ?? undefined,
          telefono: cliente.telefono ?? undefined,
        }
      : {},
  });

  const guardar = useMutation({
    mutationFn: (datos: DatosActualizarCliente) =>
      peticion<Cliente>(`clientes/${cliente?.id}`, { metodo: 'PATCH', cuerpo: datos, empresaId }),
    onSuccess: (actualizado) => {
      toast.success('Cliente actualizado.');
      onGuardado(actualizado);
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo guardar.');
    },
  });

  return (
    <PanelLateral
      abierto={cliente !== null}
      onCambiarAbierto={(valor) => !valor && onCerrar()}
      titulo="Editar cliente"
      descripcion="El documento no se puede cambiar."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={handleSubmit((datos) => guardar.mutate(datos))}
            disabled={guardar.isPending}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((datos) => guardar.mutate(datos))}
        className="space-y-4"
        noValidate
      >
        <Campo etiqueta="Nombre o razón social" htmlFor="ed-nombre" error={errors.nombre?.message}>
          <Entrada id="ed-nombre" {...register('nombre')} />
        </Campo>

        <Campo etiqueta="Tipo" htmlFor="ed-tipo" error={errors.tipo?.message}>
          <Seleccion id="ed-tipo" {...register('tipo')}>
            {TIPOS_CLIENTE.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_CLIENTE[valor]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Tipo de contribuyente"
          htmlFor="ed-contribuyente"
          error={errors.tipoContribuyente?.message}
          ayuda="Con el último dígito del NIT y el municipio, define el calendario tributario."
        >
          <Seleccion id="ed-contribuyente" {...register('tipoContribuyente', opcional)}>
            <option value="">Sin definir</option>
            {TIPOS_CONTRIBUYENTE.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_CONTRIBUYENTE[valor]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Campo etiqueta="Municipio" htmlFor="ed-municipio" error={errors.municipio?.message}>
            <Entrada id="ed-municipio" {...register('municipio', opcional)} />
          </Campo>

          <Campo
            etiqueta="Código DANE"
            htmlFor="ed-dane"
            error={errors.codigoDaneMunicipio?.message}
            ayuda="5 dígitos"
          >
            <Entrada
              id="ed-dane"
              inputMode="numeric"
              className="cifra"
              placeholder="05001"
              {...register('codigoDaneMunicipio', opcional)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Dirección" htmlFor="ed-direccion" error={errors.direccion?.message}>
          <Entrada id="ed-direccion" {...register('direccion', opcional)} />
        </Campo>

        <Campo
          etiqueta="Persona de contacto"
          htmlFor="ed-contacto"
          error={errors.nombreContacto?.message}
        >
          <Entrada id="ed-contacto" {...register('nombreContacto', opcional)} />
        </Campo>

        <Campo etiqueta="Correo" htmlFor="ed-email" error={errors.email?.message}>
          <Entrada id="ed-email" type="email" {...register('email', opcional)} />
        </Campo>

        <Campo etiqueta="Teléfono" htmlFor="ed-telefono" error={errors.telefono?.message}>
          <Entrada id="ed-telefono" type="tel" {...register('telefono', opcional)} />
        </Campo>
      </form>
    </PanelLateral>
  );
}
