'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ETIQUETA_RED,
  MONEDAS,
  REDES,
  calcularGanancia,
  crearOperacionEsquema,
  formatear,
  type Cliente,
  type DatosCrearOperacion,
  type OperacionDetalle,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { opcional } from '@/lib/formulario';
import { cn } from '@/lib/utils';

/**
 * Registrar una operación.
 *
 * La pieza que importa es la **ganancia en vivo**: se calcula mientras se escribe,
 * con `calcularGanancia` de `@nexo/shared` — exactamente la misma función que
 * después corre el servidor al guardar. Si el navegador hiciera su propia cuenta,
 * ahí es donde aparecen las diferencias de un peso que nadie sabe explicar.
 *
 * Que la cifra se mueva mientras se teclea no es adorno: quien registra una
 * operación está verificando que el número le cuadre con lo que tiene anotado, y
 * enterarse al guardar es enterarse tarde.
 */

/** Fecha de hoy en formato `input[type=date]`, en hora de Bogotá. */
function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

export function FormularioOperacion({
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
    watch,
    formState: { errors },
  } = useForm<DatosCrearOperacion>({
    resolver: zodResolver(crearOperacionEsquema),
    defaultValues: {
      monedaCompra: 'USDT',
      monedaVenta: 'USDT',
      monedaActivo: 'USDT',
      estado: 'REGISTRADA',
      fechaOperacion: hoy() as unknown as Date,
    },
  });

  // El catálogo de clientes es corto y cabe en un desplegable nativo, que con
  // teclado es más rápido que cualquier combobox reimplementado.
  const { data: clientes } = useQuery({
    queryKey: ['clientes-selector', empresaId],
    enabled: Boolean(empresaId) && abierto,
    queryFn: () =>
      peticion<RespuestaPaginada<Cliente>>('clientes?porPagina=200&dir=asc', { empresaId }),
  });

  const valores = watch();
  const ganancia = calcularEnVivo(valores);

  const crear = useMutation({
    mutationFn: (datos: DatosCrearOperacion) =>
      peticion<OperacionDetalle>('operaciones', { metodo: 'POST', cuerpo: datos, empresaId }),
    onSuccess: () => {
      toast.success('Operación registrada.');
      reset();
      onCreada();
    },
    onError: (error) => {
      toast.error(
        error instanceof ErrorDeApi ? error.message : 'No se pudo registrar la operación.',
      );
    },
  });

  const sinClientes = clientes && clientes.datos.length === 0;

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => {
        if (!valor) {
          reset();
          onCerrar();
        }
      }}
      titulo="Nueva operación"
      descripcion="La ganancia se calcula y se guarda con las tasas de hoy."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={crear.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={handleSubmit((datos) => crear.mutate(datos))}
            disabled={crear.isPending || sinClientes}
          >
            {crear.isPending ? 'Guardando…' : 'Registrar operación'}
          </Boton>
        </>
      }
    >
      {sinClientes ? (
        <div className="rounded-sm border border-alerta-borde bg-alerta-suave px-3 py-3 text-[13px] leading-relaxed text-tinta">
          Esta empresa todavía no tiene clientes. Una operación siempre cuelga de uno, así que hay
          que registrar el cliente primero.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((datos) => crear.mutate(datos))}
          className="space-y-5"
          noValidate
        >
          <Campo
            etiqueta="Cliente"
            htmlFor="clienteId"
            obligatorio
            error={errors.clienteId?.message}
          >
            <Seleccion id="clienteId" {...register('clienteId')} defaultValue="">
              <option value="" disabled>
                Selecciona un cliente…
              </option>
              {clientes?.datos.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <div className="grid grid-cols-[1fr_130px] gap-3">
            <Campo
              etiqueta="Hash de la transacción"
              htmlFor="hash"
              error={errors.hash?.message}
              ayuda="Opcional, pero es lo que después permite encontrarla."
            >
              <Entrada
                id="hash"
                autoComplete="off"
                spellCheck={false}
                className="hash"
                placeholder="0x…"
                {...register('hash')}
              />
            </Campo>

            <Campo etiqueta="Red" htmlFor="red" error={errors.red?.message}>
              <Seleccion id="red" {...register('red', opcional)} defaultValue="">
                <option value="">—</option>
                {REDES.map((red) => (
                  <option key={red} value={red}>
                    {ETIQUETA_RED[red]}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <LadoOperacion
            titulo="Compra"
            detalle="Lo que se pagó por el activo."
            campoValor="valorCompra"
            campoMoneda="monedaCompra"
            campoTasa="tasaCompra"
            moneda={valores.monedaCompra}
            register={register}
            errores={{
              valor: errors.valorCompra?.message,
              tasa: errors.tasaCompra?.message,
            }}
          />

          <LadoOperacion
            titulo="Venta"
            detalle="Lo que se recibió al venderlo."
            campoValor="valorVenta"
            campoMoneda="monedaVenta"
            campoTasa="tasaVenta"
            moneda={valores.monedaVenta}
            register={register}
            errores={{
              valor: errors.valorVenta?.message,
              tasa: errors.tasaVenta?.message,
            }}
          />

          {/* La cifra que la persona está verificando mientras teclea. */}
          <ResultadoEnVivo resultado={ganancia} />

          <div className="grid grid-cols-[1fr_130px] gap-3">
            <Campo
              etiqueta="Cantidad del activo"
              htmlFor="cantidad"
              error={errors.cantidad?.message}
              ayuda="Opcional."
            >
              <Entrada
                id="cantidad"
                inputMode="decimal"
                autoComplete="off"
                className="cifra"
                {...register('cantidad', opcional)}
              />
            </Campo>

            <Campo etiqueta="Activo" htmlFor="monedaActivo" error={errors.monedaActivo?.message}>
              <Seleccion id="monedaActivo" {...register('monedaActivo')}>
                {MONEDAS.map((moneda) => (
                  <option key={moneda} value={moneda}>
                    {moneda}
                  </option>
                ))}
              </Seleccion>
            </Campo>
          </div>

          <Campo
            etiqueta="Fecha de la operación"
            htmlFor="fechaOperacion"
            obligatorio
            error={errors.fechaOperacion?.message}
          >
            <Entrada id="fechaOperacion" type="date" {...register('fechaOperacion')} />
          </Campo>

          <Campo
            etiqueta="Observaciones"
            htmlFor="observaciones"
            error={errors.observaciones?.message}
          >
            <textarea
              id="observaciones"
              rows={3}
              {...register('observaciones', opcional)}
              className="w-full rounded-sm border border-borde bg-campo px-2.5 py-2 text-[13px] text-tinta transition-[border-color,background-color] placeholder:text-tenue hover:border-borde-fuerte focus:border-acento focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-acento/15"
            />
          </Campo>
        </form>
      )}
    </PanelLateral>
  );
}

/**
 * Un lado de la operación: monto, moneda y —si no es peso— su tasa.
 *
 * El campo de tasa aparece solo cuando hace falta. Mostrarlo siempre invita a
 * llenarlo con la operación en pesos, y una tasa donde no va es un dato que después
 * nadie sabe si creer.
 */
function LadoOperacion({
  titulo,
  detalle,
  campoValor,
  campoMoneda,
  campoTasa,
  moneda,
  register,
  errores,
}: {
  titulo: string;
  detalle: string;
  campoValor: 'valorCompra' | 'valorVenta';
  campoMoneda: 'monedaCompra' | 'monedaVenta';
  campoTasa: 'tasaCompra' | 'tasaVenta';
  moneda: string | undefined;
  register: ReturnType<typeof useForm<DatosCrearOperacion>>['register'];
  errores: { valor?: string; tasa?: string };
}) {
  const necesitaTasa = moneda !== undefined && moneda !== 'COP';

  return (
    <fieldset className="rounded-md border border-borde bg-superficie-alt/60 p-3.5">
      <legend className="px-1 text-[12px] font-semibold text-tinta">{titulo}</legend>
      <p className="-mt-0.5 mb-3 text-[12px] text-grafito">{detalle}</p>

      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Campo etiqueta="Valor" htmlFor={campoValor} obligatorio error={errores.valor}>
          <Entrada
            id={campoValor}
            inputMode="decimal"
            autoComplete="off"
            className="cifra"
            placeholder="0.00"
            {...register(campoValor)}
          />
        </Campo>

        <Campo etiqueta="Moneda" htmlFor={campoMoneda} obligatorio>
          <Seleccion id={campoMoneda} {...register(campoMoneda)}>
            {MONEDAS.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </Seleccion>
        </Campo>
      </div>

      {necesitaTasa && (
        <div className="mt-3">
          <Campo
            etiqueta={`Tasa de cambio (pesos por ${moneda})`}
            htmlFor={campoTasa}
            obligatorio
            error={errores.tasa}
            ayuda="Queda congelada: recalcular después con la tasa de otro día cambiaría un resultado ya reportado."
          >
            <Entrada
              id={campoTasa}
              inputMode="decimal"
              autoComplete="off"
              className="cifra"
              placeholder="4000.00"
              {...register(campoTasa, opcional)}
            />
          </Campo>
        </div>
      )}
    </fieldset>
  );
}

type ResultadoEnVivo =
  | { estado: 'incompleto' }
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'listo';
      gananciaCOP: string;
      margen: string | null;
      compraCOP: string;
      ventaCOP: string;
    };

/** Corre el cálculo compartido sobre lo que hay escrito, sin quejarse de lo que falta. */
function calcularEnVivo(valores: Partial<DatosCrearOperacion>): ResultadoEnVivo {
  const { valorCompra, monedaCompra, valorVenta, monedaVenta } = valores;
  if (!valorCompra || !monedaCompra || !valorVenta || !monedaVenta) {
    return { estado: 'incompleto' };
  }

  try {
    const resultado = calcularGanancia(
      { valor: valorCompra, moneda: monedaCompra, tasa: valores.tasaCompra },
      { valor: valorVenta, moneda: monedaVenta, tasa: valores.tasaVenta },
    );
    return { estado: 'listo', ...resultado };
  } catch (error) {
    return { estado: 'error', mensaje: error instanceof Error ? error.message : 'Faltan datos.' };
  }
}

function ResultadoEnVivo({ resultado }: { resultado: ResultadoEnVivo }) {
  if (resultado.estado === 'incompleto') {
    return (
      <div className="rounded-md border border-dashed border-borde px-4 py-3.5 text-center text-[12px] text-tenue">
        La ganancia aparece aquí en cuanto haya compra y venta.
      </div>
    );
  }

  if (resultado.estado === 'error') {
    return (
      <div
        role="status"
        className="rounded-md border border-alerta-borde bg-alerta-suave px-4 py-3 text-[12px] leading-relaxed text-alerta"
      >
        {resultado.mensaje}
      </div>
    );
  }

  const perdida = resultado.gananciaCOP.startsWith('-');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-md border px-4 py-3.5',
        perdida ? 'border-peligro-borde bg-peligro-suave' : 'border-exito-borde bg-exito-suave',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('text-[12px] font-semibold', perdida ? 'text-peligro' : 'text-exito')}>
          {perdida ? 'Pérdida' : 'Ganancia'}
        </span>
        <span
          className={cn('cifra text-[17px] font-semibold', perdida ? 'text-peligro' : 'text-exito')}
        >
          {formatear(resultado.gananciaCOP, 'COP')}
        </span>
      </div>

      <dl className="mt-2.5 space-y-1 border-t border-current/15 pt-2.5 text-[12px]">
        <div className="flex justify-between gap-3">
          <dt className="text-grafito">Compra en pesos</dt>
          <dd className="cifra text-tinta">{formatear(resultado.compraCOP, 'COP')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-grafito">Venta en pesos</dt>
          <dd className="cifra text-tinta">{formatear(resultado.ventaCOP, 'COP')}</dd>
        </div>
        {resultado.margen && (
          <div className="flex justify-between gap-3">
            <dt className="text-grafito">Margen</dt>
            <dd className="cifra text-tinta">{resultado.margen} %</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
