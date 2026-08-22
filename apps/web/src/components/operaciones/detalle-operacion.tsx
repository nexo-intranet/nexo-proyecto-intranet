'use client';

import {
  ETIQUETA_ESTADO_OPERACION,
  ETIQUETA_RED,
  formatear,
  type DispersionVista,
  type OperacionDetalle,
  type ReglaVista,
  type RepartoCalculado,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Split } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DispersionExistente } from '@/components/operaciones/dispersion-existente';
import { Cuadre, Distintivo, EstadoError, Esqueleto } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { Campo, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * Detalle de una operación, con su reparto.
 *
 * Las dos cosas van juntas porque en la cabeza de quien opera son una sola: la
 * operación dejó una ganancia y esa ganancia hay que repartirla. Separarlas en dos
 * pantallas obligaría a recordar cifras de una a otra, que es justo donde se
 * cometen los errores.
 */

/** Lo que devuelve `POST /dispersiones/previsualizar`: el reparto más los nombres. */
type DestinoPrevisto = RepartoCalculado['destinos'][number] & {
  nombre: string;
  cuentaFinal: string | null;
};

// `Omit` y no una intersección: al intersecar, TypeScript se queda con el tipo de
// `destinos` del primer miembro y los campos añadidos desaparecen al indexar.
type Previsualizacion = Omit<RepartoCalculado, 'destinos'> & { destinos: DestinoPrevisto[] };

export function DetalleOperacion({
  operacionId,
  empresaId,
  onCambio,
}: {
  operacionId: string;
  empresaId: string | null;
  onCambio: () => void;
}) {
  const clienteConsultas = useQueryClient();

  const {
    data: operacion,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['operacion', operacionId, empresaId],
    queryFn: () => peticion<OperacionDetalle>(`operaciones/${operacionId}`, { empresaId }),
  });

  const refrescarTodo = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['operacion', operacionId] });
    void clienteConsultas.invalidateQueries({ queryKey: ['dispersion', operacionId] });
    onCambio();
  };

  if (isLoading) return <Esqueleto className="h-64 rounded-md" />;
  if (error || !operacion) {
    return (
      <EstadoError mensaje="No se pudo cargar la operación." onReintentar={() => void refetch()} />
    );
  }

  const perdida = operacion.gananciaCOP.startsWith('-');

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-tinta">{operacion.cliente.nombre}</p>
            <p className="mt-0.5 text-[12px] text-grafito">
              {formatearFecha(operacion.fechaOperacion)}
            </p>
          </div>
          <Distintivo
            tono={
              operacion.estado === 'CONCILIADA'
                ? 'exito'
                : operacion.estado === 'ANULADA'
                  ? 'peligro'
                  : 'acento'
            }
            punto
          >
            {ETIQUETA_ESTADO_OPERACION[operacion.estado]}
          </Distintivo>
        </div>

        {operacion.hash && (
          <div className="mt-3 rounded-sm border border-borde bg-superficie-alt px-3 py-2">
            <p className="encabezado-columna">
              Hash {operacion.red ? `· ${ETIQUETA_RED[operacion.red]}` : ''}
            </p>
            <p className="hash mt-1 break-all text-tinta">{operacion.hash}</p>
          </div>
        )}
      </section>

      {/* La cifra que importa, con sus dos lados debajo. */}
      <section
        className={cn(
          'rounded-md border px-4 py-3.5',
          perdida ? 'border-peligro-borde bg-peligro-suave' : 'border-exito-borde bg-exito-suave',
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn('text-[12px] font-semibold', perdida ? 'text-peligro' : 'text-exito')}
          >
            {perdida ? 'Pérdida' : 'Ganancia'}
          </span>
          <span
            className={cn(
              'cifra text-[17px] font-semibold',
              perdida ? 'text-peligro' : 'text-exito',
            )}
          >
            {formatear(operacion.gananciaCOP, 'COP')}
          </span>
        </div>

        <dl className="mt-2.5 space-y-1 border-t border-current/15 pt-2.5 text-[12px]">
          <Fila
            etiqueta="Compra"
            valor={formatear(operacion.valorCompra, operacion.monedaCompra)}
            nota={operacion.tasaCompra ? `tasa ${operacion.tasaCompra}` : undefined}
          />
          <Fila
            etiqueta="Venta"
            valor={formatear(operacion.valorVenta, operacion.monedaVenta)}
            nota={operacion.tasaVenta ? `tasa ${operacion.tasaVenta}` : undefined}
          />
          {operacion.cantidad && operacion.monedaActivo && (
            <Fila etiqueta="Cantidad" valor={`${operacion.cantidad} ${operacion.monedaActivo}`} />
          )}
        </dl>
      </section>

      {operacion.observaciones && (
        <section>
          <p className="encabezado-columna mb-1.5">Observaciones</p>
          <p className="text-[13px] leading-relaxed text-grafito">{operacion.observaciones}</p>
        </section>
      )}

      {operacion.estado === 'ANULADA' ? (
        <section className="rounded-md border border-peligro-borde bg-peligro-suave px-4 py-3">
          <p className="text-[12px] font-semibold text-peligro">Operación anulada</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta">{operacion.motivoAnulacion}</p>
          {operacion.anuladaEn && (
            <p className="mt-1.5 text-[12px] text-grafito">
              {formatearFechaHora(operacion.anuladaEn)}
            </p>
          )}
        </section>
      ) : (
        <SeccionDispersion
          operacionId={operacionId}
          empresaId={empresaId}
          gananciaCOP={operacion.gananciaCOP}
          onCambio={refrescarTodo}
        />
      )}

      {operacion.estado !== 'ANULADA' && (
        <AnularOperacion
          operacionId={operacionId}
          empresaId={empresaId}
          onAnulada={refrescarTodo}
        />
      )}
    </div>
  );
}

