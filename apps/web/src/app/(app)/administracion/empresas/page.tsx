'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_CONTRIBUYENTE,
  TIPOS_CONTRIBUYENTE,
  calcularDigitoVerificacion,
  crearEmpresaEsquema,
  soloDigitos,
  type DatosCrearEmpresa,
  type Empresa,
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
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { puedeEditar, useSesion } from '@/lib/sesion';

const columnas: ColumnDef<Empresa, unknown>[] = [
  {
    id: 'nombre',
    header: 'Razón social',
    accessorKey: 'nombre',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{row.original.nombre}</span>
        {row.original.esNexo && <Distintivo>Nexo</Distintivo>}
      </span>
    ),
  },
  {
    id: 'nit',
    header: 'NIT',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra">
        {row.original.nit}-{row.original.digitoVerificacion}
      </span>
    ),
  },
  { id: 'municipio', header: 'Municipio', accessorKey: 'municipio' },
  {
    id: 'tipoContribuyente',
    header: 'Tipo',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-[--color-texto-suave]">
        {ETIQUETA_TIPO_CONTRIBUYENTE[row.original.tipoContribuyente]}
      </span>
    ),
  },
  {
    id: 'activa',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.activa ? (
        <Distintivo tono="exito">Activa</Distintivo>
      ) : (
        <Distintivo tono="alerta">Inactiva</Distintivo>
      ),
  },
];

