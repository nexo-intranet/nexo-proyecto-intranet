'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorDeApi } from '@/lib/api/cliente';
import { ProveedorEmpresa } from '@/lib/empresa';

export function Proveedores({ children }: { children: React.ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (intentos, error) => {
              // Reintentar un 403 o un 404 no cambia el resultado y solo agrega ruido.
              if (error instanceof ErrorDeApi && error.estado < 500) return false;
              return intentos < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={cliente}>
      <ProveedorEmpresa>{children}</ProveedorEmpresa>
    </QueryClientProvider>
  );
}
