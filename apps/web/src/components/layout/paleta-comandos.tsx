'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { SesionActual } from '@nexo/shared';
import { ETIQUETA_MODULO, RUTA_MODULO } from '@nexo/shared';
import { CornerDownLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useEmpresa } from '@/lib/empresa';
import { modulosVisibles } from '@/lib/sesion';
import { cn } from '@/lib/utils';

interface Resultado {
  id: string;
  titulo: string;
  detalle?: string;
  grupo: string;
  ejecutar: () => void;
}

/**
 * Búsqueda global (⌘K / Ctrl+K).
 *
 * En esta etapa navega entre módulos y cambia de empresa. **El gancho importante
 * es el hash**: el brief lo describe como la función que más van a usar —pegar un
 * hash de transacción y caer en la operación—, y la Etapa 2 lo conecta aquí sin
 * tocar este componente, agregando una fuente de resultados.
 */
export function PaletaComandos({
  sesion,
  abierto,
  onCambiarAbierto,
}: {
  sesion: SesionActual | undefined;
  abierto: boolean;
  onCambiarAbierto: (abierto: boolean) => void;
}) {
  const router = useRouter();
  const { cambiarEmpresa } = useEmpresa();
  const [consulta, setConsulta] = useState('');
  const [seleccionado, setSeleccionado] = useState(0);

  const resultados = useMemo<Resultado[]>(() => {
    const texto = consulta.trim().toLowerCase();

    const modulos: Resultado[] = modulosVisibles(sesion).map((modulo) => ({
      id: `modulo-${modulo}`,
      titulo: ETIQUETA_MODULO[modulo],
      grupo: 'Ir a',
      ejecutar: () => router.push(RUTA_MODULO[modulo]),
    }));

    const empresas: Resultado[] = (sesion?.empresas ?? []).map((empresa) => ({
      id: `empresa-${empresa.id}`,
      titulo: empresa.nombre,
      detalle: `${empresa.nit}-${empresa.digitoVerificacion}`,
      grupo: 'Cambiar de empresa',
      ejecutar: () => cambiarEmpresa(empresa.id),
    }));

    const todos = [...modulos, ...empresas];
    if (!texto) return todos;

    return todos.filter(
      (resultado) =>
        resultado.titulo.toLowerCase().includes(texto) ||
        resultado.detalle?.toLowerCase().includes(texto),
    );
  }, [consulta, sesion, router, cambiarEmpresa]);

  const cerrar = () => {
    onCambiarAbierto(false);
    setConsulta('');
    setSeleccionado(0);
  };

  const ejecutar = (resultado: Resultado | undefined) => {
    if (!resultado) return;
    resultado.ejecutar();
    cerrar();
  };

  const grupos = [...new Set(resultados.map((resultado) => resultado.grupo))];

  return (
    <Dialog.Root
      open={abierto}
      onOpenChange={(valor) => (valor ? onCambiarAbierto(true) : cerrar())}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <Dialog.Content
          className="fixed left-1/2 top-[15%] z-50 w-full max-w-[560px] -translate-x-1/2 rounded-[6px] border border-borde bg-white shadow-[0_12px_32px_rgba(0,0,0,0.10)]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Búsqueda global</Dialog.Title>

          <div className="flex items-center gap-2 border-b border-borde px-3">
            <Search className="size-4 text-grafito" aria-hidden />
            <input
              autoFocus
              value={consulta}
              onChange={(evento) => {
                setConsulta(evento.target.value);
                setSeleccionado(0);
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'ArrowDown') {
                  evento.preventDefault();
                  setSeleccionado((indice) => Math.min(indice + 1, resultados.length - 1));
                }
                if (evento.key === 'ArrowUp') {
                  evento.preventDefault();
                  setSeleccionado((indice) => Math.max(indice - 1, 0));
                }
                if (evento.key === 'Enter') {
                  evento.preventDefault();
                  ejecutar(resultados[seleccionado]);
                }
              }}
              placeholder="Busca un módulo, una empresa o pega un hash…"
              className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-grafito"
            />
          </div>

          <div className="max-h-[320px] overflow-auto p-1.5">
            {resultados.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[13px] text-grafito">
                Sin resultados para «{consulta}».
              </p>
            ) : (
              grupos.map((grupo) => (
                <div key={grupo} className="mb-1">
                  <p className="encabezado-columna px-2.5 py-1.5">{grupo}</p>
                  {resultados
                    .filter((resultado) => resultado.grupo === grupo)
                    .map((resultado) => {
                      const indice = resultados.indexOf(resultado);
                      const activo = indice === seleccionado;
                      return (
                        <button
                          key={resultado.id}
                          type="button"
                          onMouseEnter={() => setSeleccionado(indice)}
                          onClick={() => ejecutar(resultado)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-[4px] px-2.5 py-1.5 text-left text-[13px]',
                            activo ? 'bg-acento-suave' : 'hover:bg-superficie-alt',
                          )}
                        >
                          <span className="truncate">{resultado.titulo}</span>
                          {resultado.detalle && (
                            <span className="cifra shrink-0 text-[11px] text-grafito">
                              {resultado.detalle}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-borde px-3 py-2 text-[11px] text-grafito">
            <span className="flex items-center gap-1">
              <CornerDownLeft className="size-3" aria-hidden /> abrir
            </span>
            <span>↑ ↓ moverse</span>
            <span>Esc cerrar</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
