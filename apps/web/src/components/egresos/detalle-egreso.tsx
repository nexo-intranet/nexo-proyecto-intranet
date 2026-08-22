'use client';

import {
  ETIQUETA_ESTADO_EGRESO,
  ETIQUETA_ESTADO_ORDEN_PAGO,
  ETIQUETA_TIPO_INTANGIBLE,
  formatear,
  type EgresoDetalle,
  type OrdenPagoResumen,
} from '@nexo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, FileText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Distintivo } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, descargarArchivo, peticion } from '@/lib/api/cliente';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * Detalle de un egreso y el historial de sus órdenes.
 *
 * El historial completo se muestra, no solo la vigente. Una orden anulada con su
 * motivo al lado de la que la reemplazó es exactamente lo que alguien necesita ver
 * cuando pregunta por qué hay dos consecutivos para un mismo pago.
 */
export function DetalleEgreso({
  egreso,
  empresaId,
  onCambio,
}: {
  egreso: EgresoDetalle;
  empresaId: string | null;
  onCambio: () => void;
}) {
  const anulado = egreso.estado === 'ANULADO';

  const filas: Array<[string, string]> = [
    ['Concepto', egreso.concepto],
    ['Tipo', ETIQUETA_TIPO_INTANGIBLE[egreso.tipoIntangible]],
    ['Beneficiario', egreso.beneficiario],
    ['Fecha', formatearFecha(egreso.fecha)],
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-semibold text-tinta">{egreso.concepto}</p>
          <Distintivo tono={anulado ? 'peligro' : 'acento'} punto>
            {ETIQUETA_ESTADO_EGRESO[egreso.estado]}
          </Distintivo>
        </div>

        <dl className="mt-3 space-y-2">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-baseline justify-between gap-4">
              <dt className="etiqueta shrink-0">{etiqueta}</dt>
              <dd className="min-w-0 text-right text-[13px] text-tinta">{valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-md border border-borde bg-superficie-alt/60 px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-semibold text-grafito">Valor a pagar</span>
          <span className="cifra text-[17px] font-semibold text-tinta">
            {formatear(egreso.montoCOP, 'COP')}
          </span>
        </div>

        {egreso.moneda !== 'COP' && (
          <dl className="mt-2.5 space-y-1 border-t border-borde pt-2.5 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-grafito">Valor original</dt>
              <dd className="cifra text-tinta">{formatear(egreso.monto, egreso.moneda)}</dd>
            </div>
            {egreso.tasaCambio && (
              <div className="flex justify-between gap-3">
                <dt className="text-grafito">Tasa congelada</dt>
                <dd className="cifra text-tinta">{egreso.tasaCambio}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {egreso.descripcion && (
        <section>
          <p className="encabezado-columna mb-1.5">Descripción</p>
          <p className="text-[13px] leading-relaxed text-grafito">{egreso.descripcion}</p>
        </section>
      )}

      {anulado && (
        <section className="rounded-md border border-peligro-borde bg-peligro-suave px-4 py-3">
          <p className="text-[12px] font-semibold text-peligro">Egreso anulado</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta">{egreso.motivoAnulacion}</p>
          {egreso.anuladoEn && (
            <p className="mt-1.5 text-[12px] text-grafito">
              {formatearFechaHora(egreso.anuladoEn)}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-grafito" aria-hidden />
          <h3 className="text-[13px] font-semibold text-tinta">Órdenes de pago</h3>
        </div>

        <ul className="divide-y divide-borde rounded-sm border border-borde bg-superficie">
          {egreso.ordenes.map((orden) => (
            <FilaOrden
              key={orden.id}
              orden={orden}
              empresaId={empresaId}
              egresoAnulado={anulado}
              onCambio={onCambio}
            />
          ))}
        </ul>
      </section>

      {!anulado && (
        <AnularEgreso
          egresoId={egreso.id}
          consecutivo={egreso.ordenVigente?.consecutivo ?? ''}
          empresaId={empresaId}
          onAnulado={onCambio}
        />
      )}
    </div>
  );
}

function FilaOrden({
  orden,
  empresaId,
  egresoAnulado,
  onCambio,
}: {
  orden: OrdenPagoResumen;
  empresaId: string | null;
  egresoAnulado: boolean;
  onCambio: () => void;
}) {
  const [accion, setAccion] = useState<'anular' | 'reemitir' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [descargando, setDescargando] = useState(false);
  const clienteConsultas = useQueryClient();

  const cerrar = () => {
    setAccion(null);
    setMotivo('');
    setConfirmacion('');
  };

  const refrescar = () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['ordenes-pago'] });
    cerrar();
    onCambio();
  };

  const anular = useMutation({
    mutationFn: () =>
      peticion(`ordenes-pago/${orden.id}/anular`, {
        metodo: 'POST',
        cuerpo: { motivo, confirmacionConsecutivo: confirmacion },
        empresaId,
      }),
    onSuccess: () => {
      toast.success(`Orden ${orden.consecutivo} anulada.`);
      refrescar();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo anular.');
    },
  });

  const reemitir = useMutation({
    mutationFn: () =>
      peticion(`ordenes-pago/${orden.id}/reemitir`, {
        metodo: 'POST',
        cuerpo: { motivo },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Orden reemitida con consecutivo nuevo.');
      refrescar();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo reemitir.');
    },
  });

  /**
   * El PDF pasa por el proxy con la sesión y la empresa activa, igual que todo lo
   * demás. Nunca un enlace directo: el backend verifica permisos antes de generar
   * un byte (brief §4.13).
   */
  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarArchivo(`ordenes-pago/${orden.id}/pdf`, `${orden.consecutivo}.pdf`, empresaId);
    } catch {
      toast.error('No se pudo descargar la orden.');
    } finally {
      setDescargando(false);
    }
  };

  const vigente = orden.estado === 'VIGENTE';

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="cifra block text-[13px] font-medium text-tinta">
            {orden.consecutivo}
          </span>
          <span className="text-[11px] text-tenue">
            {formatearFechaHora(orden.emitidaEn)}
            {orden.emitidaPor ? ` · ${orden.emitidaPor.nombre}` : ''}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <Distintivo tono={vigente ? 'exito' : 'peligro'}>
            {ETIQUETA_ESTADO_ORDEN_PAGO[orden.estado]}
          </Distintivo>
          <Boton
            variante="fantasma"
            tamano="iconoPequeno"
            aria-label={`Descargar ${orden.consecutivo}`}
            disabled={descargando}
            onClick={() => void descargar()}
          >
            <Download aria-hidden />
          </Boton>
        </span>
      </div>

      {orden.reemplazaA && (
        <p className="mt-1 text-[11px] text-tenue">
          Reemplaza a <span className="cifra">{orden.reemplazaA}</span>
        </p>
      )}

      {orden.motivoAnulacion && (
        <p className="mt-1.5 rounded-sm bg-peligro-suave px-2 py-1.5 text-[12px] leading-snug text-tinta">
          {orden.motivoAnulacion}
        </p>
      )}

      {!egresoAnulado && accion === null && (
        <div className="mt-2 flex items-center gap-1.5">
          {vigente && (
            <Boton variante="peligroSuave" tamano="pequeno" onClick={() => setAccion('anular')}>
              <Ban aria-hidden />
              Anular
            </Boton>
          )}
          {!vigente && !orden.reemplazaA && (
            <Boton variante="secundario" tamano="pequeno" onClick={() => setAccion('reemitir')}>
              <RefreshCw aria-hidden />
              Reemitir
            </Boton>
          )}
        </div>
      )}

      {accion === 'anular' && (
        <div className="mt-2.5 space-y-2 rounded-sm border border-peligro-borde bg-peligro-suave p-2.5">
          <Campo etiqueta="Motivo" htmlFor={`motivo-${orden.id}`} obligatorio>
            <textarea
              id={`motivo-${orden.id}`}
              rows={2}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              autoFocus
              className="w-full rounded-sm border border-borde bg-superficie px-2.5 py-2 text-[13px] text-tinta focus:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro/15"
            />
          </Campo>

          {/* La confirmación escrita. El servidor la vuelve a comprobar: aquí es
              comodidad, allá es el control. */}
          <Campo
            etiqueta={`Escribe «${orden.consecutivo}» para confirmar`}
            htmlFor={`confirmar-${orden.id}`}
            obligatorio
          >
            <Entrada
              id={`confirmar-${orden.id}`}
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
              className="cifra"
              autoComplete="off"
            />
          </Campo>

          <div className="flex items-center gap-2">
            <Boton
              variante="peligro"
              tamano="pequeno"
              disabled={motivo.trim().length < 10 || confirmacion.trim() === '' || anular.isPending}
              onClick={() => anular.mutate()}
            >
              {anular.isPending ? 'Anulando…' : 'Confirmar anulación'}
            </Boton>
            <Boton variante="fantasma" tamano="pequeno" onClick={cerrar}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {accion === 'reemitir' && (
        <div className="mt-2.5 space-y-2 rounded-sm border border-borde bg-superficie-alt p-2.5">
          <Campo
            etiqueta="Motivo de la reemisión"
            htmlFor={`reemitir-${orden.id}`}
            obligatorio
            ayuda="Se expide el mismo documento con número nuevo."
          >
            <textarea
              id={`reemitir-${orden.id}`}
              rows={2}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              autoFocus
              className="w-full rounded-sm border border-borde bg-superficie px-2.5 py-2 text-[13px] text-tinta focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/15"
            />
          </Campo>

          <div className="flex items-center gap-2">
            <Boton
              variante="primario"
              tamano="pequeno"
              disabled={motivo.trim().length < 10 || reemitir.isPending}
              onClick={() => reemitir.mutate()}
            >
              {reemitir.isPending ? 'Emitiendo…' : 'Reemitir'}
            </Boton>
            <Boton variante="fantasma" tamano="pequeno" onClick={cerrar}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

function AnularEgreso({
  egresoId,
  consecutivo,
  empresaId,
  onAnulado,
}: {
  egresoId: string;
  consecutivo: string;
  empresaId: string | null;
  onAnulado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');

  const anular = useMutation({
    mutationFn: () =>
      peticion(`egresos/${egresoId}/anular`, {
        metodo: 'POST',
        cuerpo: { motivo, confirmacionConsecutivo: confirmacion },
        empresaId,
      }),
    onSuccess: () => {
      toast.success('Egreso anulado.');
      setAbierto(false);
      onAnulado();
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
          Anular el egreso
        </Boton>
        <p className="mt-1.5 text-[11px] leading-relaxed text-tenue">
          Anula también su orden vigente. Nada se borra: queda con su motivo en el historial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-md border border-peligro-borde bg-peligro-suave p-3.5">
      <Campo etiqueta="Motivo de la anulación" htmlFor="motivo-egreso" obligatorio>
        <textarea
          id="motivo-egreso"
          rows={3}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          autoFocus
          className={cn(
            'w-full rounded-sm border border-borde bg-superficie px-2.5 py-2 text-[13px] text-tinta',
            'focus:border-peligro focus:outline-none focus:ring-2 focus:ring-peligro/15',
          )}
        />
      </Campo>

      <Campo
        etiqueta={`Escribe «${consecutivo}» para confirmar`}
        htmlFor="confirmar-egreso"
        obligatorio
      >
        <Entrada
          id="confirmar-egreso"
          value={confirmacion}
          onChange={(evento) => setConfirmacion(evento.target.value)}
          className="cifra"
          autoComplete="off"
        />
      </Campo>

      <div className="flex items-center gap-2">
        <Boton
          variante="peligro"
          tamano="pequeno"
          disabled={motivo.trim().length < 10 || confirmacion.trim() === '' || anular.isPending}
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
            setConfirmacion('');
          }}
        >
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
