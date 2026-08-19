'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Etiqueta = forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-[13px] font-medium text-[--color-texto]', className)}
    {...props}
  />
));
Etiqueta.displayName = 'Etiqueta';

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[4px] border border-[--color-borde] bg-white px-3 text-[14px]',
        'placeholder:text-[--color-texto-suave]',
        'focus:border-[--color-dorado] focus:outline-none focus:ring-1 focus:ring-[--color-dorado]',
        'disabled:bg-[--color-superficie-alt] disabled:text-[--color-texto-suave]',
        className,
      )}
      {...props}
    />
  ),
);
Entrada.displayName = 'Entrada';

interface PropsCampo {
  etiqueta: string;
  htmlFor: string;
  /** Mensaje de error del servidor o del esquema Zod. */
  error?: string;
  ayuda?: string;
  children: ReactNode;
}

/**
 * Campo de formulario con su etiqueta, ayuda y error.
 *
 * El error se anuncia con `role="alert"` y el campo queda asociado por `aria-describedby`:
 * la interfaz tiene que ser operable con teclado y lector de pantalla (brief §9).
 */
export function Campo({ etiqueta, htmlFor, error, ayuda, children }: PropsCampo) {
  return (
    <div className="space-y-1.5">
      <Etiqueta htmlFor={htmlFor}>{etiqueta}</Etiqueta>
      {children}
      {ayuda && !error && <p className="text-[12px] text-[--color-texto-suave]">{ayuda}</p>}
      {error && (
        <p role="alert" className="text-[12px] text-[--color-peligro]">
          {error}
        </p>
      )}
    </div>
  );
}
