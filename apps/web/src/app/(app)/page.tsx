'use client';

import { ETIQUETA_MODULO, RUTA_MODULO, type ModuloSistema } from '@nexo/shared';
import { ArrowRight, Building2, FileText, Receipt, ShieldCheck, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { EncabezadoPagina } from '@/components/patrones';
import { useEmpresa } from '@/lib/empresa';
import { modulosVisibles, useSesion } from '@/lib/sesion';

const ICONO: Partial<Record<ModuloSistema, typeof Wallet>> = {
  OPERACIONES: Wallet,
  EGRESOS: Receipt,
  EMPLEADOS: Users,
  CONTABILIDAD: FileText,
  CUMPLIMIENTO: ShieldCheck,
  CLIENTES: Building2,
};

/** Qué resuelve cada módulo, en una línea. Un nombre suelto no orienta a nadie. */
const QUE_HACE: Partial<Record<ModuloSistema, string>> = {
  OPERACIONES: 'Registro por hash, ganancia y dispersión',
  EGRESOS: 'Pagos por intangibles y órdenes de pago',
  EMPLEADOS: 'Nómina documental y cartas laborales',
  CONTABILIDAD: 'Facturación, gastos y calendario tributario',
  CUMPLIMIENTO: 'Verificaciones, políticas y reportes UIAF',
  CLIENTES: 'Portafolio e historial de operaciones',
};

export default function PaginaInicio() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();

  const empresa = sesion?.empresas.find((candidata) => candidata.id === empresaId);
  const modulos = modulosVisibles(sesion).filter((modulo) => modulo !== 'ADMINISTRACION');
  const nombre = sesion?.usuario.nombre.split(' ')[0] ?? '';

  return (
    <>
      <EncabezadoPagina
        titulo={nombre ? `Hola, ${nombre}` : 'Inicio'}
        descripcion={
          empresa
            ? 'Todo lo que registres queda bajo la empresa seleccionada arriba.'
            : 'Selecciona una empresa en la barra superior para empezar.'
        }
      />

      <div className="p-6">
        {empresa && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-md border border-borde bg-superficie-alt px-4 py-3">
            <div className="min-w-0">
              <p className="encabezado-columna">Empresa activa</p>
              <p className="mt-1 truncate text-[14px] font-medium text-tinta">{empresa.nombre}</p>
            </div>
            <span className="cifra shrink-0 text-tenue">
              NIT {empresa.nit}-{empresa.digitoVerificacion}
            </span>
          </div>
        )}

        {modulos.length === 0 ? (
          <div className="rounded-md border border-borde bg-superficie px-4 py-8 text-center">
            <p className="text-[14px] font-medium text-tinta">Todavía no tienes módulos</p>
            <p className="mx-auto mt-1 max-w-[380px] text-[13px] leading-relaxed text-grafito">
              Un administrador tiene que darte acceso para que aparezcan en la barra lateral.
            </p>
          </div>
        ) : (
          <>
            <p className="encabezado-columna mb-2.5">Tus módulos</p>
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {modulos.map((modulo) => {
                const Icono = ICONO[modulo] ?? Wallet;
                return (
                  <li key={modulo}>
                    <Link
                      href={RUTA_MODULO[modulo]}
                      className="group flex h-full items-start gap-3 rounded-md border border-borde bg-superficie px-4 py-3.5 transition-colors hover:border-borde-fuerte hover:bg-superficie-alt"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-borde bg-superficie-alt text-tenue transition-colors group-hover:border-acento-borde group-hover:bg-acento-suave group-hover:text-acento">
                        <Icono className="size-4" aria-hidden />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[14px] font-medium text-tinta">
                            {ETIQUETA_MODULO[modulo]}
                          </span>
                          <ArrowRight
                            className="size-3.5 shrink-0 text-tenue opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden
                          />
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-grafito">
                          {QUE_HACE[modulo]}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
