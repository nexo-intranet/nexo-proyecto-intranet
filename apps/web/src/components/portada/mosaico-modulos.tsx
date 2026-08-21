'use client';

import { ETIQUETA_MODULO, RUTA_MODULO, type ModuloSistema } from '@nexo/shared';
import {
  Building2,
  FileSignature,
  FileText,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

/**
 * Los módulos, en mosaico.
 *
 * Es la pieza que se traduce sola de la referencia: ahí son ocho iconos de acceso
 * rápido, y aquí son los módulos del brief. Cada quien ve solo los suyos —los
 * permisos los decide el backend—, así que el mosaico no siempre tiene ocho.
 */

const ICONO: Record<ModuloSistema, typeof Wallet> = {
  OPERACIONES: Wallet,
  EGRESOS: Receipt,
  EMPLEADOS: Users,
  CONTABILIDAD: FileText,
  CUMPLIMIENTO: ShieldCheck,
  CLIENTES: Building2,
  ADMINISTRACION: SlidersHorizontal,
};

/** Etapa 9. Hasta que exista, no aparece: un módulo que no abre nada frustra. */
export const ICONO_TRAMITES = FileSignature;

export function MosaicoModulos({ modulos }: { modulos: ModuloSistema[] }) {
  if (modulos.length === 0) return null;

  return (
    <ul className="relative flex flex-wrap gap-2.5">
      {modulos.map((modulo) => {
        const Icono = ICONO[modulo];

        return (
          <li key={modulo}>
            <Link
              href={RUTA_MODULO[modulo]}
              className="group flex w-[96px] flex-col items-center gap-2 rounded-xl border border-borde bg-superficie/85 px-2 py-3.5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-acento-borde hover:bg-superficie hover:shadow-flotante"
            >
              <span className="grid size-11 place-items-center rounded-lg border border-borde bg-superficie-alt text-acento transition-colors group-hover:border-acento-borde group-hover:bg-acento-suave">
                <Icono className="size-[18px]" strokeWidth={1.6} aria-hidden />
              </span>
              <span className="text-center text-[12px] font-semibold leading-tight text-tinta">
                {ETIQUETA_MODULO[modulo]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
