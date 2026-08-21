import { cn } from '@/lib/utils';

/**
 * Las formas de la portada.
 *
 * Círculos suaves, tramas de puntos y curvas. Es lo que la referencia pone detrás
 * de la foto, y es lo que Nexo usa **en vez** de la foto: una imagen de banco en
 * una herramienta que usan diez personas internas se ve prestada.
 *
 * La composición es simétrica porque el contenido va centrado. Con el héroe
 * alineado a la izquierda funcionaba una diagonal; centrado, una diagonal deja la
 * página visualmente escorada.
 *
 * Todo esto es `aria-hidden` y `pointer-events-none`. No es contenido, no se toca,
 * y a un lector de pantalla no le interesa. Va en `decorativo`, el único color del
 * sistema que no significa nada.
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
        opacity: 0.28,
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

export function FondoPortada() {
  return (
    <>
      {/* Dos círculos grandes, uno por lado, mordidos por el borde. Cortados por el
          marco se leen como parte de algo más grande; centrados, como un adorno. */}
      <Circulo
        className="-left-32 -top-40 size-[440px] bg-decorativo-suave blur-[1px]"
        opacidad={0.85}
      />
      <Circulo
        className="-right-40 -top-28 size-[380px] bg-decorativo-suave blur-[1px]"
        opacidad={0.6}
      />

      {/* El que se asoma detrás del mosaico de módulos, como en la referencia. */}
      <Circulo
        className="bottom-[-180px] left-1/2 size-[420px] -translate-x-1/2 bg-decorativo blur-[1px]"
        opacidad={0.13}
      />

      <Puntos className="bottom-20 left-6 h-24 w-28 lg:left-14" />
      <Puntos className="right-6 top-16 h-24 w-28 lg:right-14" />

      {/* Curvas a lado y lado, en espejo. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full text-decorativo"
        viewBox="0 0 1440 620"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M-60 -40 C 260 120, 300 420, 180 660"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.22"
        />
        <path
          d="M1500 -40 C 1180 120, 1140 420, 1260 660"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.22"
        />
      </svg>

      {/* Vela de fondo: separa el héroe del resto de la página sin una línea dura. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 0%, rgb(124 131 232 / 0.14) 0%, transparent 62%)',
        }}
      />
    </>
  );
}
