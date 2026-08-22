'use client';

import {
  ETIQUETA_TIPO_CONTRIBUYENTE,
  ETIQUETA_TIPO_OBLIGACION,
  TIPOS_CONTRIBUYENTE,
  interpretarCalendarioCsv,
  type FechaCalendario,
  type FilaCalendarioLeida,
  type ImportacionCalendario,
  type PrevisualizacionCalendario,
  type TipoContribuyente,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, History, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Distintivo, EncabezadoPagina, EstadoVacio, Esqueleto } from '@/components/patrones';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, consulta, peticion } from '@/lib/api/cliente';
import { useEmpresa } from '@/lib/empresa';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { puedeEditar, useSesion } from '@/lib/sesion';
import { cn } from '@/lib/utils';

/**
 * El calendario tributario.
 *
 * Dos cosas distintas en una pantalla, y en este orden a propósito:
 *
 *   · **consultar** —qué le vence a alguien con este último dígito—, que es lo que
 *     se hace todos los días;
 *   · **cargar el año**, que se hace una vez y solo puede hacerlo un administrador.
 *
 * Las fechas no se guardan por cliente: se guardan por características y el cruce
 * ocurre al consultar. Por eso arriba se pide un dígito y no un nombre.
 */

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL - 1, ANIO_ACTUAL, ANIO_ACTUAL + 1];

