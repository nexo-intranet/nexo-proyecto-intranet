'use client';

import {
  formatear,
  type Empleado,
  type ResumenEgresos,
  type ResumenOperaciones,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  Receipt,
  Split,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { EncabezadoSeccion, Esqueleto } from '@/components/patrones';
import { Atajos } from '@/components/portada/atajos';
import { MovimientoReciente } from '@/components/portada/movimiento-reciente';
import { TarjetasCifra, type Cifra } from '@/components/portada/tarjetas-cifra';
import { UltimasOperaciones } from '@/components/portada/ultimas-operaciones';
import { peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { modulosVisibles, puedeVer, useSesion } from '@/lib/sesion';
import { cn } from '@/lib/utils';

/**
 * La portada.
 *
 * Responde, en el orden en que se preguntan al entrar en la mañana: sobre qué
 * empresa estoy, cómo va la cosa, qué está esperando por mí, y qué pasó mientras no
 * estaba.
 *
 * Todo lo que aparece sale de datos reales o no aparece. Un tablero con tarjetas de
 * adorno que siempre marcan cero enseña a ignorar el tablero.
 *
 * TODO Etapa 6: el calendario de obligaciones tributarias y la facturación del mes
 * —las dos secciones que faltan frente a la referencia visual del cliente— dependen
 * de Contabilidad. El espacio está reservado abajo, con su aviso.
 */
function saludo(): string {
  const hora = Number(
    new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(new Date()),
  );

  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function PaginaInicio() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();

  const empresa = sesion?.empresas.find((candidata) => candidata.id === empresaId);
  const modulos = modulosVisibles(sesion);
  const nombre = sesion?.usuario.nombre.split(' ')[0] ?? '';

  const verOperaciones = puedeVer(sesion, 'OPERACIONES');
  const verEgresos = puedeVer(sesion, 'EGRESOS');
  const verEmpleados = puedeVer(sesion, 'EMPLEADOS');
  const verAuditoria = puedeVer(sesion, 'ADMINISTRACION');

  const activa = Boolean(empresaId);

  const operaciones = useQuery({
    queryKey: ['operaciones-resumen', empresaId],
    enabled: activa && verOperaciones,
    queryFn: () => peticion<ResumenOperaciones>('operaciones/resumen', { empresaId }),
  });

  const egresos = useQuery({
    queryKey: ['egresos-resumen', empresaId],
    enabled: activa && verEgresos,
    queryFn: () => peticion<ResumenEgresos>('egresos/resumen', { empresaId }),
  });

  const empleados = useQuery({
    queryKey: ['empleados-conteo', empresaId],
    enabled: activa && verEmpleados,
    queryFn: () =>
      peticion<RespuestaPaginada<Empleado>>('empleados?porPagina=1&activo=true', { empresaId }),
  });

  const cargando = operaciones.isLoading || egresos.isLoading || empleados.isLoading;

  // Solo entra la cifra que tiene un dato detrás y un permiso que la respalde.
  const cifras: Cifra[] = [
    ...(verOperaciones && operaciones.data
      ? [
          {
            etiqueta: 'Operaciones vigentes',
            valor: operaciones.data.cantidad,
            Icono: Wallet,
            href: '/operaciones',
          },
          {
            etiqueta: 'Dispersiones sin cerrar',
            valor: operaciones.data.dispersionesPendientes,
            Icono: Split,
            href: '/operaciones/dispersiones?estado=PENDIENTE',
            tono: 'alerta' as const,
          },
        ]
      : []),
    ...(verEgresos && egresos.data
      ? [
          {
            etiqueta: 'Egresos del período',
            valor: egresos.data.cantidad,
            Icono: Receipt,
            href: '/egresos',
          },
        ]
      : []),
    ...(verEmpleados && empleados.data
      ? [
          {
            etiqueta: 'Empleados activos',
            valor: empleados.data.total,
            Icono: Users,
            href: '/empleados',
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-6 lg:px-8">
      {/* El velo dorado es la marca: tan tenue que si se nota como color, sobra. */}
      <header className="velo-marca -mx-5 mb-6 rounded-none px-5 pb-6 pt-2 lg:-mx-8 lg:px-8">
        <h1 className="titulo-portada">
          {saludo()}
          {nombre ? `, ${nombre}` : ''}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-grafito">
          {empresa ? (
            <>
              Esto es lo que hay hoy en{' '}
              <strong className="font-semibold text-tinta">{empresa.nombre}</strong>. Puedes cambiar
              de empresa arriba a la izquierda.
            </>
          ) : (
            'Selecciona una empresa en la barra de arriba para empezar a trabajar.'
          )}
        </p>
      </header>

      <div className="space-y-8">
        <TarjetasCifra cifras={cifras} cargando={cargando && cifras.length === 0} />

        <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-8">
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
              ) : operaciones.isLoading ? (
                <Esqueleto className="h-[92px] rounded-xl" />
              ) : operaciones.data && operaciones.data.dispersionesPendientes > 0 ? (
                <Link
                  href="/operaciones/dispersiones?estado=PENDIENTE"
                  className="group flex items-center gap-4 rounded-xl border border-peligro-borde bg-peligro-suave px-5 py-4 transition-colors hover:border-peligro"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-peligro/10 text-peligro">
                    <Split className="size-5" strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-tinta">
                      {operaciones.data.dispersionesPendientes}{' '}
                      {operaciones.data.dispersionesPendientes === 1
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

            {verOperaciones && <UltimasOperaciones empresaId={empresaId} />}
          </div>

          <div className="space-y-8">
            <Atajos modulos={modulos} />

            {verEgresos && egresos.data && egresos.data.cantidad > 0 && (
              <section>
                <EncabezadoSeccion titulo="Egresos" descripcion="Del período." />
                <div className="rounded-xl border border-borde bg-superficie p-5 shadow-tarjeta">
                  <p className="encabezado-columna">Total pagado</p>
                  <p className="cifra mt-1.5 text-[22px] font-semibold tracking-tight text-tinta">
                    {formatear(egresos.data.totalCOP, 'COP')}
                  </p>
                  <ul className="mt-4 space-y-2 border-t border-borde-suave pt-4">
                    {egresos.data.porTipo.slice(0, 4).map((fila) => (
                      <li key={fila.tipo} className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] text-grafito">
                          {fila.tipo.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        <span className="cifra shrink-0 text-tinta">
                          {formatear(fila.totalCOP, 'COP')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {verAuditoria && <MovimientoReciente empresaId={empresaId} />}

            {/* El hueco que deja la etapa 6, dicho en vez de dibujado vacío. */}
            <section>
              <EncabezadoSeccion titulo="Obligaciones" descripcion="Vencimientos por cliente." />
              <div className="flex items-start gap-3 rounded-xl border border-borde bg-superficie px-4 py-3.5 shadow-tarjeta">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden />
                <p className="text-[12px] leading-relaxed text-grafito">
                  <strong className="font-semibold text-tinta">Calendario tributario</strong> —
                  llega en la etapa 6, con Contabilidad. Ahí también entra la facturación del mes.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
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
      <span className={cn('min-w-0', !exito && 'flex items-center gap-3')}>
        {!exito && <FileText className="size-4 shrink-0 text-tenue" aria-hidden />}
        <span>
          <span className="block text-[15px] font-semibold text-tinta">{titulo}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-grafito">{detalle}</span>
        </span>
      </span>
    </div>
  );
}
