'use client';

import {
  ETIQUETA_ESTADO_DESTINO,
  ETIQUETA_ESTADO_DISPERSION,
  formatear,
  type DispersionVista,
} from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { Check, Split, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Cuadre, Distintivo } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';

/**
 * Una dispersión ya guardada, y su conciliación.
 *
 * Ejecutar y devolver son dos acciones distintas, no un estado que se pasa por
 * parámetro, porque lo que pide cada una es distinto: un giro que salió necesita su
 * referencia de pago; uno que se devolvió necesita que alguien explique por qué.
 * Pedir una referencia de pago para una devolución obligaría a inventarla.
 *
 * Y conciliar no va en una sola dirección: un giro ejecutado se puede devolver, y
 * eso reabre la operación. El banco devuelve giros, y el sistema tiene que poder
 * registrarlo sin que nadie tenga que anular y rehacer.
 */
export function DispersionExistente({
  dispersion,
  empresaId,
  onCambio,
}: {
  dispersion: DispersionVista;
  empresaId: string | null;
  onCambio: () => void;
}) {
  const [accion, setAccion] = useState<{ destinoId: string; tipo: 'ejecutar' | 'revertir' } | null>(
    null,
  );
  const [texto, setTexto] = useState('');

  const cerrar = () => {
    setAccion(null);
    setTexto('');
  };

  const ejecutar = useMutation({
    mutationFn: (destinoId: string) =>
      peticion<DispersionVista>(`dispersiones/${dispersion.id}/destinos/${destinoId}/ejecutar`, {
        metodo: 'POST',
        cuerpo: { referenciaPago: texto },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Giro marcado como ejecutado.');
      cerrar();
      onCambio();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo marcar el giro.');
    },
  });

  const revertir = useMutation({
    mutationFn: (destinoId: string) =>
      peticion<DispersionVista>(`dispersiones/${dispersion.id}/destinos/${destinoId}/revertir`, {
        metodo: 'POST',
        cuerpo: { motivo: texto },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Giro devuelto.');
      cerrar();
      onCambio();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo devolver el giro.');
    },
  });

  const cuadra = dispersion.diferencia === '0.00';
  const trabajando = ejecutar.isPending || revertir.isPending;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Split className="size-4 text-grafito" aria-hidden />
          <h3 className="text-[13px] font-semibold text-tinta">Dispersión</h3>
        </div>
        <Distintivo tono={dispersion.estado === 'EJECUTADA' ? 'exito' : 'alerta'} punto>
          {ETIQUETA_ESTADO_DISPERSION[dispersion.estado]}
        </Distintivo>
      </div>

      <Cuadre
        cuadra={cuadra}
        detalle={
          cuadra
            ? formatear(dispersion.montoTotal, 'COP')
            : `Diferencia ${formatear(dispersion.diferencia, 'COP')}`
        }
      />

      <ul className="divide-y divide-borde rounded-sm border border-borde bg-superficie">
        {dispersion.destinos.map((destino) => {
          const activa = accion?.destinoId === destino.id ? accion.tipo : null;

          return (
            <li key={destino.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-tinta">
                    {destino.nombreSnapshot}
                  </span>
                  <span className="text-[11px] text-tenue">
                    {destino.porcentaje ? `${destino.porcentaje} %` : 'monto fijo'}
                    {destino.cuentaSnapshot ? ` · •••• ${destino.cuentaSnapshot}` : ''}
                  </span>
                </span>
                <span className="cifra shrink-0 text-tinta">{formatear(destino.monto, 'COP')}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Distintivo
                  tono={
                    destino.estado === 'EJECUTADO'
                      ? 'exito'
                      : destino.estado === 'DEVUELTO'
                        ? 'peligro'
                        : 'neutro'
                  }
                >
                  {ETIQUETA_ESTADO_DESTINO[destino.estado]}
                </Distintivo>

                {destino.referenciaPago && (
                  <span className="cifra text-[11px] text-grafito">{destino.referenciaPago}</span>
                )}

                <span className="ml-auto flex items-center gap-1.5">
                  {destino.estado !== 'EJECUTADO' && activa === null && (
                    <Boton
                      variante="secundario"
                      tamano="pequeno"
                      onClick={() => {
                        setAccion({ destinoId: destino.id, tipo: 'ejecutar' });
                        setTexto('');
                      }}
                    >
                      <Check aria-hidden />
                      Marcar girado
                    </Boton>
                  )}

                  {destino.estado === 'EJECUTADO' && activa === null && (
                    <Boton
                      variante="peligroSuave"
                      tamano="pequeno"
                      onClick={() => {
                        setAccion({ destinoId: destino.id, tipo: 'revertir' });
                        setTexto('');
                      }}
                    >
                      <Undo2 aria-hidden />
                      Devolver
                    </Boton>
                  )}
                </span>
              </div>

              {activa === 'ejecutar' && (
                <div className="mt-2.5 space-y-2 rounded-sm border border-borde bg-superficie-alt p-2.5">
                  <Campo
                    etiqueta="Referencia del pago"
                    htmlFor={`referencia-${destino.id}`}
                    obligatorio
                    ayuda="Es la única prueba de que el giro salió."
                  >
                    <Entrada
                      id={`referencia-${destino.id}`}
                      value={texto}
                      onChange={(evento) => setTexto(evento.target.value)}
                      placeholder="TRF-00012"
                      autoFocus
                    />
                  </Campo>

                  <div className="flex items-center gap-2">
                    <Boton
                      variante="primario"
                      tamano="pequeno"
                      disabled={texto.trim().length === 0 || trabajando}
                      onClick={() => ejecutar.mutate(destino.id)}
                    >
                      {ejecutar.isPending ? 'Guardando…' : 'Confirmar giro'}
                    </Boton>
                    <Boton variante="fantasma" tamano="pequeno" onClick={cerrar}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}

              {activa === 'revertir' && (
                <div className="mt-2.5 space-y-2 rounded-sm border border-peligro-borde bg-peligro-suave p-2.5">
                  <Campo
                    etiqueta="Motivo de la devolución"
                    htmlFor={`motivo-${destino.id}`}
                    obligatorio
                    ayuda="Mínimo 10 caracteres. Queda en el historial."
                  >
                    <textarea
                      id={`motivo-${destino.id}`}
                      rows={2}
                      value={texto}
                      onChange={(evento) => setTexto(evento.target.value)}
                      autoFocus
                      className="w-full rounded-sm border border-borde bg-superficie px-2.5 py-2 text-[13px] text-tinta focus:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro/15"
                    />
                  </Campo>

                  <div className="flex items-center gap-2">
                    <Boton
                      variante="peligro"
                      tamano="pequeno"
                      disabled={texto.trim().length < 10 || trabajando}
                      onClick={() => revertir.mutate(destino.id)}
                    >
                      {revertir.isPending ? 'Guardando…' : 'Confirmar devolución'}
                    </Boton>
                    <Boton variante="fantasma" tamano="pequeno" onClick={cerrar}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