export default function PaginaCalendario() {
  const { data: sesion } = useSesion();
  const { empresaId } = useEmpresa();

  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [digito, setDigito] = useState(0);
  const [contribuyente, setContribuyente] = useState<TipoContribuyente | ''>('');
  const [municipio, setMunicipio] = useState('');
  const [importando, setImportando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const esAdministrador = puedeEditar(sesion, 'ADMINISTRACION');

  const { data: fechas, isLoading } = useQuery({
    queryKey: ['calendario', empresaId, anio, digito, contribuyente, municipio],
    enabled: Boolean(empresaId),
    queryFn: () =>
      peticion<FechaCalendario[]>(
        `calendario${consulta({
          anio,
          ultimoDigito: digito,
          tipoContribuyente: contribuyente || undefined,
          codigoDaneMunicipio: /^\d{5}$/.test(municipio) ? municipio : undefined,
        })}`,
        { empresaId },
      ),
  });

  return (
    <div className="flex h-full flex-col overflow-auto">
      <EncabezadoPagina
        titulo="Calendario tributario"
        descripcion="Las fechas de la DIAN, cruzadas por último dígito, tipo de contribuyente y municipio."
        acciones={
          esAdministrador && (
            <>
              <Boton variante="secundario" onClick={() => setVerHistorial(true)}>
                <History aria-hidden />
                Historial
              </Boton>
              <Boton variante="primario" onClick={() => setImportando(true)}>
                <Upload aria-hidden />
                Cargar un año
              </Boton>
            </>
          )
        }
      />

      <div className="mx-auto w-full max-w-[1240px] px-5 py-6 lg:px-8">
        <div className="grid gap-3 rounded-md border border-borde bg-superficie-alt p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Año" htmlFor="anio">
            <Seleccion
              id="anio"
              value={anio}
              onChange={(evento) => setAnio(Number(evento.target.value))}
            >
              {ANIOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Último dígito del NIT"
            htmlFor="digito"
            ayuda="Es lo que determina la fecha, no el nombre."
          >
            <Seleccion
              id="digito"
              value={digito}
              onChange={(evento) => setDigito(Number(evento.target.value))}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo etiqueta="Tipo de contribuyente" htmlFor="contribuyente">
            <Seleccion
              id="contribuyente"
              value={contribuyente}
              onChange={(evento) => setContribuyente(evento.target.value as TipoContribuyente | '')}
            >
              <option value="">Cualquiera</option>
              {TIPOS_CONTRIBUYENTE.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_TIPO_CONTRIBUYENTE[valor]}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo
            etiqueta="Código DANE del municipio"
            htmlFor="municipio"
            ayuda="Solo cambia el ICA, que es municipal."
          >
            <input
              id="municipio"
              inputMode="numeric"
              maxLength={5}
              placeholder="05001"
              value={municipio}
              onChange={(evento) => setMunicipio(evento.target.value.replace(/\D/g, ''))}
              className="cifra h-9 w-full rounded-sm border border-borde bg-campo px-2.5 text-[13px] text-tinta outline-none placeholder:text-tenue hover:border-borde-fuerte focus:border-acento"
            />
          </Campo>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <Esqueleto className="h-48 rounded-md" />
          ) : !fechas || fechas.length === 0 ? (
            <EstadoVacio
              icono={<CalendarClock className="size-5" aria-hidden />}
              titulo={`No hay fechas cargadas para ${anio}`}
              descripcion={
                esAdministrador
                  ? 'Carga el calendario del año desde una hoja de cálculo. Vas a ver qué cambia antes de aplicarlo.'
                  : 'Un administrador tiene que cargar el calendario del año. Pídeselo antes de que empiece el período.'
              }
              accion={
                esAdministrador ? (
                  <Boton variante="primario" onClick={() => setImportando(true)}>
                    <Upload aria-hidden />
                    Cargar un año
                  </Boton>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-borde-suave overflow-hidden rounded-md border border-borde bg-superficie">
              {fechas.map((fecha) => (
                <FilaFecha key={fecha.id} fecha={fecha} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {esAdministrador && (
        <>
          <ImportarCalendario
            abierto={importando}
            empresaId={empresaId}
            anioSugerido={anio}
            onCerrar={() => setImportando(false)}
          />
          <Historial
            abierto={verHistorial}
            empresaId={empresaId}
            onCerrar={() => setVerHistorial(false)}
          />
        </>
      )}
    </div>
  );
}

/**
 * Una fecha del calendario.
 *
 * Los días que faltan van a la derecha y en color solo cuando el plazo aprieta: si
 * todas las filas gritan, ninguna se lee. El umbral de quince días es el que da
 * tiempo a reunir la información de una declaración.
 */
function FilaFecha({ fecha }: { fecha: FechaCalendario }) {
  const vencida = fecha.diasRestantes < 0;
  const cerca = !vencida && fecha.diasRestantes <= 15;

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-tinta">
          {ETIQUETA_TIPO_OBLIGACION[fecha.tipoObligacion]}
        </p>
        {fecha.descripcion && (
          <p className="mt-0.5 truncate text-[12px] text-tenue">{fecha.descripcion}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="cifra text-[13px] text-tinta">{formatearFecha(fecha.fechaLimite)}</span>
        {vencida ? (
          <Distintivo tono="neutro">Ya pasó</Distintivo>
        ) : (
          <Distintivo tono={cerca ? 'alerta' : 'neutro'} punto={cerca}>
            {fecha.diasRestantes === 0
              ? 'Vence hoy'
              : `${fecha.diasRestantes} ${fecha.diasRestantes === 1 ? 'día' : 'días'}`}
          </Distintivo>
        )}
      </div>
    </li>
  );
}

/**
 * Cargar el calendario de un año.
 *
 * Tres pasos y no uno: se elige el archivo, **se ve qué va a pasar** y se confirma.
 * Un archivo que define las fechas legales de todo un año no se aplica a ciegas, y
 * descubrir el error al día siguiente costaría rehacerlo con las fechas ya en uso.
 */
function ImportarCalendario({
  abierto,
  empresaId,
  anioSugerido,
  onCerrar,
}: {
  abierto: boolean;
  empresaId: string | null;
  anioSugerido: number;
  onCerrar: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);

  const [anio, setAnio] = useState(anioSugerido);
  const [filas, setFilas] = useState<FilaCalendarioLeida[]>([]);
  const [errores, setErrores] = useState<Array<{ linea: number; mensaje: string }>>([]);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [vista, setVista] = useState<PrevisualizacionCalendario | null>(null);

  const limpiar = () => {
    setFilas([]);
    setErrores([]);
    setNombreArchivo(null);
    setVista(null);
  };

  const previsualizar = useMutation({
    mutationFn: (leidas: FilaCalendarioLeida[]) =>
      peticion<PrevisualizacionCalendario>('calendario/previsualizar', {
        metodo: 'POST',
        cuerpo: { anio, filas: leidas },
        empresaId,
      }),
    onSuccess: setVista,
    onError: (error) => {
      toast.error(
        error instanceof ErrorDeApi ? error.message : 'No se pudo revisar el calendario.',
      );
    },
  });

  const importar = useMutation({
    mutationFn: () =>
      peticion<ImportacionCalendario>('calendario/importar', {
        metodo: 'POST',
        cuerpo: { anio, filas, nota: nombreArchivo ?? undefined },
        empresaId,
      }),
    onSuccess: (importacion) => {
      toast.success(`Calendario de ${importacion.anio} cargado: ${importacion.filas} fechas.`);
      void clienteConsultas.invalidateQueries({ queryKey: ['calendario'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['calendario-historial'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['cliente-calendario'] });
      limpiar();
      onCerrar();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo cargar el calendario.');
    },
  });

  const elegir = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    const lectura = interpretarCalendarioCsv(await archivo.text());
    setFilas(lectura.filas);
    setErrores(lectura.errores);
    setNombreArchivo(archivo.name);
    setVista(null);

    if (lectura.filas.length > 0) previsualizar.mutate(lectura.filas);
  };

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => {
        if (!valor) {
          limpiar();
          onCerrar();
        }
      }}
      titulo={`Cargar el calendario ${anio}`}
      descripcion="Se revisa antes de aplicarse. Nada cambia hasta que confirmes."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={importar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={() => importar.mutate()}
            disabled={!vista || filas.length === 0 || importar.isPending}
          >
            {importar.isPending ? 'Cargando…' : `Aplicar ${filas.length} fechas`}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Año" htmlFor="anio-importacion" obligatorio>
          <Seleccion
            id="anio-importacion"
            value={anio}
            onChange={(evento) => {
              setAnio(Number(evento.target.value));
              setVista(null);
            }}
          >
            {ANIOS.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <div className="rounded-md border border-dashed border-borde px-4 py-5 text-center">
          <input
            ref={entrada}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(evento) => void elegir(evento)}
            aria-label="Archivo del calendario"
          />
          <Boton variante="secundario" onClick={() => entrada.current?.click()}>
            <Upload aria-hidden />
            {nombreArchivo ? 'Elegir otro archivo' : 'Elegir el archivo'}
          </Boton>
          <p className="mx-auto mt-2 max-w-[320px] text-[12px] leading-relaxed text-tenue">
            {nombreArchivo ?? (
              <>
                Desde Excel, «Guardar como → CSV». Las columnas que hacen falta son{' '}
                <strong className="font-medium text-grafito">obligación</strong>,{' '}
                <strong className="font-medium text-grafito">dígito</strong> y{' '}
                <strong className="font-medium text-grafito">fecha</strong>; municipio y tipo de
                contribuyente son opcionales.
              </>
            )}
          </p>
        </div>

        {errores.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-alerta-borde bg-alerta-suave px-3.5 py-3"
          >
            <p className="text-[12px] font-semibold text-alerta">
              {errores.length === 1
                ? 'Una fila no se pudo leer'
                : `${errores.length} filas no se pudieron leer`}
            </p>
            <ul className="mt-1.5 space-y-1">
              {errores.slice(0, 6).map((error) => (
                <li key={error.linea} className="text-[12px] leading-snug text-grafito">
                  <span className="cifra">Línea {error.linea}</span> — {error.mensaje}
                </li>
              ))}
            </ul>
            {errores.length > 6 && (
              <p className="mt-1 text-[12px] text-tenue">y {errores.length - 6} más.</p>
            )}
            <p className="mt-2 text-[12px] leading-snug text-grafito">
              Las demás sí se pueden cargar. Corrige la hoja y vuelve a elegirla si esas fechas
              hacen falta.
            </p>
          </div>
        )}

        {previsualizar.isPending && <Esqueleto className="h-32 rounded-md" />}

        {vista && (
          <div className="space-y-3 rounded-md border border-acento-borde bg-acento-suave px-3.5 py-3">
            <p className="text-[12px] font-semibold text-acento">Esto es lo que va a pasar</p>

            <dl className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-grafito">Fechas que se cargan</dt>
                <dd className="cifra text-[13px] font-medium text-tinta">{vista.filas}</dd>
              </div>
              {vista.porObligacion.map((grupo) => (
                <div
                  key={grupo.tipoObligacion}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="pl-3 text-[12px] text-tenue">
                    {ETIQUETA_TIPO_OBLIGACION[grupo.tipoObligacion]}
                  </dt>
                  <dd className="cifra text-[12px] text-grafito">{grupo.filas}</dd>
                </div>
              ))}
            </dl>

            {vista.reemplaza ? (
              <p className="border-t border-acento-borde pt-2.5 text-[12px] leading-relaxed text-grafito">
                Ya había un calendario de {vista.anio} con{' '}
                <span className="cifra">{vista.reemplaza.filas}</span> fechas, cargado el{' '}
                {formatearFecha(vista.reemplaza.importadoEn)}. Deja de estar vigente pero{' '}
                <strong className="font-medium text-tinta">no se borra</strong>: se puede volver a
                él desde el historial.
              </p>
            ) : (
              <p className="border-t border-acento-borde pt-2.5 text-[12px] leading-relaxed text-grafito">
                Es el primer calendario de {vista.anio}.
              </p>
            )}
          </div>
        )}
      </div>
    </PanelLateral>
  );
}

/** El historial de cargas, con la opción de volver a una anterior. */
function Historial({
  abierto,
  empresaId,
  onCerrar,
}: {
  abierto: boolean;
  empresaId: string | null;
  onCerrar: () => void;
}) {
  const clienteConsultas = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['calendario-historial', empresaId],
    enabled: abierto && Boolean(empresaId),
    queryFn: () => peticion<ImportacionCalendario[]>('calendario/importaciones', { empresaId }),
  });

  const restaurar = useMutation({
    mutationFn: (id: string) =>
      peticion<ImportacionCalendario>(`calendario/importaciones/${id}/restaurar`, {
        metodo: 'POST',
        empresaId,
      }),
    onSuccess: (importacion) => {
      toast.success(`Se volvió a la carga del ${formatearFecha(importacion.importadoEn)}.`);
      void clienteConsultas.invalidateQueries({ queryKey: ['calendario'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['calendario-historial'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['cliente-calendario'] });
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo restaurar.');
    },
  });

  return (
    <PanelLateral
      abierto={abierto}
      onCambiarAbierto={(valor) => !valor && onCerrar()}
      titulo="Historial de cargas"
      descripcion="Nada se borra al cargar de nuevo: la versión anterior queda aquí."
    >
      {isLoading ? (
        <Esqueleto className="h-48 rounded-md" />
      ) : !data || data.length === 0 ? (
        <p className="rounded-md border border-dashed border-borde px-4 py-8 text-center text-[13px] leading-relaxed text-tenue">
          Todavía no se ha cargado ningún calendario.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((importacion) => (
            <li
              key={importacion.id}
              className={cn(
                'rounded-md border px-3.5 py-3',
                importacion.vigente
                  ? 'border-acento-borde bg-acento-suave'
                  : 'border-borde bg-superficie',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-tinta">
                    <span className="cifra">{importacion.anio}</span>
                    {importacion.vigente && <Distintivo tono="acento">Vigente</Distintivo>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-tenue">
                    <span className="cifra">{importacion.filas}</span> fechas ·{' '}
                    {formatearFechaHora(importacion.importadoEn)}
                  </p>
                  {importacion.importadoPor && (
                    <p className="mt-0.5 text-[12px] text-tenue">
                      Cargado por {importacion.importadoPor.nombre}
                    </p>
                  )}
                  {importacion.nota && (
                    <p className="mt-0.5 truncate text-[12px] text-grafito">{importacion.nota}</p>
                  )}
                </div>

                {!importacion.vigente && (
                  <Boton
                    variante="secundario"
                    tamano="pequeno"
                    onClick={() => restaurar.mutate(importacion.id)}
                    disabled={restaurar.isPending}
                  >
                    <RotateCcw aria-hidden />
                    Volver a esta
                  </Boton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelLateral>
  );
}
