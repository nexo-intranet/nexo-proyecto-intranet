'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_CONTRATO,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_CONTRATO,
  TIPOS_DOCUMENTO,
  crearEmpleadoEsquema,
  formatear,
  type DatosCrearEmpleado,
  type Empleado,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FichaEmpleado } from '@/components/empleados/ficha-empleado';
import { FormularioRecibo } from '@/components/empleados/formulario-recibo';
import { Distintivo, EncabezadoPagina, EstadoError } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFecha } from '@/lib/formato';
import { opcional } from '@/lib/formulario';
import { puedeEditar, useSesion } from '@/lib/sesion';

/**
 * Empleados de la empresa administrada.
 *
 * El documento no se muestra completo en ninguna pantalla: la API solo devuelve los
 * últimos cuatro dígitos (Ley 1581, docs/SEGURIDAD.md §5).
 */

const columnas: ColumnDef<Empleado, unknown>[] = [
  {
    id: 'nombre',
    header: 'Nombre',
    accessorKey: 'nombre',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{row.original.nombre}</span>
        {!row.original.activo && <Distintivo>Retirado</Distintivo>}
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
  { id: 'cargo', header: 'Cargo', enableSorting: false, accessorKey: 'cargo' },
  {
    id: 'tipoContrato',
    header: 'Contrato',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-grafito">{ETIQUETA_TIPO_CONTRATO[row.original.tipoContrato]}</span>
    ),
  },
  {
    id: 'salarioBase',
    header: 'Salario',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra">{formatear(row.original.salarioBase, row.original.moneda)}</span>
    ),
  },
  {
    id: 'fechaIngreso',
    header: 'Ingreso',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="cifra text-grafito">{formatearFecha(row.original.fechaIngreso)}</span>
    ),
  },
];

