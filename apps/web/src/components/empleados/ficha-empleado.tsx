'use client';

import {
  ETIQUETA_ESTADO_DOCUMENTO,
  ETIQUETA_TIPO_CONTRATO,
  ETIQUETA_TIPO_DOCUMENTO,
  ETIQUETA_TIPO_DOCUMENTO_LABORAL,
  ETIQUETA_TIPO_PERIODO,
  formatear,
  type DocumentoLaboral,
  type Empleado,
  type ReciboResumen,
  type RespuestaPaginada,
  type ResumenEmpleado,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Distintivo, Esqueleto } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, descargarArchivo, peticion } from '@/lib/api/cliente';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * La ficha de un empleado: datos, recibos y documentos.
 *
 * Las tres pestañas responden preguntas distintas —quién es, qué se le pagó, qué se
 * le ha certificado— y por eso van separadas en vez de en una columna larga.
 */
export function FichaEmpleado({
  empleado,
  empresaId,
  puedeEditar,
  onLiquidar,
}: {
  empleado: Empleado;
  empresaId: string | null;
  puedeEditar: boolean;
  onLiquidar: () => void;
}) {
  const [pestana, setPestana] = useState<'datos' | 'recibos' | 'documentos'>('datos');

  const { data: resumen } = useQuery({
    queryKey: ['empleado-resumen', empleado.id, empresaId],
    queryFn: () => peticion<ResumenEmpleado>(`empleados/${empleado.id}/resumen`, { empresaId }),
  });

  return (
    <div className="space-y-5">
      {resumen && (
        <div className="grid grid-cols-2 gap-2.5">
          <Cifra etiqueta="Recibos" valor={String(resumen.recibos)} />
          <Cifra etiqueta="Neto acumulado" valor={formatear(resumen.netoAcumulado, 'COP')} />
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-borde" role="tablist">
        <Pestana activa={pestana === 'datos'} onClick={() => setPestana('datos')}>
          Datos
        </Pestana>
        <Pestana activa={pestana === 'recibos'} onClick={() => setPestana('recibos')}>
          Recibos
        </Pestana>
        <Pestana activa={pestana === 'documentos'} onClick={() => setPestana('documentos')}>
          Documentos
        </Pestana>
      </div>

      {pestana === 'datos' && <Datos empleado={empleado} />}
      {pestana === 'recibos' && (
        <Recibos
          empleadoId={empleado.id}
          empresaId={empresaId}
          puedeEditar={puedeEditar && empleado.activo}
          onLiquidar={onLiquidar}
        />
      )}
      {pestana === 'documentos' && (
        <Documentos empleado={empleado} empresaId={empresaId} puedeEditar={puedeEditar} />
      )}
    </div>
  );
}

function Datos({ empleado }: { empleado: Empleado }) {
  const filas: Array<[string, string]> = [
    ['Nombre', empleado.nombre],
    ['Documento', `${ETIQUETA_TIPO_DOCUMENTO[empleado.tipoDoc]} •••• ${empleado.numeroDocFinal}`],
    ['Cargo', empleado.cargo],
    ['Contrato', ETIQUETA_TIPO_CONTRATO[empleado.tipoContrato]],
    ['Salario básico', formatear(empleado.salarioBase, empleado.moneda)],
    ['Ingreso', formatearFecha(empleado.fechaIngreso)],
    ['Retiro', empleado.fechaRetiro ? formatearFecha(empleado.fechaRetiro) : '—'],
    ['Correo', empleado.email ?? '—'],
    ['Teléfono', empleado.telefono ?? '—'],
    ['Dirección', empleado.direccion ?? '—'],
    ['Estado', empleado.activo ? 'Activo' : 'Retirado'],
  ];

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
        El documento de identidad se guarda cifrado y no sale del servidor completo. Buscarlo
        compara un HMAC: la tabla nunca se descifra para encontrar a alguien.
      </p>
    </>
  );
}

function Recibos({
  empleadoId,
  empresaId,
  puedeEditar,
  onLiquidar,
}: {
  empleadoId: string;
  empresaId: string | null;
  puedeEditar: boolean;
  onLiquidar: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['empleado-recibos', empleadoId, empresaId],
    queryFn: () =>
      peticion<RespuestaPaginada<ReciboResumen>>(`empleados/${empleadoId}/recibos?porPagina=25`, {
        empresaId,
      }),
  });

  if (isLoading) return <Esqueleto className="h-48 rounded-md" />;

  return (
    <>
      {puedeEditar && (
        <Boton variante="primario" tamano="pequeno" className="mb-3" onClick={onLiquidar}>
          <FileText aria-hidden />
          Liquidar un período
        </Boton>
      )}

      {!data || data.datos.length === 0 ? (
        <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-[13px] leading-relaxed text-tenue">
          Todavía no se le ha liquidado ningún período.
        </p>
      ) : (
        <ul className="divide-y divide-borde-suave rounded-sm border border-borde bg-superficie">
          {data.datos.map((recibo) => (
            <li key={recibo.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="cifra block font-medium text-tinta">{recibo.consecutivo}</span>
                  <span className="text-[11px] text-tenue">
                    {ETIQUETA_TIPO_PERIODO[recibo.tipoPeriodo]} ·{' '}
                    {formatearFecha(recibo.periodoInicio)} a {formatearFecha(recibo.periodoFin)}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <span className="cifra text-tinta">{formatear(recibo.neto, recibo.moneda)}</span>
                  <Distintivo tono={recibo.estado === 'VIGENTE' ? 'exito' : 'peligro'}>
                    {ETIQUETA_ESTADO_DOCUMENTO[recibo.estado]}
                  </Distintivo>
                  <Boton
                    variante="fantasma"
                    tamano="iconoPequeno"
                    aria-label={`Descargar ${recibo.consecutivo}`}
                    onClick={() =>
                      void descargarArchivo(
                        `recibos-nomina/${recibo.id}/pdf`,
                        `${recibo.consecutivo}.pdf`,
                        empresaId,
                      ).catch(() => toast.error('No se pudo descargar el recibo.'))
                    }
                  >
                    <Download aria-hidden />
                  </Boton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Carta laboral y certificado de ingresos.
 *
 * Se emiten y se descargan en el mismo gesto: nadie «emite» una carta laboral para
 * bajarla después — la pide y se la lleva. El historial de abajo existe para poder
 * responder «¿cuándo le dimos la última?».
 */
function Documentos({
  empleado,
  empresaId,
  puedeEditar,
}: {
  empleado: Empleado;
  empresaId: string | null;
  puedeEditar: boolean;
}) {
  const clienteConsultas = useQueryClient();
  const [anio, setAnio] = useState(String(new Date().getFullYear()));

  const { data, isLoading } = useQuery({
    queryKey: ['empleado-documentos', empleado.id, empresaId],
    queryFn: () =>
      peticion<DocumentoLaboral[]>(`empleados/${empleado.id}/documentos`, { empresaId }),
  });

  const emitir = useMutation({
    mutationFn: (cuerpo: { tipo: string; anio?: number }) =>
      descargarArchivo(
        `empleados/${empleado.id}/documentos`,
        cuerpo.tipo === 'CARTA_LABORAL'
          ? `carta-laboral-${empleado.numeroDocFinal}.pdf`
          : `certificado-${cuerpo.anio}-${empleado.numeroDocFinal}.pdf`,
        empresaId,
        { metodo: 'POST', cuerpo },
      ),
    onSuccess: () => {
      toast.success('Documento emitido.');
      void clienteConsultas.invalidateQueries({ queryKey: ['empleado-documentos', empleado.id] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo emitir el documento.');
    },
  });

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="space-y-3 rounded-md border border-borde bg-superficie-alt/60 p-3.5">
          <Boton
            variante="secundario"
            tamano="pequeno"
            disabled={emitir.isPending}
            onClick={() => emitir.mutate({ tipo: 'CARTA_LABORAL' })}
          >
            <ScrollText aria-hidden />
            Emitir carta laboral
          </Boton>

          <div className="flex items-end gap-2">
            <div className="w-[110px]">
              <Campo etiqueta="Año" htmlFor="anio-certificado">
                <Entrada
                  id="anio-certificado"
                  inputMode="numeric"
                  className="cifra"
                  value={anio}
                  onChange={(evento) => setAnio(evento.target.value)}
                />
              </Campo>
            </div>
            <Boton
              variante="secundario"
              tamano="pequeno"
              disabled={emitir.isPending || anio.length !== 4}
              onClick={() => emitir.mutate({ tipo: 'CERTIFICADO_INGRESOS', anio: Number(anio) })}
            >
              <ScrollText aria-hidden />
              Certificado de ingresos
            </Boton>
          </div>

          <p className="text-[11px] leading-relaxed text-tenue">
            Se generan con los datos de hoy, no con una copia guardada: una carta laboral certifica
            un estado actual, así que la de junio dice lo de junio.
          </p>
        </div>
      )}

      {isLoading ? (
        <Esqueleto className="h-32 rounded-md" />
      ) : !data || data.length === 0 ? (
        <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-[13px] text-tenue">
          Todavía no se le ha emitido ningún documento.
        </p>
      ) : (
        <ul className="divide-y divide-borde-suave rounded-sm border border-borde bg-superficie">
          {data.map((documento) => (
            <li
              key={documento.id}
              className="flex items-baseline justify-between gap-3 px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-tinta">
                  {ETIQUETA_TIPO_DOCUMENTO_LABORAL[documento.tipo]}
                  {documento.anio ? ` ${documento.anio}` : ''}
                </span>
                <span className="text-[11px] text-tenue">
                  {formatearFechaHora(documento.emitidoEn)}
                  {documento.emitidoPor ? ` · ${documento.emitidoPor.nombre}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
