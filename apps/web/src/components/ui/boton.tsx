import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botón.
 *
 * El azul aparece **solo** en la variante primaria, que es una por pantalla. Todo
 * lo demás es blanco con borde de un pixel. En una herramienta que se mira ocho
 * horas al día, si todo grita no se oye nada: el color señala cuál es la acción
 * principal, no decora.
 *
 * Cada variante define sus cinco estados —reposo, hover, presionado, foco y
 * deshabilitado—. Un botón que solo cambia al pasar el mouse se siente muerto, y
 * uno sin foco visible es inoperable con teclado.
 */
const variantes = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm',
    'text-[13px] font-medium leading-none',
    'transition-[background-color,border-color,color] duration-100',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:size-[15px] [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variante: {
        primario: 'bg-acento text-white hover:bg-acento-fuerte active:bg-acento-fuerte',
        secundario: [
          'border border-borde bg-superficie text-tinta',
          'hover:border-borde-fuerte hover:bg-superficie-alt',
          'active:bg-borde-suave',
        ].join(' '),
        fantasma: 'text-grafito hover:bg-superficie-alt hover:text-tinta active:bg-borde-suave',
        peligro: 'bg-peligro text-white hover:bg-[#991b1b] active:bg-[#7f1d1d]',
        /** Acción destructiva secundaria: se lee el riesgo sin dominar la pantalla. */
        peligroSuave: [
          'border border-peligro-borde bg-peligro-suave text-peligro',
          'hover:bg-[#fee2e2]',
        ].join(' '),
      },
      tamano: {
        normal: 'h-8 px-3',
        pequeno: 'h-7 px-2.5 text-[12px]',
        grande: 'h-10 px-4 text-[14px]',
        icono: 'h-8 w-8',
        iconoPequeno: 'h-7 w-7',
      },
    },
    defaultVariants: { variante: 'secundario', tamano: 'normal' },
  },
);

export interface PropsBoton
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variantes> {
  comoHijo?: boolean;
}

export const Boton = forwardRef<HTMLButtonElement, PropsBoton>(
  ({ className, variante, tamano, comoHijo = false, ...props }, ref) => {
    const Componente = comoHijo ? Slot : 'button';
    return (
      <Componente ref={ref} className={cn(variantes({ variante, tamano }), className)} {...props} />
    );
  },
);
Boton.displayName = 'Boton';
