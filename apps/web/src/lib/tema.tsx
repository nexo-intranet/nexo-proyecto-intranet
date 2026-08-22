'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Tema claro y oscuro.
 *
 * Tres estados, no dos: claro, oscuro y **seguir al sistema**. El tercero importa —
 * quien tiene el portátil en oscuro de noche y en claro de día espera que la
 * aplicación lo acompañe sin tener que tocarla.
 *
 * La elección vive en `localStorage` y se aplica con `data-theme` en `<html>`. El
 * CSS hace el resto: sin atributo manda `prefers-color-scheme`, con atributo manda
 * el atributo.
 */

export type Tema = 'claro' | 'oscuro' | 'sistema';

export const CLAVE_TEMA = 'nexo-tema';

/**
 * El script que corre antes del primer pintado.
 *
 * Sin esto la página aparece en claro y salta a oscuro un instante después, porque
 * React todavía no ha montado nada. Va en el `<head>` como script síncrono: es de
 * los pocos sitios donde bloquear el render es exactamente lo que se quiere.
 *
 * El `try` no sobra: en una ventana privada con las cookies bloqueadas,
 * `localStorage` lanza al leerlo, y una excepción aquí dejaría la página en blanco.
 */
export const SCRIPT_TEMA = `
(function () {
  try {
    var elegido = localStorage.getItem('${CLAVE_TEMA}');
    if (elegido === 'claro' || elegido === 'oscuro') {
      document.documentElement.setAttribute('data-theme', elegido);
    }
  } catch (e) {}
})();
`;

interface ContextoTema {
  tema: Tema;
  /** Lo que se está viendo ahora mismo, ya resuelto el «sistema». */
  efectivo: 'claro' | 'oscuro';
  cambiar: (tema: Tema) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

function preferenciaDelSistema(): 'claro' | 'oscuro' {
  if (typeof window === 'undefined') return 'claro';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  // Arranca en «sistema» y se corrige en el efecto. Leer localStorage aquí haría
  // que el servidor y el cliente rindieran cosas distintas.
  const [tema, setTema] = useState<Tema>('sistema');
  const [sistema, setSistema] = useState<'claro' | 'oscuro'>('claro');

  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CLAVE_TEMA);
    } catch {
      // Ventana privada con almacenamiento bloqueado: se sigue al sistema.
    }

    if (guardado === 'claro' || guardado === 'oscuro') setTema(guardado);
    setSistema(preferenciaDelSistema());
  }, []);

  // Si el sistema cambia mientras la pestaña está abierta —y no hay elección
  // explícita—, la aplicación acompaña.
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => setSistema(consulta.matches ? 'oscuro' : 'claro');

    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  const cambiar = useCallback((nuevo: Tema) => {
    setTema(nuevo);

    try {
      if (nuevo === 'sistema') localStorage.removeItem(CLAVE_TEMA);
      else localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento el cambio vale para esta sesión y ya.
    }

    if (nuevo === 'sistema') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', nuevo);
  }, []);

  const efectivo = tema === 'sistema' ? sistema : tema;

  return <Contexto.Provider value={{ tema, efectivo, cambiar }}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useTema necesita estar dentro de ProveedorTema');
  return contexto;
}