function Fila({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-grafito">
        {etiqueta}
        {nota && <span className="ml-1.5 text-tenue">({nota})</span>}
      </dt>
      <dd className="cifra text-tinta">{valor}</dd>
    </div>
  );
}

// ── Dispersión ──────────────────────────────────────────────────────────────

function SeccionDispersion({
  operacionId,
  empresaId,
  gananciaCOP,
  onCambio,
}: {
  operacionId: string;
  empresaId: string | null;
  gananciaCOP: string;
  onCambio: () => void;
}) {
  const { data: dispersion, isLoading } = useQuery({
    queryKey: ['dispersion', operacionId, empresaId],
    retry: false,
    queryFn: async () => {
      try {
        return await peticion<DispersionVista>(`operaciones/${operacionId}/dispersion`, {
          empresaId,
        });
      } catch (error) {
        // Que no exista todavía no es una falla: es el estado inicial.
        if (error instanceof ErrorDeApi && error.codigo === 'NO_ENCONTRADO') return null;
        throw error;
      }
    },
  });

  if (isLoading) return <Esqueleto className="h-40 rounded-md" />;

  return dispersion ? (
    <DispersionExistente dispersion={dispersion} empresaId={empresaId} onCambio={onCambio} />
  ) : (
    <CrearDispersion
      operacionId={operacionId}
      empresaId={empresaId}
      gananciaCOP={gananciaCOP}
      onCreada={onCambio}
    />
  );
}

