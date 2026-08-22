'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_TIPO_INTANGIBLE,
  MONEDAS,
  TIPOS_INTANGIBLE,
  aDecimal,
  crearEgresoEsquema,
  formatear,
  redondear,
  type DatosCrearEgreso,
  type Destinatario,
  type EgresoDetalle,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { opcional } from '@/lib/formulario';

/**
 * Registrar un egreso.
 *
 * Guardar hace dos cosas a la vez: registra el egreso **y emite su orden de pago**
 * con consecutivo. Por eso el botón lo dice — quien lo pulsa está expidiendo un
 * documento legal, no llenando una fila.
 *
 * El equivalente en pesos se calcula mientras se escribe, con el mismo `redondear`
 * de `@nexo/shared` que usa el servidor. Quien registra un egreso en dólares
 * necesita ver cuánto es en pesos **antes** de emitir el documento.
 */

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export function FormularioEgreso({
  abierto,
  empresaId,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  empresaId: string | null;
  onCerrar: () => void;
  onCreado: (egreso: EgresoDetalle) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DatosCrearEgreso>({
    resolver: zodResolver(crearEgresoEsquema),
    defaultValues: {
      tipoIntangible: 'LICENCIA_SOFTWARE',
      moneda: 'COP',
      fecha: hoy() as unknown as Date,
    },
  });

  const { data: destinatarios } = useQuery({
    queryKey: ['destinatarios-selector', empresaId],
    enabled: Boolean(empresaId) && abierto,
    queryFn: () =>
      peticion<RespuestaPaginada<Destinatario>>('destinatarios?porPagina=200&activo=true', {
        empresaId,
      }),
  });

  const { monto, moneda, tasaCambio } = watch();
  const enPesos = calcularEnPesos(monto, moneda, tasaCambio);

  const crear = useMutation({
    mutationFn: (datos: DatosCrearEgreso) =>
      peticion<EgresoDetalle>('egresos', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: (egreso) => {
      toast.success(`Egreso registrado. Orden ${egreso.ordenVigente?.consecutivo ?? ''} emitida.`);
      reset();
      onCreado(egreso);
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo registrar el egreso.');
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
      titulo="Nuevo egreso"
      descripcion="Al guardar se emite su orden de pago con consecutivo."
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
            <FileText aria-hidden />
            {crear.isPending ? 'Emitiendo…' : 'Registrar y emitir orden'}
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
            placeholder="Licencia anual de…"
            {...register('concepto')}
          />
        </Campo>

        <Campo
          etiqueta="Tipo de intangible"
          htmlFor="tipoIntangible"
          obligatorio
          error={errors.tipoIntangible?.message}
        >
          <Seleccion id="tipoIntangible" {...register('tipoIntangible')}>
            {TIPOS_INTANGIBLE.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_TIPO_INTANGIBLE[tipo]}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo
          etiqueta="Beneficiario"
          htmlFor="beneficiario"
          obligatorio
          error={errors.beneficiario?.message}
          ayuda="Queda copiado en la orden: si mañana cambia el catálogo, el documento no."
        >
          <Entrada id="beneficiario" {...register('beneficiario')} />
        </Campo>

        {destinatarios && destinatarios.datos.length > 0 && (
          <Campo
            etiqueta="Enlazar con un destinatario del catálogo"
            htmlFor="destinatarioId"
            error={errors.destinatarioId?.message}
            ayuda="Opcional. Sirve para ver después todo lo pagado a ese tercero."
          >
            <Seleccion
              id="destinatarioId"
              {...register('destinatarioId', opcional)}
              defaultValue=""
            >
              <option value="">Sin enlazar</option>
              {destinatarios.datos.map((destinatario) => (
                <option key={destinatario.id} value={destinatario.id}>
                  {destinatario.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>
        )}

        <fieldset className="rounded-md border border-borde bg-superficie-alt/60 p-3.5">
          <legend className="px-1 text-[12px] font-semibold text-tinta">El pago</legend>

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

          {/* La tasa solo aparece cuando hace falta: pedirla en un egreso en pesos
              invita a llenarla con un dato que después nadie sabe si creer. */}
          {moneda !== 'COP' && (
            <div className="mt-3">
              <Campo
                etiqueta={`Tasa de cambio (pesos por ${moneda})`}
                htmlFor="tasaCambio"
                obligatorio
                error={errors.tasaCambio?.message}
                ayuda="Queda congelada en el documento, con la del día del egreso."
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
              <span className="text-[12px] font-semibold text-acento">Valor a pagar</span>
              <span className="cifra text-[15px] font-semibold text-acento-fuerte">{enPesos}</span>
            </div>
          )}
        </fieldset>

        <Campo
          etiqueta="Fecha del egreso"
          htmlFor="fecha"
          obligatorio
          error={errors.fecha?.message}
        >
          <Entrada id="fecha" type="date" {...register('fecha')} />
        </Campo>

        <Campo etiqueta="Descripción" htmlFor="descripcion" error={errors.descripcion?.message}>
          <textarea
            id="descripcion"
            rows={3}
            {...register('descripcion', opcional)}
            className="w-full rounded-sm border border-borde bg-campo px-2.5 py-2 text-[13px] text-tinta transition-[border-color,background-color] placeholder:text-tenue hover:border-borde-fuerte focus:border-acento focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-acento/15"
          />
        </Campo>
      </form>
    </PanelLateral>
  );
}

/** El mismo redondeo del servidor, sobre lo que hay escrito. */
function calcularEnPesos(
  monto: string | undefined,
  moneda: string | undefined,
  tasa: string | undefined,
): string | null {
  if (!monto) return null;

  try {
    if (moneda === 'COP') return formatear(redondear(aDecimal(monto)), 'COP');
    if (!tasa) return null;
    return formatear(redondear(aDecimal(monto).times(aDecimal(tasa))), 'COP');
  } catch {
    // Mientras se teclea, «12.» no es un decimal válido todavía. No es un error
    // que haya que mostrar: es alguien a mitad de escribir.
    return null;
  }
}
