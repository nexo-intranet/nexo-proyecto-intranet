'use client';

import { ETIQUETA_ESTADO_OPERACION, formatear, type ResumenOperaciones } from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Split } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoSeccion, Esqueleto } from '@/components/patrones';
import { HeroePortada } from '@/components/portada/heroe';
import { MovimientoReciente } from '@/components/portada/movimiento-reciente';
import { UltimasOperaciones } from '@/components/portada/ultimas-operaciones';
import { peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { modulosVisibles, puedeVer, useSesion } from '@/lib/sesion';

/**
 * La portada.
 *
 * Responde, en el orden en que se preguntan al entrar en la mañana: sobre qué
 * empresa estoy trabajando, a dónde entro, qué está esperando por mí, qué pasó
 * mientras no estaba.
 *
 * Todo lo que aparece sale de datos reales o no aparece. Un tablero con tarjetas de
 * adorno que siempre marcan cero enseña a ignorar el tablero, y cuando de verdad
 * haya algo pendiente nadie lo va a mirar.
 *
 * TODO Etapa 6 y 7: aquí entran los vencimientos del calendario tributario y las
 * políticas pendientes de aceptar, que son las otras dos cosas que esperan por
 * alguien. Hoy no existen todavía, así que no se dibujan.
 */
export default function PaginaInicio() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();

  const empresa = sesion?.empresas.find((candidata) => candidata.id === empresaId);
  const modulos = modulosVisibles(sesion);
  const nombre = sesion?.usuario.nombre.split(' ')[0] ?? '';

  const verOperaciones = puedeVer(sesion, 'OPERACIONES');
  const verAuditoria = puedeVer(sesion, 'ADMINISTRACION');

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['operaciones-resumen', empresaId],
    // Sin empresa activa no hay nada que resumir, y sin permiso el API responde 403.
    enabled: Boolean(empresaId) && verOperaciones,
    queryFn: () => peticion<ResumenOperaciones>('operaciones/resumen', { empresaId }),
  });

  return (
    <>
      <HeroePortada nombre={nombre} empresa={empresa} modulos={modulos} />

      <div className="mx-auto max-w-[1240px] space-y-14 px-5 py-14 lg:px-8 lg:py-16">
        {/* ── Lo que espera por alguien, y el pulso del mes ─────────────────── */}
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
          <section>
            <EncabezadoSeccion
              titulo="Acción requerida"
              descripcion="Lo que está detenido esperando a que alguien lo cierre."
              tono="peligro"
            />

            {!verOperaciones ? (
              <TarjetaVacia
                titulo="Nada pendiente para ti"
                detalle="No tienes acceso a Operaciones, que es de donde salen los pendientes de esta etapa."
              />
            ) : isLoading ? (
              <Esqueleto className="h-[92px] rounded-xl" />
            ) : resumen && resumen.dispersionesPendientes > 0 ? (
              <Link
                href="/operaciones/dispersiones?estado=PENDIENTE"
                className="group flex items-center gap-4 rounded-xl border border-peligro-borde bg-peligro-suave px-5 py-4 transition-colors hover:border-peligro"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-peligro/10 text-peligro">
                  <Split className="size-5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-tinta">
                    {resumen.dispersionesPendientes}{' '}
                    {resumen.dispersionesPendientes === 1
                      ? 'dispersión sin cerrar'
                      : 'dispersiones sin cerrar'}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-grafito">
                    Tienen giros por marcar como ejecutados o devueltos.
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-peligro transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ) : (
              <TarjetaVacia
                titulo="Todo al día"
                detalle="No hay dispersiones con giros pendientes en esta empresa."
                exito
              />
            )}
          </section>

          <section>
            <EncabezadoSeccion titulo="El mes" descripcion="Operaciones vigentes." />

            {!verOperaciones ? (
              <TarjetaVacia titulo="Sin acceso" detalle="Necesitas permiso sobre Operaciones." />
            ) : isLoading ? (
              <Esqueleto className="h-[220px] rounded-xl" />
            ) : (
              <div className="rounded-xl border border-borde bg-superficie p-5 shadow-tarjeta">
                <p className="encabezado-columna">Ganancia acumulada</p>
                <p className="cifra mt-1.5 text-[26px] font-semibold tracking-tight text-tinta">
                  {formatear(resumen?.gananciaCOP ?? '0.00', 'COP')}
                </p>

                <p className="mt-1 text-[13px] text-grafito">
                  {resumen?.cantidad ?? 0}{' '}
                  {resumen?.cantidad === 1 ? 'operación registrada' : 'operaciones registradas'}
                </p>

                {resumen && resumen.cantidad > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-borde-suave pt-4">
                    {(
                      Object.entries(resumen.porEstado) as [
                        keyof ResumenOperaciones['porEstado'],
                        number,
                      ][]
                    )
                      .filter(([, total]) => total > 0)
                      .map(([estado, total]) => (
                        <li key={estado} className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] text-grafito">
                            {ETIQUETA_ESTADO_OPERACION[estado]}
                          </span>
                          <span className="cifra text-tinta">{total}</span>
                        </li>
                      ))}
                  </ul>
                )}

                {resumen && resumen.volumenPorMoneda.length > 0 && (
                  <div className="mt-4 border-t border-borde-suave pt-4">
                    {/* Separado por moneda: sumar dólares con pesos no significa nada. */}
                    <p className="encabezado-columna mb-2">Volumen movido</p>
                    <ul className="space-y-1.5">
                      {resumen.volumenPorMoneda.map((fila) => (
                        <li key={fila.moneda} className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] text-grafito">{fila.moneda}</span>
                          <span className="cifra text-tinta">
                            {formatear(fila.compra, fila.moneda)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── El trabajo reciente, en dos columnas ──────────────────────────── */}
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
          {verOperaciones && <UltimasOperaciones empresaId={empresaId} />}
          {verAuditoria && <MovimientoReciente empresaId={empresaId} />}
        </div>
      </div>
    </>
  );
}

/** Tarjeta de «no hay nada», que no es lo mismo que un error. */
function TarjetaVacia({
  titulo,
  detalle,
  exito,
}: {
  titulo: string;
  detalle: string;
  exito?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-borde bg-superficie px-5 py-4 shadow-tarjeta">
      {exito && (
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-exito-suave text-exito">
          <CheckCircle2 className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-tinta">{titulo}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-grafito">{detalle}</span>
      </span>
    </div>
  );
}
