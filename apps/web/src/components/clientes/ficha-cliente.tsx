'use client';

import {
  ETIQUETA_ESTADO_OPERACION,
  ETIQUETA_TIPO_OBLIGACION,
  ETIQUETA_TIPO_CLIENTE,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_DOCUMENTO,
  abreviarHash,
  formatear,
  type Cliente,
  type FechaCalendario,
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
  const [pestana, setPestana] = useState<'datos' | 'operaciones' | 'calendario'>('datos');

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
        <Pestana activa={pestana === 'calendario'} onClick={() => setPestana('calendario')}>
          Calendario
        </Pestana>
      </div>

      {pestana === 'datos' ? (
        <Datos cliente={cliente} />
      ) : pestana === 'operaciones' ? (
        <Operaciones clienteId={cliente.id} empresaId={empresaId} />
      ) : (
        <Calendario cliente={cliente} empresaId={empresaId} />
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

      <p className="mt-5 rounded-sm border border-borde bg-superficie-alt px-3 py-2.5 text-[12px] leading-relaxed text-grafito">
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

/**
 * El calendario tributario de este cliente.
 *
 * No se guarda ninguna fecha asignada a nadie: se le pregunta a Contabilidad, que
 * cruza el último dígito del NIT, el tipo de contribuyente y —para el ICA— el
 * municipio. Copiar aquí la regla del cruce habría sido más rápido y habría dejado
 * dos verdades que se separan el día que la DIAN cambie una.
 */
function Calendario({ cliente, empresaId }: { cliente: Cliente; empresaId: string | null }) {
  const anio = new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ['cliente-calendario', cliente.id, empresaId, anio],
    enabled: cliente.ultimoDigitoNit !== null,
    queryFn: () =>
      peticion<FechaCalendario[]>(`clientes/${cliente.id}/calendario?anio=${anio}`, { empresaId }),
  });

  if (cliente.ultimoDigitoNit === null) {
    return (
      <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-[13px] leading-relaxed text-tenue">
        Este cliente no tiene NIT, y el calendario de la DIAN se reparte por su último dígito. Sin
        ese dato no hay fechas que mostrar —mejor eso que inventar unas.
      </p>
    );
  }

  if (isLoading) return <Esqueleto className="h-40 rounded-md" />;

  if (!data || data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-borde px-4 py-8 text-center">
        <CalendarClock className="mx-auto size-5 text-tenue" aria-hidden />
        <p className="mt-2 text-[13px] leading-relaxed text-tenue">
          No hay un calendario cargado para {anio}. Un administrador lo sube una vez al año desde
          Contabilidad.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-borde-suave overflow-hidden rounded-sm border border-borde bg-superficie">
        {data.map((fecha) => {
          const vencida = fecha.diasRestantes < 0;
          const cerca = !vencida && fecha.diasRestantes <= 15;

          return (
            <li key={fecha.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-tinta">
                  {ETIQUETA_TIPO_OBLIGACION[fecha.tipoObligacion]}
                </span>
                <span className="cifra text-[11px] text-tenue">
                  {formatearFecha(fecha.fechaLimite)}
                </span>
              </span>

              {vencida ? (
                <Distintivo tono="neutro">Ya pasó</Distintivo>
              ) : (
                <Distintivo tono={cerca ? 'alerta' : 'neutro'} punto={cerca}>
                  {fecha.diasRestantes === 0 ? 'Hoy' : `${fecha.diasRestantes} días`}
                </Distintivo>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[12px] leading-relaxed text-tenue">
        Se calcula con el último dígito <span className="cifra">{cliente.ultimoDigitoNit}</span>
        {cliente.tipoContribuyente ? ', su tipo de contribuyente' : ''}
        {cliente.codigoDaneMunicipio ? ' y su municipio' : ''}. Las fechas las mantiene
        Contabilidad.
      </p>
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