function CrearDispersion({
  operacionId,
  empresaId,
  gananciaCOP,
  onCreada,
}: {
  operacionId: string;
  empresaId: string | null;
  gananciaCOP: string;
  onCreada: () => void;
}) {
  const [reglaId, setReglaId] = useState('');
  const [vista, setVista] = useState<Previsualizacion | null>(null);

  const { data: reglas } = useQuery({
    queryKey: ['reglas-dispersion', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<ReglaVista>>('reglas-dispersion?porPagina=100', { empresaId }),
  });

  const previsualizar = useMutation({
    mutationFn: () =>
      peticion<Previsualizacion>(`operaciones/${operacionId}/dispersion/previsualizar`, {
        metodo: 'POST',
        cuerpo: { reglaId },
        empresaId,
      }),
    onSuccess: setVista,
    onError: (error) => {
      setVista(null);
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo calcular el reparto.');
    },
  });

  const guardar = useMutation({
    mutationFn: () =>
      peticion<DispersionVista>(`operaciones/${operacionId}/dispersion`, {
        metodo: 'POST',
        cuerpo: { reglaId },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Dispersión creada.');
      onCreada();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo guardar el reparto.');
    },
  });

  const activas = (reglas?.datos ?? []).filter((regla) => regla.activa);

  return (
    <section className="rounded-md border border-borde bg-superficie-alt/60 p-4">
      <div className="flex items-center gap-2">
        <Split className="size-4 text-grafito" aria-hidden />
        <h3 className="text-[13px] font-semibold text-tinta">Repartir la ganancia</h3>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-grafito">
        Se reparte {formatear(gananciaCOP, 'COP')} entre los destinatarios de la regla que elijas.
      </p>

      {activas.length === 0 ? (
        <p className="mt-3 rounded-sm border border-alerta-borde bg-alerta-suave px-3 py-2.5 text-[12px] leading-relaxed text-tinta">
          No hay reglas de dispersión activas en esta empresa. Hay que crear una antes de poder
          repartir.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            <Campo etiqueta="Regla de reparto" htmlFor="reglaId">
              <Seleccion
                id="reglaId"
                value={reglaId}
                onChange={(evento) => {
                  setReglaId(evento.target.value);
                  setVista(null);
                }}
              >
                <option value="">Selecciona una regla…</option>
                {activas.map((regla) => (
                  <option key={regla.id} value={regla.id}>
                    {regla.nombre}
                  </option>
                ))}
              </Seleccion>
            </Campo>

            <Boton
              variante="secundario"
              disabled={!reglaId || previsualizar.isPending}
              onClick={() => previsualizar.mutate()}
            >
              {previsualizar.isPending ? 'Calculando…' : 'Previsualizar reparto'}
            </Boton>
          </div>

          {vista && (
            <div className="mt-4 space-y-3">
              {/* El cuadre no es un mensaje de error: es un estado permanente del
                  dato, con la diferencia al centavo, siempre visible. */}
              <Cuadre
                cuadra={vista.cuadra}
                detalle={
                  vista.cuadra
                    ? formatear(vista.total, 'COP')
                    : `Diferencia ${formatear(vista.diferencia, 'COP')}`
                }
              />

              <ul className="divide-y divide-borde-suave rounded-sm border border-borde bg-superficie">
                {vista.destinos.map((destino) => (
                  <li
                    key={destino.referencia}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-tinta">
                        {destino.nombre}
                      </span>
                      <span className="text-[11px] text-tenue">
                        {destino.porcentaje ? `${destino.porcentaje} %` : 'monto fijo'}
                        {destino.cuentaFinal ? ` · •••• ${destino.cuentaFinal}` : ''}
                        {Number(destino.ajuste) !== 0 && (
                          <span className="ml-1 text-alerta">
                            (+{formatear(destino.ajuste, 'COP')} de residuo)
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="cifra shrink-0 text-tinta">
                      {formatear(destino.monto, 'COP')}
                    </span>
                  </li>
                ))}
              </ul>

              <Boton
                variante="primario"
                disabled={!vista.cuadra || guardar.isPending}
                onClick={() => guardar.mutate()}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar dispersión'}
              </Boton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Anulación ───────────────────────────────────────────────────────────────

function AnularOperacion({
  operacionId,
  empresaId,
  onAnulada,
}: {
  operacionId: string;
  empresaId: string | null;
  onAnulada: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const anular = useMutation({
    mutationFn: () =>
      peticion<OperacionDetalle>(`operaciones/${operacionId}/anular`, {
        metodo: 'POST',
        cuerpo: { motivo },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Operación anulada.');
      setAbierto(false);
      setMotivo('');
      onAnulada();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo anular.');
    },
  });

  if (!abierto) {
    return (
      <div className="border-t border-borde pt-4">
        <Boton variante="peligroSuave" tamano="pequeno" onClick={() => setAbierto(true)}>
          <Ban aria-hidden />
          Anular operación
        </Boton>
        <p className="mt-1.5 text-[11px] leading-relaxed text-tenue">
          No se borra: queda registrada con su motivo, y el audit log guarda quién la anuló.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-md border border-peligro-borde bg-peligro-suave p-3.5">
      <Campo
        etiqueta="Motivo de la anulación"
        htmlFor="motivo-anulacion"
        obligatorio
        ayuda="Mínimo 10 caracteres. Queda en el historial para siempre."
      >
        <textarea
          id="motivo-anulacion"
          rows={3}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          autoFocus
          className="w-full rounded-sm border border-borde bg-superficie px-2.5 py-2 text-[13px] text-tinta focus:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro/15"
        />
      </Campo>

      <div className="flex items-center gap-2">
        <Boton
          variante="peligro"
          tamano="pequeno"
          disabled={motivo.trim().length < 10 || anular.isPending}
          onClick={() => anular.mutate()}
        >
          {anular.isPending ? 'Anulando…' : 'Confirmar anulación'}
        </Boton>
        <Boton
          variante="fantasma"
          tamano="pequeno"
          onClick={() => {
            setAbierto(false);
            setMotivo('');
          }}
        >
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
