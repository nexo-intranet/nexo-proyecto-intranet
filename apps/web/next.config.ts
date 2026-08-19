import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // @nexo/shared se compila a CommonJS y se consume desde el servidor y el cliente.
  transpilePackages: ['@nexo/shared'],
  // El navegador solo habla con este origen; la URL real del API nunca sale al
  // cliente. Ver docs/SEGURIDAD.md §3.2.
  async headers() {
    return [
      {
        source: '/:ruta*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
