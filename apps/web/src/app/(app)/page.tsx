'use client';

import { ETIQUETA_MODULO, RUTA_MODULO } from '@nexo/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoPagina } from '@/components/patrones';
import { useEmpresa } from '@/lib/empresa';
import { modulosVisibles, useSesion } from '@/lib/sesion';

export default function PaginaInicio() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();

  const empresa = sesion?.empresas.find((candidata) => candidata.id === empresaId);
  const modulos = modulosVisibles(sesion).filter((modulo) => modulo !== 'ADMINISTRACION');

  return (
    <>
      <EncabezadoPagina
        titulo={`Hola, ${sesion?.usuario.nombre.split(' ')[0] ?? ''}`}
        descripcion={
          empresa
            ? `Estás trabajando en ${empresa.nombre}.`
            : 'Selecciona una empresa en la barra superior para empezar.'
        }
      />

      <div className="p-6">
        {modulos.length === 0 ? (
          <p className="text-[13px] text-[--color-texto-suave]">
            Todavía no tienes módulos asignados. Pídele a un administrador que te dé acceso.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modulos.map((modulo) => (
              <li key={modulo}>
                <Link
                  href={RUTA_MODULO[modulo]}
                  className="group flex items-center justify-between rounded-[6px] border border-[--color-borde] bg-white px-4 py-3.5 transition-colors hover:border-[--color-dorado]"
                >
                  <span className="text-[14px] font-medium">{ETIQUETA_MODULO[modulo]}</span>
                  <ArrowRight
                    className="size-4 text-[--color-texto-suave] transition-colors group-hover:text-[--color-dorado]"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
