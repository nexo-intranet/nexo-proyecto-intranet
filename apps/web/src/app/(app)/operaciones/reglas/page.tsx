'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_REPARTO,
  TIPOS_REPARTO,
  calcularReparto,
  formatear,
  guardarReglaEsquema,
  type DatosGuardarRegla,
  type Destinatario,
  type ReglaVista,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Cuadre,
  Distintivo,
  EncabezadoPagina,
  EstadoError,
  Esqueleto,
} from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { opcional } from '@/lib/formulario';
import { puedeEditar, useSesion } from '@/lib/sesion';

/**
 * Reglas de reparto.
 *
 * El reparto que se repite operación tras operación. La regla se guarda entera —
 * cabecera y destinos a la vez— porque a medias no significa nada: una regla de
 * porcentajes que sume 40 % no es una regla incompleta, es una que reparte mal.
 *
 * Por eso el cuadre se ve mientras se arma, con `calcularReparto` de
 * `@nexo/shared`: el mismo cálculo que valida el servidor y que después ejecuta la
 * dispersión. Enterarse de que los porcentajes no suman al guardar sería tarde;
 * enterarse al dispersar, con la plata lista para girar, sería peor.
 */

/**
 * Renumera el orden por posición en la lista.
 *
 * No es cosmético: el orden decide **quién absorbe el residuo** del redondeo. Al
 * quitar una fila del medio los números quedaban con huecos, y agregar otra podía
 * repetir uno — con dos destinos empatados en el último lugar, a quién le toca el
 * peso sobrante deja de ser determinista.
 */
function conOrdenNormalizado(datos: DatosGuardarRegla): DatosGuardarRegla {
  return {
    ...datos,
    destinos: datos.destinos.map((destino, indice) => ({ ...destino, orden: indice })),
  };
}

/** Total de referencia para previsualizar. El reparto real usa el de la operación. */
const REFERENCIA = '1000000.00';

