'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_MODULO,
  ORDEN_MODULOS,
  crearUsuarioEsquema,
  type DatosCrearUsuario,
  type Empresa,
  type RespuestaPaginada,
  type Usuario,
  type UsuarioCreado,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Plus, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Distintivo, EncabezadoPagina, EstadoError } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { TablaDatos, type EstadoTabla } from '@/components/tabla/tabla-datos';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Etiqueta } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { puedeEditar, useSesion } from '@/lib/sesion';

const columnas: ColumnDef<Usuario, unknown>[] = [
  {
    id: 'nombre',
    header: 'Nombre',
    cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
  },
  { id: 'email', header: 'Correo', enableSorting: false, accessorKey: 'email' },
  {
    id: 'rol',
    header: 'Rol',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.rol === 'ADMINISTRADOR' ? (
        <Distintivo>Administrador</Distintivo>
      ) : (
        <span className="text-[--color-texto-suave]">Equipo interno</span>
      ),
  },
  {
    id: 'empresas',
    header: 'Empresas',
    enableSorting: false,
    cell: ({ row }) => <span className="cifra">{row.original.empresas.length}</span>,
  },
  {
    id: 'totpActivado',
    header: 'Verificación',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.totpActivado ? (
        <Distintivo tono="exito">Activa</Distintivo>
      ) : (
        <Distintivo tono="alerta">Sin registrar</Distintivo>
      ),
  },
  {
    id: 'activo',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.activo ? (
        <Distintivo tono="exito">Activo</Distintivo>
      ) : (
        <Distintivo tono="peligro">Inactivo</Distintivo>
      ),
  },
];

