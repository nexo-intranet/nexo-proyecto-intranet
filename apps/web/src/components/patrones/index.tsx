import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Encabezado de página: título a la izquierda, acción primaria a la derecha. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[--color-borde] px-6 py-4">
      <div className="space-y-0.5">
        <h1>{titulo}</h1>
        {descripcion && <p className="text-[13px] text-[--color-texto-suave]">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  );
}

/**
 * Estado vacío.
 *
 * Dice qué hacer y trae el botón de la acción. Nada de ilustraciones decorativas:
 * quien llega aquí necesita saber cuál es el siguiente paso (brief §7).
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-[15px] font-medium">{titulo}</p>
      <p className="max-w-[420px] text-[13px] text-[--color-texto-suave]">{descripcion}</p>
      {accion}
    </div>
  );
}

/** Bloque de carga. Nunca un spinner a pantalla completa (brief §7). */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-[4px] bg-[--color-superficie-alt]', className)} />
  );
}

/** Aviso de error con la acción de reintentar. */
export function EstadoError({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar?: () => void;
}) {
  return (
    <div
      role="alert"
      className="m-6 rounded-[6px] border border-[--color-borde] bg-[--color-superficie-alt] px-4 py-6 text-center"
    >
      <p className="text-[13px] text-[--color-texto]">{mensaje}</p>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-2 text-[13px] font-medium text-[--color-dorado] underline-offset-2 hover:underline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Distintivo de estado. El color comunica, no decora. */
export function Distintivo({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'exito' | 'alerta' | 'peligro';
}) {
  const tonos = {
    neutro: 'border-[--color-borde] bg-[--color-superficie-alt] text-[--color-texto-suave]',
    exito: 'border-[#bbf7d0] bg-[#f0fdf4] text-[--color-exito]',
    alerta: 'border-[#fed7aa] bg-[#fffbeb] text-[--color-alerta]',
    peligro: 'border-[#fecaca] bg-[#fef2f2] text-[--color-peligro]',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[11px] font-medium',
        tonos[tono],
      )}
    >
      {children}
    </span>
  );
}
