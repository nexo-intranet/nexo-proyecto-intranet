/**
 * Pantallas sin sesión. Blanco, centrado y sin barra lateral: aquí no hay nada
 * que navegar todavía.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-superficie-alt] px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <span className="text-[18px] font-semibold tracking-[0.12em] text-[--color-texto]">
            NEXO
          </span>
          <p className="mt-1 text-[12px] text-[--color-texto-suave]">Administración Integral</p>
        </div>
        <div className="rounded-[6px] border border-[--color-borde] bg-white p-6">{children}</div>
      </div>
    </div>
  );
}
