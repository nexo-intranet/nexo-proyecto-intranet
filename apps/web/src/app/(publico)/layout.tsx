/**
 * Pantallas sin sesión.
 *
 * Es lo primero que ve alguien del equipo cada mañana, y lo único que ve quien
 * todavía no entró. Sobria y centrada: aquí no hay nada que navegar, solo una
 * cosa que hacer.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-superficie-alt">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-tinta text-[17px] font-semibold text-white">
              N
            </span>
            <div className="text-center">
              <p className="text-[15px] font-semibold tracking-[0.16em] text-tinta">NEXO</p>
              <p className="mt-0.5 text-[12px] text-tenue">Administración Integral</p>
            </div>
          </div>

          <div className="rounded-lg border border-borde bg-superficie p-7 shadow-flotante">
            {children}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-tenue">
            Sistema interno. El acceso queda registrado.
          </p>
        </div>
      </div>
    </div>
  );
}