export default function PaginaReglas() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();
  const clienteConsultas = useQueryClient();

  const [editando, setEditando] = useState<ReglaVista | 'nueva' | null>(null);

  const puedeEditarReglas = puedeEditar(sesion, 'OPERACIONES');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reglas', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<ReglaVista>>('reglas-dispersion?porPagina=100', { empresaId }),
  });

  const desactivar = useMutation({
    mutationFn: (id: string) =>
      peticion<void>(`reglas-dispersion/${id}`, { metodo: 'DELETE', empresaId }),
    onSuccess: () => {
      toast.success('Regla desactivada.');
      void clienteConsultas.invalidateQueries({ queryKey: ['reglas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['reglas-dispersion'] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo desactivar.');
    },
  });

  if (error) {
    return (
      <EstadoError
        mensaje="No se pudieron cargar las reglas."
        onReintentar={() => void refetch()}
      />
    );
  }

  const reglas = data?.datos ?? [];

  return (
    <div className="flex h-full flex-col">
      <EncabezadoPagina
        titulo="Reglas de reparto"
        descripcion="Cómo se divide la ganancia entre los destinatarios."
        acciones={
          puedeEditarReglas && (
            <Boton variante="primario" onClick={() => setEditando('nueva')}>
              <Plus aria-hidden />
              Nueva regla
            </Boton>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1240px] space-y-4 px-5 py-6 lg:px-8">
          {isLoading ? (
            <>
              <Esqueleto className="h-36 rounded-xl" />
              <Esqueleto className="h-36 rounded-xl" />
            </>
          ) : reglas.length === 0 ? (
            <div className="rounded-xl border border-borde bg-superficie px-5 py-10 text-center">
              <p className="text-[14px] font-semibold text-tinta">Todavía no hay reglas</p>
              <p className="mx-auto mt-1 max-w-[52ch] text-[13px] leading-relaxed text-grafito">
                Sin una regla activa no se puede repartir la ganancia de una operación. Necesitas al
                menos un destinatario en el catálogo para armar la primera.
              </p>
              {puedeEditarReglas && (
                <Boton variante="primario" className="mt-4" onClick={() => setEditando('nueva')}>
                  <Plus aria-hidden />
                  Crear la primera regla
                </Boton>
              )}
            </div>
          ) : (
            reglas.map((regla) => (
              <article
                key={regla.id}
                className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-tarjeta"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-superficie-alt px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-tinta">{regla.nombre}</p>
                    <p className="mt-0.5 text-[12px] text-grafito">
                      {ETIQUETA_TIPO_REPARTO[regla.tipoReparto]} ·{' '}
                      <span className="cifra">{regla.destinos.length}</span>{' '}
                      {regla.destinos.length === 1 ? 'destinatario' : 'destinatarios'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Distintivo tono={regla.activa ? 'exito' : 'neutro'} punto>
                      {regla.activa ? 'Activa' : 'Inactiva'}
                    </Distintivo>

                    {puedeEditarReglas && regla.activa && (
                      <>
                        <Boton
                          variante="secundario"
                          tamano="pequeno"
                          onClick={() => setEditando(regla)}
                        >
                          Editar
                        </Boton>
                        <Boton
                          variante="peligroSuave"
                          tamano="pequeno"
                          disabled={desactivar.isPending}
                          onClick={() => desactivar.mutate(regla.id)}
                        >
                          Desactivar
                        </Boton>
                      </>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-borde-suave px-5 py-1">
                  {regla.destinos.map((destino) => (
                    <li
                      key={destino.destinatarioId}
                      className="flex items-baseline justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-tinta">
                          {destino.nombre}
                        </span>
                        {destino.cuentaFinal && (
                          <span className="text-[11px] text-tenue">•••• {destino.cuentaFinal}</span>
                        )}
                      </span>
                      <span className="cifra shrink-0 text-tinta">
                        {destino.porcentaje
                          ? `${destino.porcentaje} %`
                          : formatear(destino.montoFijo ?? '0.00', 'COP')}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      </div>

      {editando && (
        <FormularioRegla
          regla={editando === 'nueva' ? null : editando}
          empresaId={empresaId}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            void clienteConsultas.invalidateQueries({ queryKey: ['reglas'] });
            void clienteConsultas.invalidateQueries({ queryKey: ['reglas-dispersion'] });
          }}
        />
      )}
    </div>
  );
}

function FormularioRegla({
  regla,
  empresaId,
  onCerrar,
  onGuardada,
}: {
  regla: ReglaVista | null;
  empresaId: string | null;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosGuardarRegla>({
    resolver: zodResolver(guardarReglaEsquema),
    defaultValues: regla
      ? {
          nombre: regla.nombre,
          tipoReparto: regla.tipoReparto,
          activa: regla.activa,
          destinos: regla.destinos.map((destino) => ({
            destinatarioId: destino.destinatarioId,
            porcentaje: destino.porcentaje ?? undefined,
            montoFijo: destino.montoFijo ?? undefined,
            orden: destino.orden,
          })),
        }
      : {
          tipoReparto: 'PORCENTAJE',
          activa: true,
          destinos: [{ destinatarioId: '', porcentaje: '', orden: 0 }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'destinos' });

  const { data: destinatarios } = useQuery({
    queryKey: ['destinatarios-selector', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<Destinatario>>('destinatarios?porPagina=200&activo=true', {
        empresaId,
      }),
  });

  const guardar = useMutation({
    mutationFn: (datos: DatosGuardarRegla) =>
      peticion<ReglaVista>(regla ? `reglas-dispersion/${regla.id}` : 'reglas-dispersion', {
        metodo: regla ? 'PUT' : 'POST',
        cuerpo: datos,
        empresaId,
      }),
    onSuccess: () => {
      toast.success(regla ? 'Regla actualizada.' : 'Regla creada.');
      onGuardada();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo guardar la regla.');
    },
  });

  const disponibles = destinatarios?.datos ?? [];

  return (
    <PanelLateral
      abierto
      onCambiarAbierto={(valor) => !valor && onCerrar()}
      titulo={regla ? 'Editar regla' : 'Nueva regla de reparto'}
      descripcion={
        regla
          ? 'Guardar reemplaza los destinos. Las dispersiones ya hechas no cambian.'
          : 'Queda disponible para repartir la ganancia de cualquier operación.'
      }
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={handleSubmit((datos) => guardar.mutate(conOrdenNormalizado(datos)))}
            disabled={guardar.isPending || disponibles.length === 0}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar regla'}
          </Boton>
        </>
      }
    >
      {disponibles.length === 0 ? (
        <div className="rounded-sm border border-alerta-borde bg-alerta-suave px-3 py-3 text-[13px] leading-relaxed text-tinta">
          No hay destinatarios activos en esta empresa. Una regla reparte entre destinatarios, así
          que hay que registrarlos primero.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((datos) => guardar.mutate(conOrdenNormalizado(datos)))}
          className="space-y-5"
          noValidate
        >
          <Campo
            etiqueta="Nombre de la regla"
            htmlFor="nombre"
            obligatorio
            error={errors.nombre?.message}
          >
            <Entrada
              id="nombre"
              autoFocus
              placeholder="Reparto entre socios"
              {...register('nombre')}
            />
          </Campo>

          <Campo
            etiqueta="Tipo de reparto"
            htmlFor="tipoReparto"
            obligatorio
            error={errors.tipoReparto?.message}
            ayuda="Por porcentaje se adapta a cada operación; por monto fijo siempre gira lo mismo."
          >
            <Seleccion id="tipoReparto" {...register('tipoReparto')}>
              {TIPOS_REPARTO.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_TIPO_REPARTO[valor]}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <fieldset className="space-y-3">
            <legend className="etiqueta mb-1">Destinatarios</legend>

            {fields.map((campo, indice) => (
              <FilaDestino
                key={campo.id}
                indice={indice}
                control={control}
                register={register}
                disponibles={disponibles}
                onQuitar={fields.length > 1 ? () => remove(indice) : undefined}
                error={
                  errors.destinos?.[indice]?.destinatarioId?.message ??
                  errors.destinos?.[indice]?.porcentaje?.message ??
                  errors.destinos?.[indice]?.montoFijo?.message
                }
              />
            ))}

            {errors.destinos?.message && (
              <p role="alert" className="text-[12px] text-peligro">
                {errors.destinos.message}
              </p>
            )}

            <Boton
              variante="secundario"
              tamano="pequeno"
              onClick={() => append({ destinatarioId: '', porcentaje: '', orden: fields.length })}
            >
              <Plus aria-hidden />
              Agregar destinatario
            </Boton>
          </fieldset>

          {/* El cuadre en vivo: el mismo cálculo que valida el servidor. */}
          <CuadreEnVivo control={control} />
        </form>
      )}
    </PanelLateral>
  );
}

function FilaDestino({
  indice,
  control,
  register,
  disponibles,
  onQuitar,
  error,
}: {
  indice: number;
  control: Control<DatosGuardarRegla>;
  register: ReturnType<typeof useForm<DatosGuardarRegla>>['register'];
  disponibles: Destinatario[];
  onQuitar?: () => void;
  error?: string;
}) {
  const tipo = useWatch({ control, name: 'tipoReparto' });
  const esPorcentaje = tipo === 'PORCENTAJE';

  return (
    <div className="rounded-md border border-borde bg-superficie-alt/60 p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Campo etiqueta="Destinatario" htmlFor={`destino-${indice}`}>
            <Seleccion id={`destino-${indice}`} {...register(`destinos.${indice}.destinatarioId`)}>
              <option value="">Selecciona…</option>
              {disponibles.map((destinatario) => (
                <option key={destinatario.id} value={destinatario.id}>
                  {destinatario.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>
        </div>

        <div className="w-[110px]">
          <Campo etiqueta={esPorcentaje ? 'Porcentaje' : 'Monto'} htmlFor={`valor-${indice}`}>
            <Entrada
              id={`valor-${indice}`}
              inputMode="decimal"
              autoComplete="off"
              className="cifra"
              placeholder={esPorcentaje ? '33.3333' : '0.00'}
              {...register(
                esPorcentaje ? `destinos.${indice}.porcentaje` : `destinos.${indice}.montoFijo`,
                opcional,
              )}
            />
          </Campo>
        </div>

        {onQuitar && (
          <Boton
            variante="fantasma"
            tamano="icono"
            aria-label={`Quitar destinatario ${indice + 1}`}
            onClick={onQuitar}
          >
            <Trash2 aria-hidden />
          </Boton>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * El cuadre, mientras se arma.
 *
 * Corre `calcularReparto` sobre un total de referencia con lo que hay escrito. No
 * es una suma reimplementada aquí: es la misma función que valida el servidor y
 * que después ejecuta la dispersión, incluida la regla del residuo.
 */
function CuadreEnVivo({ control }: { control: Control<DatosGuardarRegla> }) {
  const tipo = useWatch({ control, name: 'tipoReparto' });
  const destinos = useWatch({ control, name: 'destinos' });

  if (tipo !== 'PORCENTAJE') {
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-3 text-center text-[12px] leading-relaxed text-tenue">
        Un reparto por monto fijo se verifica al dispersar: depende del total de cada operación.
      </p>
    );
  }

  const listos = (destinos ?? []).filter((destino) => destino?.porcentaje);
  if (listos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-3 text-center text-[12px] text-tenue">
        Los porcentajes tienen que sumar 100 %.
      </p>
    );
  }

  try {
    const reparto = calcularReparto(
      REFERENCIA,
      'PORCENTAJE',
      listos.map((destino, indice) => ({
        referencia: String(indice),
        orden: destino.orden ?? indice,
        porcentaje: destino.porcentaje,
      })),
    );

    return (
      <Cuadre
        cuadra={reparto.cuadra}
        detalle={`Suman 100 % · sobre ${formatear(REFERENCIA, 'COP')} de ejemplo`}
      />
    );
  } catch (error) {
    return (
      <div
        role="status"
        className="rounded-md border border-alerta-borde bg-alerta-suave px-4 py-3 text-[12px] leading-relaxed text-alerta"
      >
        {error instanceof Error ? error.message : 'El reparto no cuadra.'}
      </div>
    );
  }
}