export default function PaginaEmpleados() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'asc' });
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Empleado | null>(null);
  const [liquidando, setLiquidando] = useState<Empleado | null>(null);

  const puedeGestionar = puedeEditar(sesion, 'EMPLEADOS');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['empleados', empresaId, estado, busqueda],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<Empleado>>(
        `empleados${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
          busqueda: busqueda.trim() || undefined,
        })}`,
        { empresaId },
      ),
  });

  const retirar = useMutation({
    mutationFn: (id: string) => peticion<void>(`empleados/${id}`, { metodo: 'DELETE', empresaId }),
    onSuccess: () => {
      toast.success('Empleado retirado de la nómina. Sus recibos se conservan.');
      setSeleccionado(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['empleados'] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo retirar.');
    },
  });

  if (error) {
    return (
      <EstadoError
        mensaje={
          error instanceof ErrorDeApi ? error.message : 'No se pudieron cargar los empleados.'
        }
        onReintentar={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Empleados"
        descripcion="Ficha, recibos de nómina y documentos laborales."
        acciones={
          puedeGestionar && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo empleado
            </Boton>
          )
        }
      />

      <div className="shrink-0 border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-5 py-3 lg:px-8">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-borde bg-campo px-2.5 transition-colors focus-within:border-acento">
            <Search className="size-3.5 shrink-0 text-tenue" aria-hidden />
            <input
              value={busqueda}
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setEstado((anterior) => ({ ...anterior, pagina: 1 }));
              }}
              placeholder="Buscar por nombre o cargo…"
              aria-label="Buscar empleados"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-tinta outline-none placeholder:text-tenue"
            />
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
        idFila={(empleado) => empleado.id}
        filaSeleccionada={seleccionado?.id}
        onSeleccionar={setSeleccionado}
        vacio={{
          titulo: busqueda ? 'Nada coincide' : 'Todavía no hay empleados',
          descripcion: busqueda
            ? 'Prueba con otro nombre o cargo.'
            : 'Registra el primero para poder liquidarle un período.',
          accion:
            puedeGestionar && !busqueda ? (
              <Boton variante="primario" onClick={() => setCreando(true)}>
                <Plus aria-hidden />
                Nuevo empleado
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
          seleccionado?.activo && puedeGestionar ? (
            <Boton
              variante="peligroSuave"
              disabled={retirar.isPending}
              onClick={() => retirar.mutate(seleccionado.id)}
            >
              {retirar.isPending ? 'Retirando…' : 'Retirar de la nómina'}
            </Boton>
          ) : undefined
        }
      >
        {seleccionado && (
          <FichaEmpleado
            empleado={seleccionado}
            empresaId={empresaId}
            puedeEditar={puedeGestionar}
            onLiquidar={() => setLiquidando(seleccionado)}
          />
        )}
      </PanelLateral>

      <FormularioEmpleado
        abierto={creando}
        empresaId={empresaId}
        onCerrar={() => setCreando(false)}
        onCreado={() => {
          setCreando(false);
          void clienteConsultas.invalidateQueries({ queryKey: ['empleados'] });
        }}
      />

      <FormularioRecibo
        empleado={liquidando}
        empresaId={empresaId}
        onCerrar={() => setLiquidando(null)}
        onLiquidado={() => {
          setLiquidando(null);
          void clienteConsultas.invalidateQueries({ queryKey: ['empleado-recibos'] });
          void clienteConsultas.invalidateQueries({ queryKey: ['empleado-resumen'] });
        }}
      />
    </div>
  );
}

function FormularioEmpleado({
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
  } = useForm<DatosCrearEmpleado>({
    resolver: zodResolver(crearEmpleadoEsquema),
    defaultValues: { tipoDoc: 'CC', tipoContrato: 'INDEFINIDO', moneda: 'COP' },
  });

  const crear = useMutation({
    mutationFn: (datos: DatosCrearEmpleado) =>
      peticion<Empleado>('empleados', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: (empleado) => {
      toast.success(`${empleado.nombre} quedó registrado.`);
      reset();
      onCreado();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo registrar.');
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
      titulo="Nuevo empleado"
      descripcion="Sus datos alimentan los recibos y la carta laboral."
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
            {crear.isPending ? 'Guardando…' : 'Registrar empleado'}
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
          etiqueta="Nombre completo"
          htmlFor="nombre"
          obligatorio
          error={errors.nombre?.message}
        >
          <Entrada id="nombre" autoFocus {...register('nombre')} />
        </Campo>

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Campo etiqueta="Documento" htmlFor="tipoDoc" obligatorio>
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
            ayuda="Se cifra al guardarse."
          >
            <Entrada
              id="numeroDoc"
              inputMode="numeric"
              autoComplete="off"
              {...register('numeroDoc')}
            />
          </Campo>
        </div>

        <Campo etiqueta="Cargo" htmlFor="cargo" obligatorio error={errors.cargo?.message}>
          <Entrada id="cargo" {...register('cargo')} />
        </Campo>

        <Campo
          etiqueta="Tipo de contrato"
          htmlFor="tipoContrato"
          obligatorio
          error={errors.tipoContrato?.message}
        >
          <Seleccion id="tipoContrato" {...register('tipoContrato')}>
            {TIPOS_CONTRATO.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_CONTRATO[valor]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Salario básico"
          htmlFor="salarioBase"
          obligatorio
          error={errors.salarioBase?.message}
          ayuda="Lo imprime la carta laboral. No se usa para calcular el recibo."
        >
          <Entrada
            id="salarioBase"
            inputMode="decimal"
            className="cifra"
            placeholder="0.00"
            {...register('salarioBase')}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Fecha de ingreso"
            htmlFor="fechaIngreso"
            obligatorio
            error={errors.fechaIngreso?.message}
          >
            <Entrada id="fechaIngreso" type="date" {...register('fechaIngreso')} />
          </Campo>

          <Campo
            etiqueta="Fecha de retiro"
            htmlFor="fechaRetiro"
            error={errors.fechaRetiro?.message}
          >
            <Entrada id="fechaRetiro" type="date" {...register('fechaRetiro', opcional)} />
          </Campo>
        </div>

        <Campo etiqueta="Correo" htmlFor="email" error={errors.email?.message}>
          <Entrada id="email" type="email" {...register('email', opcional)} />
        </Campo>

        <Campo etiqueta="Teléfono" htmlFor="telefono" error={errors.telefono?.message}>
          <Entrada id="telefono" type="tel" {...register('telefono', opcional)} />
        </Campo>

        <Campo etiqueta="Dirección" htmlFor="direccion" error={errors.direccion?.message}>
          <Entrada id="direccion" {...register('direccion', opcional)} />
        </Campo>
      </form>
    </PanelLateral>
  );
}
