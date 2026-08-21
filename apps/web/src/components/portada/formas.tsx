import { cn } from '@/lib/utils';

/**
 * Las formas de la portada.
 *
 * Círculos suaves, tramas de puntos y una curva. Es lo que la referencia pone
 * detrás de la foto, y es lo que Nexo usa **en vez** de la foto: una imagen de
 * banco en una herramienta que usan diez personas internas se ve prestada.
 *
 * Todo esto es `aria-hidden` y `pointer-events-none`. No es contenido, no se
 * puede tocar, y a un lector de pantalla no le interesa. Va en `decorativo`,
 * el único color del sistema que no significa nada.
 */

/** Trama de puntos. Gradiente repetido, que pesa menos que un SVG con 200 círculos. */
export function Puntos({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--color-decorativo) 1.4px, transparent 1.4px)',
        backgroundSize: '13px 13px',
        opacity: 0.32,
      }}
    />
  );
}

/** Círculo suave. El desenfoque evita el borde duro que delata la forma geométrica. */
function Circulo({ className, opacidad = 0.5 }: { className?: string; opacidad?: number }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute rounded-full', className)}
      style={{ opacity: opacidad }}
    />
  );
}

/**
 * Composición de fondo del héroe.
 *
 * Se recorta contra su contenedor (`overflow-hidden` allá) para que los círculos
 * puedan salirse del borde: una forma cortada por el marco se lee como parte de
 * algo más grande, y una centrada se lee como un adorno.
 */
export function FondoPortada() {
  return (
    <>
      {/* Círculo grande arriba a la izquierda, mordido por el borde. */}
      <Circulo
        className="-left-24 -top-28 size-[380px] bg-decorativo-suave blur-[2px]"
        opacidad={0.9}
      />

      {/* El que se asoma detrás del mosaico de módulos, como en la referencia. */}
      <Circulo
        className="bottom-[-140px] left-[38%] size-[300px] bg-decorativo blur-[1px]"
        opacidad={0.16}
      />

      {/* Acento pequeño y sólido: le da un punto de foco a la composición. */}
      <Circulo className="left-[46%] top-[52%] size-7 bg-decorativo" opacidad={0.55} />

      <Puntos className="bottom-16 left-8 h-24 w-28" />
      <Puntos className="right-10 top-10 h-20 w-24" />

      {/* La curva. Arranca fuera del marco por arriba y sale por la derecha. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-10 top-0 h-full w-[62%] text-decorativo"
        viewBox="0 0 600 460"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M-40 -60 C 220 40, 470 130, 520 300 C 548 396, 470 452, 360 470"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <path
          d="M120 -80 C 340 60, 560 170, 596 340"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.2"
        />
        <circle cx="360" cy="470" r="7" fill="currentColor" opacity="0.5" />
      </svg>

      {/* Vela de fondo: el degradado que separa el héroe del resto de la página. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 78% 18%, rgb(124 131 232 / 0.13) 0%, transparent 58%)',
        }}
      />
    </>
  );
}
