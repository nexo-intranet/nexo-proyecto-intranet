'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

export const Etiqueta = forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('etiqueta', className)} {...props} />
));
Etiqueta.displayName = 'Etiqueta';

/**
 * Los campos van **hundidos**: fondo un punto más oscuro que su entorno.
 *
 * Es la señal de "aquí se escribe" sin recurrir a un borde grueso. Un campo más
 * claro que su superficie parece una tarjeta; uno más oscuro parece un hueco que
 * recibe contenido.
 */
const claseCampo = [
  'h-9 w-full rounded-sm border border-borde bg-campo px-2.5 text-[13px] text-tinta',
  'transition-[border-color,background-color,box-shadow] duration-100',
  'placeholder:text-tenue',
  'hover:border-borde-fuerte',
  'focus:border-acento focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-acento/15',
  'disabled:cursor-not-allowed disabled:bg-borde-suave disabled:text-tenue',
  'aria-[invalid=true]:border-peligro aria-[invalid=true]:ring-peligro/15',
].join(' ');

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(claseCampo, className)} {...props} />
  ),
);
Entrada.displayName = 'Entrada';

/**
 * `select` nativo, estilado hasta donde el navegador deja.
 *
 * La lista desplegable la dibuja el sistema operativo y no se puede tocar. Se
 * acepta a propósito: para un catálogo corto —un tipo de contribuyente, un rol—
 * el control nativo es más rápido con teclado que cualquier reimplementación.
 */
export const Seleccion = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(claseCampo, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  ),
);
Seleccion.displayName = 'Seleccion';

interface PropsCampo {
  etiqueta: string;
  htmlFor: string;
  /** Mensaje de error del servidor o del esquema Zod. */
  error?: string;
  ayuda?: string;
  /** Marca visible cuando el campo es obligatorio. */
  obligatorio?: boolean;
  children: ReactNode;
}

/**
 * Campo de formulario con su etiqueta, ayuda y error.
 *
 * El error se anuncia con `role="alert"`: la interfaz tiene que ser operable con
 * teclado y lector de pantalla (brief §9).
 */
export function Campo({ etiqueta, htmlFor, error, ayuda, obligatorio, children }: PropsCampo) {
  return (
    <div className="space-y-1.5">
      <Etiqueta htmlFor={htmlFor}>
        {etiqueta}
        {obligatorio && (
          <span className="ml-1 text-tenue" aria-hidden>
            *
          </span>
        )}
      </Etiqueta>

      {children}

      {ayuda && !error && <p className="text-[12px] leading-snug text-tenue">{ayuda}</p>}
      {error && (
        <p role="alert" className="text-[12px] leading-snug text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
