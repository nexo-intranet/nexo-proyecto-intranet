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
    <div className="shrink-0 border-b border-borde bg-superficie">
      {/* Mismo ancho que el encabezado de la aplicación: sin barra lateral, lo que
          alinea las pantallas entre sí es el contenedor, no el borde de la ventana. */}
      <div className="mx-auto flex max-w-[1240px] items-start justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate">{titulo}</h1>
          {descripcion && <p className="text-[13px] leading-snug text-grafito">{descripcion}</p>}
        </div>
        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </div>
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
  icono,
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      {icono && (
        <div className="grid size-10 place-items-center rounded-md border border-borde bg-superficie-alt text-tenue">
          {icono}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-tinta">{titulo}</p>
        <p className="mx-auto max-w-[380px] text-[13px] leading-relaxed text-grafito">
          {descripcion}
        </p>
      </div>
      {accion && <div className="pt-1">{accion}</div>}
    </div>
  );
}

/** Bloque de carga. Nunca un spinner a pantalla completa (brief §7). */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-superficie-alt', className)} />;
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
      className="m-6 rounded-md border border-peligro-borde bg-peligro-suave px-4 py-5 text-center"
    >
      <p className="text-[13px] text-tinta">{mensaje}</p>
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-2 text-[13px] font-medium text-acento underline-offset-2 hover:underline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

const TONOS = {
  neutro: 'border-borde bg-superficie-alt text-grafito',
  acento: 'border-acento-borde bg-acento-suave text-acento-fuerte',
  exito: 'border-exito-borde bg-exito-suave text-exito',
  alerta: 'border-alerta-borde bg-alerta-suave text-alerta',
  peligro: 'border-peligro-borde bg-peligro-suave text-peligro',
} as const;

/** Distintivo de estado. El color comunica, no decora. */
export function Distintivo({
  children,
  tono = 'neutro',
  punto = false,
}: {
  children: ReactNode;
  tono?: keyof typeof TONOS;
  /** Punto de color a la izquierda, para estados de un flujo. */
  punto?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px]',
        'text-[11px] font-medium leading-none',
        TONOS[tono],
      )}
    >
      {punto && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Indicador de cuadre.
 *
 * Esta es la pieza que distingue a esta aplicación de cualquier panel de
 * administración: cuando una suma **debe** dar exacto —una dispersión repartida
 * entre destinos—, el cuadre no es un mensaje de error que aparece al fallar. Es
 * un estado permanente del dato, visible siempre, con la diferencia al centavo.
 *
 * Quien está armando el reparto necesita el número para corregirlo, no un regaño.
 */
export function Cuadre({
  cuadra,
  detalle,
}: {
  cuadra: boolean;
  /** «Faltan 100.000,00 por asignar» o el total cuando ya cuadra. */
  detalle: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-between gap-3 rounded-sm border px-3 py-2',
        cuadra ? 'border-exito-borde bg-exito-suave' : 'border-alerta-borde bg-alerta-suave',
      )}
    >
      <span className={cn('text-[12px] font-medium', cuadra ? 'text-exito' : 'text-alerta')}>
        {cuadra ? 'La dispersión cuadra' : 'La dispersión no cuadra'}
      </span>
      <span className={cn('cifra', cuadra ? 'text-exito' : 'text-alerta')}>{detalle}</span>
    </div>
  );
}

/**
 * Encabezado de sección de la portada.
 *
 * La barra de color al lado del título es el gesto que más se repite en la
 * referencia, y hace un trabajo real: separa secciones sin necesidad de una línea
 * divisoria a todo lo ancho, y el color dice de qué tipo es la sección antes de
 * que alguien lea el título. Coral significa que algo está esperando.
 */
export function EncabezadoSeccion({
  titulo,
  descripcion,
  tono = 'acento',
  accion,
}: {
  titulo: string;
  descripcion?: string;
  tono?: 'acento' | 'peligro' | 'decorativo';
  accion?: ReactNode;
}) {
  const barra = {
    acento: 'bg-acento',
    peligro: 'bg-peligro',
    decorativo: 'bg-decorativo',
  }[tono];

  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-stretch gap-3">
        <span className={cn('w-1 shrink-0 rounded-pill', barra)} aria-hidden />
        <div className="min-w-0">
          <h2 className="titulo-seccion">{titulo}</h2>
          {descripcion && (
            <p className="mt-1 text-[13px] leading-snug text-grafito">{descripcion}</p>
          )}
        </div>
      </div>
      {accion && <div className="shrink-0 pb-1">{accion}</div>}
    </div>
  );
}