export default function PaginaUsuarios() {
  const { data: sesion } = useSesion();
  const clienteConsultas = useQueryClient();
  const [estado, setEstado] = useState<EstadoTabla>({ pagina: 1, porPagina: 50, dir: 'asc' });
  const [creando, setCreando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);

  const puedeGestionar = puedeEditar(sesion, 'ADMINISTRACION');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['usuarios', estado],
    queryFn: () =>
      peticion<RespuestaPaginada<Usuario>>(
        `usuarios${consulta({
          pagina: estado.pagina,
          porPagina: estado.porPagina,
          orden: estado.orden,
          dir: estado.dir,
        })}`,
      ),
  });

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });
  };

  if (error) {
    return (
      <>
        <EncabezadoPagina titulo="Usuarios" />
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
        titulo="Usuarios"
        descripcion="Las cuentas las crea un administrador. No hay registro público."
        acciones={
          puedeGestionar && (
            <Boton variante="primario" onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              Nuevo usuario
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
        idFila={(usuario) => usuario.id}
        filaSeleccionada={seleccionado?.id}
        onSeleccionar={setSeleccionado}
        vacio={{
          titulo: 'No hay usuarios',
          descripcion: 'Crea la primera cuenta para que alguien pueda entrar al sistema.',
        }}
      />

      <PanelLateral
        abierto={seleccionado !== null}
        onCambiarAbierto={(abierto) => !abierto && setSeleccionado(null)}
        titulo={seleccionado?.nombre ?? ''}
        descripcion={seleccionado?.email}
      >
        {seleccionado && (
          <DetalleUsuario
            usuario={seleccionado}
            puedeGestionar={puedeGestionar}
            esUnoMismo={seleccionado.id === sesion?.usuario.id}
            onCambio={refrescar}
          />
        )}
      </PanelLateral>

      <FormularioUsuario
        abierto={creando}
        onCerrar={() => setCreando(false)}
        onCreado={() => {
          setCreando(false);
          refrescar();
        }}
      />
    </div>
  );
}

function DetalleUsuario({
  usuario,
  puedeGestionar,
  esUnoMismo,
  onCambio,
}: {
  usuario: Usuario;
  puedeGestionar: boolean;
  esUnoMismo: boolean;
  onCambio: () => void;
}) {
  const [temporal, setTemporal] = useState<string | null>(null);

  const reiniciarPassword = useMutation({
    mutationFn: () =>
      peticion<{ passwordTemporal: string }>(`usuarios/${usuario.id}/reiniciar-password`, {
        metodo: 'POST',
      }),
    onSuccess: (respuesta) => {
      setTemporal(respuesta.passwordTemporal);
      onCambio();
    },
    onError: (problema) =>
      toast.error(problema instanceof ErrorDeApi ? problema.message : 'No se pudo reiniciar.'),
  });

  const reiniciar2fa = useMutation({
    mutationFn: () => peticion(`usuarios/${usuario.id}/reiniciar-2fa`, { metodo: 'POST' }),
    onSuccess: () => {
      toast.success(
        'La verificación en dos pasos se reinició. El usuario la registrará al entrar.',
      );
      onCambio();
    },
    onError: (problema) =>
      toast.error(problema instanceof ErrorDeApi ? problema.message : 'No se pudo reiniciar.'),
  });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2>Empresas</h2>
        {usuario.empresas.length === 0 ? (
          <p className="text-[13px] text-[--color-texto-suave]">Sin empresas asignadas.</p>
        ) : (
          <ul className="space-y-1">
            {usuario.empresas.map((empresa) => (
              <li key={empresa.id} className="text-[13px]">
                {empresa.nombre}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2>Permisos por módulo</h2>
        {usuario.rol === 'ADMINISTRADOR' ? (
          <p className="text-[13px] text-[--color-texto-suave]">
            Es administrador: tiene acceso a todos los módulos y a todas las empresas.
          </p>
        ) : (
          <ul className="space-y-1">
            {ORDEN_MODULOS.map((modulo) => {
              const permiso = usuario.permisos.find((candidato) => candidato.modulo === modulo);
              if (!permiso?.puedeVer) return null;
              return (
                <li key={modulo} className="flex items-center justify-between text-[13px]">
                  <span>{ETIQUETA_MODULO[modulo]}</span>
                  <Distintivo>{permiso.puedeEditar ? 'Ver y editar' : 'Solo ver'}</Distintivo>
                </li>
              );
            })}
            {!usuario.permisos.some((permiso) => permiso.puedeVer) && (
              <li className="text-[13px] text-[--color-texto-suave]">Sin módulos asignados.</li>
            )}
          </ul>
        )}
      </section>

      {puedeGestionar && !esUnoMismo && (
        <section className="space-y-2 border-t border-[--color-borde] pt-4">
          <h2>Acciones</h2>

          {temporal ? (
            <div className="rounded-[4px] border border-[--color-dorado] bg-[--color-dorado-suave] p-3">
              <p className="text-[12px] text-[--color-texto-suave]">
                Contraseña temporal. Se muestra una sola vez: cópiala y entrégasela al usuario.
              </p>
              <p className="cifra mt-1 text-[15px]">{temporal}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="secundario"
                onClick={() => reiniciarPassword.mutate()}
                disabled={reiniciarPassword.isPending}
              >
                <KeyRound aria-hidden />
                Reiniciar contraseña
              </Boton>
              <Boton
                variante="secundario"
                onClick={() => reiniciar2fa.mutate()}
                disabled={reiniciar2fa.isPending || !usuario.totpActivado}
              >
                <ShieldOff aria-hidden />
                Reiniciar verificación
              </Boton>
            </div>
          )}
        </section>
      )}

      {esUnoMismo && (
        <p className="border-t border-[--color-borde] pt-4 text-[12px] text-[--color-texto-suave]">
          Esta es tu propia cuenta. Los permisos y las empresas propias los cambia otro
          administrador.
        </p>
      )}
    </div>
  );
}

function FormularioUsuario({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [creado, setCreado] = useState<UsuarioCreado | null>(null);

  const { data: empresas } = useQuery({
    queryKey: ['empresas', 'accesibles'],
    queryFn: () => peticion<Empresa[]>('empresas/accesibles'),
    enabled: abierto,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DatosCrearUsuario>({
    resolver: zodResolver(crearUsuarioEsquema),
    defaultValues: { rol: 'EQUIPO_INTERNO', empresaIds: [], permisos: [] },
  });

  const crear = useMutation({
    mutationFn: (datos: DatosCrearUsuario) =>
      peticion<UsuarioCreado>('usuarios', { metodo: 'POST', cuerpo: datos }),
    onSuccess: (respuesta) => {
      setCreado(respuesta);
      reset();
      onCreado();
    },
    onError: (problema) =>
      toast.error(
        problema instanceof ErrorDeApi ? problema.message : 'No se pudo crear el usuario.',
      ),
  });

  const cerrar = () => {
    setCreado(null);
    reset();
    onCerrar();
  };

  // La contraseña temporal se muestra una sola vez y no vuelve a estar disponible.
  if (creado) {
    return (
      <PanelLateral
        abierto={abierto}
        onCambiarAbierto={(valor) => !valor && cerrar()}
        titulo="Usuario creado"
        descripcion={creado.usuario.email}
        pie={
          <Boton variante="primario" onClick={cerrar}>
            Ya la copié
          </Boton>
        }
      >
        <div className="space-y-3">
          <div className="rounded-[4px] border border-[--color-dorado] bg-[--color-dorado-suave] p-3">
            <p className="text-[12px] text-[--color-texto-suave]">
              Contraseña temporal. No se guarda en ningún lado y no vuelve a mostrarse.
            </p>
            <p className="cifra mt-1 text-[16px]">{creado.passwordTemporal}</p>
          </div>
          <p className="text-[13px] text-[--color-texto-suave]">
            Entrégasela por un medio seguro. Al entrar, el sistema le pedirá cambiarla y registrar
            la verificación en dos pasos.
          </p>
        </div>
      </PanelLateral>
    );
  }

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => !valor && cerrar()}
      titulo="Nuevo usuario"
      descripcion="Define a qué empresas entra y qué módulos puede ver."
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            form="formulario-usuario"
            type="submit"
            disabled={crear.isPending}
          >
            {crear.isPending ? 'Creando…' : 'Crear usuario'}
          </Boton>
        </>
      }
    >
      <form
        id="formulario-usuario"
        className="space-y-4"
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        noValidate
      >
        <Campo etiqueta="Nombre" htmlFor="nombre" error={errors.nombre?.message}>
          <Entrada id="nombre" autoFocus {...register('nombre')} />
        </Campo>

        <Campo etiqueta="Correo" htmlFor="email" error={errors.email?.message}>
          <Entrada id="email" type="email" {...register('email')} />
        </Campo>

        <Campo etiqueta="Rol" htmlFor="rol" error={errors.rol?.message}>
          <select
            id="rol"
            className="h-9 w-full rounded-[4px] border border-[--color-borde] bg-white px-3 text-[14px] focus:border-[--color-dorado] focus:outline-none focus:ring-1 focus:ring-[--color-dorado]"
            {...register('rol')}
          >
            <option value="EQUIPO_INTERNO">Equipo interno</option>
            <option value="ADMINISTRADOR">Administrador</option>
          </select>
        </Campo>

        <Controller
          control={control}
          name="empresaIds"
          render={({ field }) => (
            <div className="space-y-1.5">
              <Etiqueta>Empresas</Etiqueta>
              <div className="space-y-1 rounded-[4px] border border-[--color-borde] p-2">
                {(empresas ?? []).map((empresa) => (
                  <label key={empresa.id} className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="accent-[--color-dorado]"
                      checked={field.value.includes(empresa.id)}
                      onChange={(evento) =>
                        field.onChange(
                          evento.target.checked
                            ? [...field.value, empresa.id]
                            : field.value.filter((id) => id !== empresa.id),
                        )
                      }
                    />
                    {empresa.nombre}
                  </label>
                ))}
              </div>
              {errors.empresaIds && (
                <p role="alert" className="text-[12px] text-[--color-peligro]">
                  {errors.empresaIds.message}
                </p>
              )}
            </div>
          )}
        />

        <Controller
          control={control}
          name="permisos"
          render={({ field }) => (
            <div className="space-y-1.5">
              <Etiqueta>Permisos por módulo</Etiqueta>
              <p className="text-[12px] text-[--color-texto-suave]">
                Los módulos sin marcar no aparecen en su barra lateral.
              </p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="encabezado-columna text-left">Módulo</th>
                    <th className="encabezado-columna w-14">Ver</th>
                    <th className="encabezado-columna w-14">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDEN_MODULOS.map((modulo) => {
                    const actual = field.value.find((permiso) => permiso.modulo === modulo);
                    const cambiar = (nivel: 'puedeVer' | 'puedeEditar', valor: boolean) => {
                      const otros = field.value.filter((permiso) => permiso.modulo !== modulo);
                      const base = actual ?? { modulo, puedeVer: false, puedeEditar: false };
                      const actualizado = { ...base, [nivel]: valor };
                      // Editar implica ver; quitar ver quita editar. El backend
                      // rechaza la combinación incoherente, así que la UI no la ofrece.
                      if (nivel === 'puedeEditar' && valor) actualizado.puedeVer = true;
                      if (nivel === 'puedeVer' && !valor) actualizado.puedeEditar = false;

                      field.onChange(
                        actualizado.puedeVer || actualizado.puedeEditar
                          ? [...otros, actualizado]
                          : otros,
                      );
                    };

                    return (
                      <tr key={modulo} className="border-t border-[--color-borde]">
                        <td className="py-1.5 text-[13px]">{ETIQUETA_MODULO[modulo]}</td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`Ver ${ETIQUETA_MODULO[modulo]}`}
                            className="accent-[--color-dorado]"
                            checked={actual?.puedeVer ?? false}
                            onChange={(evento) => cambiar('puedeVer', evento.target.checked)}
                          />
                        </td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`Editar ${ETIQUETA_MODULO[modulo]}`}
                            className="accent-[--color-dorado]"
                            checked={actual?.puedeEditar ?? false}
                            onChange={(evento) => cambiar('puedeEditar', evento.target.checked)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        />
      </form>
    </PanelLateral>
  );
}
