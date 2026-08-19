import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botón.
 *
 * El dorado aparece solo en la variante primaria, que es una por pantalla. Todo lo
 * demás es blanco con borde de un pixel: en una interfaz que se usa ocho horas al
 * día, el color tiene que significar algo (brief §7).
 */
const variantes = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[4px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variante: {
        primario: 'bg-[--color-dorado] text-white hover:bg-[#ad8125]',
        secundario:
          'border border-[--color-borde] bg-white text-[--color-texto] hover:bg-[--color-superficie-alt]',
        fantasma:
          'text-[--color-texto-suave] hover:bg-[--color-superficie-alt] hover:text-[--color-texto]',
        peligro: 'bg-[--color-peligro] text-white hover:bg-[#9c1717]',
      },
      tamano: {
        normal: 'h-8 px-3',
        pequeno: 'h-7 px-2 text-[12px]',
        grande: 'h-10 px-4 text-[14px]',
        icono: 'h-8 w-8',
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
