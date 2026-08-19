import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
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
      <body>
        <Proveedores>{children}</Proveedores>
        <Toaster position="bottom-right" closeButton richColors />
      </body>
    </html>
  );
}