export default function PaginaEmpresas() {
  const { data: sesion } = useSesion();
  const clienteConsultas = useQueryClient();
  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'asc' });
  const [creando, setCreando] = useState(false);
  const [seleccionada, setSeleccionada] = useState<Empresa | null>(null);

  const puedeCrear = puedeEditar(sesion, 'ADMINISTRACION');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['empresas', estado],
    queryFn: () =>
      peticion<RespuestaPaginada<Empresa>>(
        `empresas${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
        })}`,
      ),
  });

  if (error) {
    return (
      <>
        <EncabezadoPagina titulo="Empresas administradas" />
        <EstadoError
          mensaje={error instanceof ErrorDeApi ? error.message : 'No se pudo cargar el listado.'}
          onReintentar={() => void refetch()}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Empresas administradas"
        descripcion="Nexo y las empresas cuya información administra."
        acciones={
          puedeCrear && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nueva empresa
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
        idFila={(empresa) => empresa.id}
        filaSeleccionada={seleccionada?.id}
        onSeleccionar={setSeleccionada}
        vacio={{
          titulo: 'Todavía no hay empresas',
          descripcion:
            'Crea la primera empresa administrada para empezar a registrar su información.',
          accion: puedeCrear ? (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nueva empresa
            </Boton>
          ) : undefined,
        }}
      />

      <PanelLateral
        abierto={seleccionada !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionada(null)}
        titulo={seleccionada?.nombre ?? ''}
        descripcion={
          seleccionada ? `${seleccionada.nit}-${seleccionada.digitoVerificacion}` : undefined
        }
      >
        {seleccionada && <DetalleEmpresa empresa={seleccionada} />}
      </PanelLateral>

      <FormularioEmpresa
        abierto={creando}
        onCerrar={() => setCreando(false)}
        onCreada={() => {
          setCreando(false);
          void clienteConsultas.invalidateQueries({ queryKey: ['empresas'] });
          void clienteConsultas.invalidateQueries({ queryKey: ['sesion'] });
        }}
      />
    </div>
  );
}

function DetalleEmpresa({ empresa }: { empresa: Empresa }) {
  const filas: Array<[string, string]> = [
    ['Razón social', empresa.nombre],
    ['Nombre comercial', empresa.nombreComercial ?? '—'],
    ['NIT', `${empresa.nit}-${empresa.digitoVerificacion}`],
    ['Tipo de contribuyente', ETIQUETA_TIPO_CONTRIBUYENTE[empresa.tipoContribuyente]],
    ['Municipio', empresa.municipio],
    ['Dirección', empresa.direccion ?? '—'],
    ['Teléfono', empresa.telefono ?? '—'],
    ['Correo', empresa.email ?? '—'],
  ];

  return (
    <dl className="space-y-3">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="grid grid-cols-[130px_1fr] gap-3">
          <dt className="text-[13px] text-[--color-texto-suave]">{etiqueta}</dt>
          <dd className="text-[13px]">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function FormularioEmpresa({
  abierto,
  onCerrar,
  onCreada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DatosCrearEmpresa>({
    resolver: zodResolver(crearEmpresaEsquema),
    defaultValues: { tipoContribuyente: 'PERSONA_JURIDICA' },
  });

  const crear = useMutation({
    mutationFn: (datos: DatosCrearEmpresa) =>
      peticion<Empresa>('empresas', { metodo: 'POST', cuerpo: datos }),
    onSuccess: (empresa) => {
      toast.success(`Se creó ${empresa.nombre}.`);
      reset();
      onCreada();
    },
    onError: (problema) => {
      toast.error(
        problema instanceof ErrorDeApi ? problema.message : 'No se pudo crear la empresa.',
      );
    },
  });

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => !valor && onCerrar()}
      titulo="Nueva empresa"
      descripcion="Los datos fiscales se usan en las facturas y en los documentos generados."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            form="formulario-empresa"
            type="submit"
            disabled={crear.isPending}
          >
            {crear.isPending ? 'Creando…' : 'Crear empresa'}
          </Boton>
        </>
      }
    >
      <form
        id="formulario-empresa"
        className="space-y-4"
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        noValidate
      >
        <Campo etiqueta="Razón social" htmlFor="nombre" error={errors.nombre?.message}>
          <Entrada id="nombre" autoFocus {...register('nombre')} />
        </Campo>

        <Campo
          etiqueta="Nombre comercial"
          htmlFor="nombreComercial"
          error={errors.nombreComercial?.message}
          ayuda="Opcional. Es el nombre con el que se le conoce."
        >
          <Entrada id="nombreComercial" {...register('nombreComercial')} />
        </Campo>

        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Campo etiqueta="NIT" htmlFor="nit" error={errors.nit?.message}>
            <Entrada
              id="nit"
              className="cifra"
              inputMode="numeric"
              {...register('nit', {
                // El dígito de verificación es calculable: se rellena solo para
                // que nadie lo digite mal y ese error termine en una factura.
                onChange: (evento) => {
                  const digitos = soloDigitos(evento.target.value);
                  if (digitos.length >= 6) {
                    try {
                      setValue('digitoVerificacion', calcularDigitoVerificacion(digitos));
                    } catch {
                      /* NIT fuera de rango: lo reporta la validación del campo */
                    }
                  }
                },
              })}
            />
          </Campo>

          <Campo
            etiqueta="DV"
            htmlFor="digitoVerificacion"
            error={errors.digitoVerificacion?.message}
          >
            <Entrada
              id="digitoVerificacion"
              className="cifra text-center"
              readOnly
              {...register('digitoVerificacion')}
            />
          </Campo>
        </div>

        <Campo
          etiqueta="Tipo de contribuyente"
          htmlFor="tipoContribuyente"
          error={errors.tipoContribuyente?.message}
        >
          <select
            id="tipoContribuyente"
            className="h-9 w-full rounded-[4px] border border-[--color-borde] bg-white px-3 text-[14px] focus:border-[--color-dorado] focus:outline-none focus:ring-1 focus:ring-[--color-dorado]"
            {...register('tipoContribuyente')}
          >
            {TIPOS_CONTRIBUYENTE.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_TIPO_CONTRIBUYENTE[tipo]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Municipio"
          htmlFor="municipio"
          error={errors.municipio?.message}
          ayuda="Define a qué ICA está sujeta la empresa."
        >
          <Entrada id="municipio" {...register('municipio')} />
        </Campo>

        <Campo etiqueta="Dirección" htmlFor="direccion" error={errors.direccion?.message}>
          <Entrada id="direccion" {...register('direccion')} />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Teléfono" htmlFor="telefono" error={errors.telefono?.message}>
            <Entrada id="telefono" {...register('telefono')} />
          </Campo>
          <Campo etiqueta="Correo" htmlFor="email" error={errors.email?.message}>
            <Entrada id="email" type="email" {...register('email')} />
          </Campo>
        </div>
      </form>
    </PanelLateral>
  );
}
