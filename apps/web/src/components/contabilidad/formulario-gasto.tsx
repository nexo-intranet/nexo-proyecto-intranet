'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CATEGORIAS_GASTO,
  ETIQUETA_CATEGORIA_GASTO,
  MONEDAS,
  aDecimal,
  crearGastoEsquema,
  formatear,
  redondear,
  type DatosCrearGasto,
  type Gasto,
} from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Etiqueta, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { opcional } from '@/lib/formulario';

/**
 * Registrar un gasto.
 *
 * A diferencia de un egreso, guardar aquí **no emite ningún documento**: es un
 * registro contable. Por eso el botón dice «Guardar» y no «Emitir», y por eso este
 * formulario sí se puede corregir después.
 *
 * El soporte no se pide aquí. Se adjunta desde el detalle, en un paso aparte,
 * porque el archivo casi nunca está a la mano en el momento de registrar el gasto
 * —llega por correo al día siguiente— y exigirlo convertiría un formulario de
 * treinta segundos en una tarea aplazada.
 */

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export function FormularioGasto({
  abierto,
  empresaId,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  empresaId: string | null;
  onCerrar: () => void;
  onCreado: (gasto: Gasto) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DatosCrearGasto>({
    resolver: zodResolver(crearGastoEsquema),
    defaultValues: {
      categoria: 'OTRO',
      moneda: 'COP',
      deducible: true,
      fecha: hoy() as unknown as Date,
    },
  });

  const { monto, moneda, tasaCambio } = watch();
  const enPesos = calcularEnPesos(monto, moneda, tasaCambio);

  const crear = useMutation({
    mutationFn: (datos: DatosCrearGasto) =>
      peticion<Gasto>('gastos', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: (gasto) => {
      toast.success('Gasto registrado. Adjunta el soporte cuando lo tengas.');
      reset();
      onCreado(gasto);
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo registrar el gasto.');
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
      titulo="Nuevo gasto"
      descripcion="Un gasto de la operación de la empresa, con su soporte."
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
            {crear.isPending ? 'Guardando…' : 'Guardar gasto'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((datos) => crear.mutate(datos))}
        className="space-y-4"
        noValidate
      >
        <Campo etiqueta="Concepto" htmlFor="concepto" obligatorio error={errors.concepto?.message}>
          <Entrada
            id="concepto"
            autoFocus
            placeholder="Arriendo de la oficina, mes de…"
            {...register('concepto')}
          />
        </Campo>

        <Campo
          etiqueta="Categoría"
          htmlFor="categoria"
          obligatorio
          error={errors.categoria?.message}
          ayuda="Es lo que agrupa el resumen y lo que después se cruza con la contabilidad."
        >
          <Seleccion id="categoria" {...register('categoria')}>
            {CATEGORIAS_GASTO.map((categoria) => (
              <option key={categoria} value={categoria}>
                {ETIQUETA_CATEGORIA_GASTO[categoria]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Proveedor" htmlFor="proveedor" error={errors.proveedor?.message}>
          <Entrada id="proveedor" placeholder="Opcional" {...register('proveedor', opcional)} />
        </Campo>

        <Campo etiqueta="Fecha" htmlFor="fecha" obligatorio error={errors.fecha?.message}>
          <Entrada id="fecha" type="date" className="cifra" {...register('fecha')} />
        </Campo>

        <fieldset className="rounded-md border border-borde bg-superficie-alt/60 p-3.5">
          <legend className="px-1 text-[12px] font-semibold text-tinta">El valor</legend>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Campo etiqueta="Monto" htmlFor="monto" obligatorio error={errors.monto?.message}>
              <Entrada
                id="monto"
                inputMode="decimal"
                autoComplete="off"
                className="cifra"
                placeholder="0.00"
                {...register('monto')}
              />
            </Campo>

            <Campo etiqueta="Moneda" htmlFor="moneda" obligatorio>
              <Seleccion id="moneda" {...register('moneda')}>
                {MONEDAS.map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          {/* La tasa solo se pide cuando hace falta. En un gasto en pesos, el campo
              invita a llenarlo con un número que después nadie sabe si creer. */}
          {moneda !== 'COP' && (
            <div className="mt-3">
              <Campo
                etiqueta={`Tasa de cambio (pesos por ${moneda})`}
                htmlFor="tasaCambio"
                obligatorio
                error={errors.tasaCambio?.message}
                ayuda="La del día del gasto. Queda guardada con él."
              >
                <Entrada
                  id="tasaCambio"
                  inputMode="decimal"
                  autoComplete="off"
                  className="cifra"
                  placeholder="4100.00"
                  {...register('tasaCambio', opcional)}
                />
              </Campo>
            </div>
          )}

          {enPesos && (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-baseline justify-between gap-3 rounded-sm border border-acento-borde bg-acento-suave px-3 py-2.5"
            >
              <span className="text-[12px] font-semibold text-acento">En pesos</span>
              <span className="cifra text-[15px] font-semibold text-acento-fuerte">{enPesos}</span>
            </div>
          )}
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-md border border-borde px-3.5 py-3">
          <input
            id="deducible"
            type="checkbox"
            className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-acento)]"
            {...register('deducible')}
          />
          <div className="min-w-0">
            <Etiqueta htmlFor="deducible" className="cursor-pointer">
              Deducible
            </Etiqueta>
            <p className="mt-0.5 text-[12px] leading-snug text-tenue">
              Sin soporte no lo es ante la DIAN, aunque esté marcado. El resumen cuenta aparte los
              gastos que todavía no tienen archivo adjunto.
            </p>
          </div>
        </div>
      </form>
    </PanelLateral>
  );
}

/**
 * El equivalente en pesos, mientras se escribe.
 *
 * Con el mismo `redondear` de `@nexo/shared` que usa el servidor: si esta cifra y
 * la guardada no coincidieran, la diferencia aparecería después en un informe y
 * nadie sabría cuál de las dos creer.
 */
function calcularEnPesos(
  monto: string | undefined,
  moneda: string | undefined,
  tasa: string | undefined,
): string | null {
  if (!monto || !/^\d+(\.\d{1,2})?$/.test(monto.trim())) return null;

  try {
    if (moneda === 'COP') return formatear(redondear(aDecimal(monto)).toFixed(2), 'COP');
    if (!tasa || !/^\d+(\.\d{1,6})?$/.test(tasa.trim())) return null;

    return formatear(redondear(aDecimal(monto).times(aDecimal(tasa))).toFixed(2), 'COP');
  } catch {
    // Mientras se escribe, un valor a medias no es un error: es un valor a medias.
    return null;
  }
}
