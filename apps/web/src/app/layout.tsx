import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { SCRIPT_TEMA } from '@/lib/tema';
import { Proveedores } from './proveedores';
import './globals.css';

/**
 * Inter para la interfaz: aquí la neutralidad es correcta, la fuente no debe
 * competir con los datos. JetBrains Mono para cifras y hashes, con dígitos de
 * ancho fijo para que las columnas de dinero queden alineadas (brief §7).
 *
 * Cormorant Garamond queda reservada para los PDF generados, que es donde el
 * cliente ve la marca.
 */
const interfaz = Inter({
  subsets: ['latin'],
  variable: '--fuente-interfaz',
  display: 'swap',
});

const monoespaciada = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--fuente-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nexo Administración Integral',
  description: 'Intranet de uso interno',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RaizLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${interfaz.variable} ${monoespaciada.variable}`}>
      <head>
        {/* Antes del primer pintado: sin esto la página aparece en claro y salta a
            oscuro cuando React monta. Es de los pocos sitios donde bloquear el
            render es exactamente lo que se quiere. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
        <Toaster position="bottom-right" closeButton richColors />
      </body>
    </html>
  );
}
