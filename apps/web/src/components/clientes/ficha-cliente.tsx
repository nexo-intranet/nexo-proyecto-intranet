'use client';

import {
  ETIQUETA_ESTADO_OPERACION,
  ETIQUETA_TIPO_CLIENTE,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_DOCUMENTO,
  abreviarHash,
  formatear,
  type Cliente,
  type OperacionResumen,
  type RespuestaPaginada,
  type ResumenCliente,
} from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { Distintivo, Esqueleto } from '@/components/patrones';
import { peticion } from '@/lib/api/cliente';
import { formatearFecha } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * La ficha de un cliente: sus datos y su historial.
 *
 * Van en pestañas porque se consultan por razones distintas —«¿cuál es su NIT?» y
 * «¿qué ha movido con nosotros?»— y meter las dos cosas en una sola columna
 * obligaría a desplazarse para lo segundo, que es lo que más se mira.
 */
export function FichaCliente({
  cliente,
  empresaId,
}: {
  cliente: Cliente;
  empresaId: string | null;
}) {
  const [pestana, setPestana] = useState<'datos' | 'operaciones'>('datos');

  const { data: resumen } = useQuery({
    queryKey: ['cliente-resumen', cliente.id, empresaId],
    queryFn: () => peticion<ResumenCliente>(`clientes/${cliente.id}/resumen`, { empresaId }),
  });

  return (
    <div className="space-y-5">
      {resumen && (
        <div className="grid grid-cols-2 gap-2.5">
          <Cifra etiqueta="Operaciones" valor={String(resumen.operaciones)} />
          <Cifra etiqueta="Ganancia" valor={formatear(resumen.gananciaCOP, 'COP')} />
          {resumen.desde && (
            <Cifra etiqueta="Cliente desde" valor={formatearFecha(resumen.desde)} />
          )}
          {resumen.ultimaOperacion && (
            <Cifra etiqueta="Última operación" valor={formatearFecha(resumen.ultimaOperacion)} />
          )}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-borde" role="tablist">
        <Pestana activa={pestana === 'datos'} onClick={() => setPestana('datos')}>
          Datos
        </Pestana>
        <Pestana activa={pestana === 'operaciones'} onClick={() => setPestana('operaciones')}>
          Operaciones
        </Pestana>
      </div>

      {pestana === 'datos' ? (
        <Datos cliente={cliente} />
      ) : (
        <Operaciones clienteId={cliente.id} empresaId={empresaId} />
      )}
    </div>
  );
}

function Datos({ cliente }: { cliente: Cliente }) {
  const filas: Array<[string, string]> = [
    ['Nombre', cliente.nombre],
    ['Tipo', ETIQUETA_TIPO_CLIENTE[cliente.tipo]],
    ['Documento', `${ETIQUETA_TIPO_DOCUMENTO[cliente.tipoDoc]} •••• ${cliente.numeroDocFinal}`],
    [
      'Tipo de contribuyente',
      cliente.tipoContribuyente ? ETIQUETA_TIPO_CONTRIBUYENTE[cliente.tipoContribuyente] : '—',
    ],
    ['Municipio', cliente.municipio ?? '—'],
    ['Código DANE', cliente.codigoDaneMunicipio ?? '—'],
    ['Dirección', cliente.direccion ?? '—'],
    ['Contacto', cliente.nombreContacto ?? '—'],
    ['Correo', cliente.email ?? '—'],
    ['Teléfono', cliente.telefono ?? '—'],
  ];

  if (cliente.ultimoDigitoNit !== null) {
    filas.push(['Último dígito del NIT', String(cliente.ultimoDigitoNit)]);
  }

  return (
    <>
      <dl className="space-y-2.5">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-baseline justify-between gap-4">
            <dt className="etiqueta shrink-0">{etiqueta}</dt>
            <dd className="min-w-0 text-right text-[13px] text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>

      {/* El calendario llega en la etapa 6, con la tabla que un administrador carga
          una vez al año. Se deja dicho en vez de mostrar una sección vacía. */}
      <div className="mt-5 flex items-start gap-3 rounded-md border border-borde bg-superficie-alt px-3.5 py-3">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-decorativo" aria-hidden />
        <p className="text-[12px] leading-relaxed text-grafito">
          <strong className="font-semibold text-tinta">Calendario tributario</strong> — llega en la
          etapa 6, junto con Contabilidad. Se calcula con el último dígito del NIT, el tipo de
          contribuyente y el municipio, que ya se están guardando aquí.
        </p>
      </div>

      <p className="mt-3 rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[12px] leading-relaxed text-grafito">
        El número de documento se guarda cifrado y no sale del servidor completo. Buscarlo compara
        un HMAC: la tabla nunca se descifra para encontrar a alguien.
      </p>
    </>
  );
}

function Operaciones({ clienteId, empresaId }: { clienteId: string; empresaId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-operaciones', clienteId, empresaId],
    queryFn: () =>
      peticion<RespuestaPaginada<OperacionResumen>>(
        `clientes/${clienteId}/operaciones?porPagina=25`,
        { empresaId },
      ),
  });

  if (isLoading) return <Esqueleto className="h-48 rounded-md" />;

  if (!data || data.datos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-[13px] leading-relaxed text-tenue">
        Este cliente todavía no tiene operaciones registradas.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-borde-suave rounded-sm border border-borde bg-superficie">
        {data.datos.map((operacion) => (
          <li key={operacion.id} className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {operacion.hash ? (
                  <span className="hash block truncate">{abreviarHash(operacion.hash, 12, 6)}</span>
                ) : (
                  <span className="block text-[12px] text-tenue">Sin hash</span>
                )}
                <span className="text-[11px] text-tenue">
                  {formatearFecha(operacion.fechaOperacion)}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'cifra',
                    operacion.gananciaCOP.startsWith('-') ? 'text-peligro' : 'text-tinta',
                  )}
                >
                  {formatear(operacion.gananciaCOP, 'COP')}
                </span>
                <Distintivo tono={operacion.estado === 'CONCILIADA' ? 'exito' : 'neutro'}>
                  {ETIQUETA_ESTADO_OPERACION[operacion.estado]}
                </Distintivo>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {data.total > data.datos.length && (
        <p className="mt-2 text-center text-[12px] text-tenue">
          Se muestran las <span className="cifra">{data.datos.length}</span> más recientes de{' '}
          <span className="cifra">{data.total}</span>.
        </p>
      )}
    </>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-md border border-borde bg-superficie-alt px-3 py-2.5">
      <p className="encabezado-columna">{etiqueta}</p>
      <p className="cifra mt-1 text-[15px] font-semibold text-tinta">{valor}</p>
    </div>
  );
}

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors',
        activa
          ? 'border-acento font-medium text-tinta'
          : 'border-transparent text-grafito hover:text-tinta',
      )}
    >
      {children}
    </button>
  );
}
