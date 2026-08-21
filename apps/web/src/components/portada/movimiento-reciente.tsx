'use client';

import {
  ETIQUETA_ACCION_AUDIT,
  type RegistroAuditoria,
  type RespuestaPaginada,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { EncabezadoSeccion, Esqueleto } from '@/components/patrones';
import { peticion } from '@/lib/api/cliente';
import { formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * Quién hizo qué, últimamente.
 *
 * Es el equivalente honesto del «muro de noticias» de las intranets de referencia.
 * Nexo no tiene noticias de empresa, pero sí tiene algo que a este equipo le
 * importa más: el rastro de lo que se tocó. Sale del audit log, que ya existe y ya
 * es inmutable.
 *
 * Solo lee. Quien quiera investigar de verdad tiene la pantalla de auditoría, con
 * filtros y el valor anterior de cada cambio.
 */

/** Un punto de color por tipo de acción. Nunca es lo único que distingue: al lado
 *  siempre va la palabra («Creó», «Anuló»), por si alguien no distingue el color. */
const TONO_ACCION: Record<string, string> = {
  CREAR: 'bg-exito',
  ACTUALIZAR: 'bg-acento',
  ANULAR: 'bg-peligro',
  ELIMINAR: 'bg-peligro',
  INGRESAR: 'bg-tenue',
  SALIR: 'bg-tenue',
  INGRESO_FALLIDO: 'bg-alerta',
  EXPORTAR: 'bg-decorativo',
  CAMBIAR_EMPRESA: 'bg-tenue',
  LLAMADA_EXTERNA: 'bg-decorativo',
};

/** Nombres legibles. `Operacion` en pantalla se lee como un error de dedo. */
const NOMBRE_ENTIDAD: Record<string, string> = {
  Operacion: 'una operación',
  Dispersion: 'una dispersión',
  DispersionDestino: 'un giro',
  ReglaDispersion: 'una regla de dispersión',
  Destinatario: 'un destinatario',
  Cliente: 'un cliente',
  Usuario: 'un usuario',
  EmpresaAdministrada: 'una empresa',
};

export function MovimientoReciente({ empresaId }: { empresaId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['auditoria-reciente', empresaId],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<RespuestaPaginada<RegistroAuditoria>>('auditoria?porPagina=6&dir=desc', {
        empresaId,
      }),
  });

  const registros = useMemo(() => data?.datos ?? [], [data]);

  return (
    <section>
      <EncabezadoSeccion
        titulo="Movimiento reciente"
        descripcion="El rastro de lo que se tocó en esta empresa."
        tono="decorativo"
      />

      {isLoading ? (
        <Esqueleto className="h-[280px] rounded-xl" />
      ) : registros.length === 0 ? (
        <div className="rounded-xl border border-borde bg-superficie px-5 py-8 text-center shadow-tarjeta">
          <p className="text-[14px] font-semibold text-tinta">Sin movimiento todavía</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[13px] leading-relaxed text-grafito">
            Cada cambio que haga el equipo queda registrado aquí y no se puede borrar.
          </p>
        </div>
      ) : (
        <ol className="rounded-xl border border-borde bg-superficie px-5 py-2 shadow-tarjeta">
          {registros.map((registro, indice) => (
            <li
              key={registro.id}
              className={cn(
                'flex items-start gap-3 py-3',
                indice < registros.length - 1 && 'border-b border-borde-suave',
              )}
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  TONO_ACCION[registro.accion] ?? 'bg-tenue',
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-snug text-tinta">
                  <strong className="font-semibold">
                    {registro.usuario?.nombre ?? 'El sistema'}
                  </strong>{' '}
                  <span className="text-grafito">
                    {ETIQUETA_ACCION_AUDIT[registro.accion].toLowerCase()}{' '}
                    {NOMBRE_ENTIDAD[registro.entidad] ?? registro.entidad}
                  </span>
                </span>
                <span className="mt-0.5 block text-[12px] text-tenue">
                  {formatearFechaHora(registro.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
