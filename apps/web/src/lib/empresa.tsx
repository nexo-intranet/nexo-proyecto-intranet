'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Empresa activa.
 *
 * Se guarda solo el id, y solo como preferencia de interfaz: el permiso real lo
 * verifica el backend en cada petición contra `UsuarioEmpresa`. Cambiar este valor
 * a mano en el navegador no da acceso a nada.
 */

const CLAVE = 'nexo.empresaActiva';

interface ContextoEmpresa {
  empresaId: string | null;
  cambiarEmpresa: (id: string) => void;
  listo: boolean;
}

const Contexto = createContext<ContextoEmpresa | null>(null);

export function ProveedorEmpresa({ children }: { children: React.ReactNode }) {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const clienteConsultas = useQueryClient();

  useEffect(() => {
    setEmpresaId(window.localStorage.getItem(CLAVE));
    setListo(true);
  }, []);

  const cambiarEmpresa = useCallback(
    (id: string) => {
      window.localStorage.setItem(CLAVE, id);
      setEmpresaId(id);
      // Todo lo que haya en caché pertenece a la empresa anterior. Mostrarlo un
      // instante bajo el nombre de la nueva sería una fuga visual.
      void clienteConsultas.invalidateQueries();
      clienteConsultas.clear();
    },
    [clienteConsultas],
  );

  return (
    <Contexto.Provider value={{ empresaId, cambiarEmpresa, listo }}>{children}</Contexto.Provider>
  );
}

export function useEmpresa(): ContextoEmpresa {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useEmpresa debe usarse dentro de ProveedorEmpresa');
  return contexto;
}
