'use client';

import {
  CONCEPTOS_SUGERIDOS,
  ETIQUETA_TIPO_PERIODO,
  TIPOS_PERIODO,
  formatear,
  totalizarManual,
  type DatosLiquidar,
  type Empleado,
  type ReciboDetalle,
} from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PanelLateral } from '@/components/patrones/panel-lateral';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada, Seleccion } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { cn } from '@/lib/utils';

/**
 * Liquidar un período.
 *
 * El neto se calcula mientras se escribe con `totalizarManual`, de `@nexo/shared`
 * — **la misma función** que después corre el servidor. Dos implementaciones de la
 * misma suma es de donde salen las diferencias de un peso que después nadie sabe
 * explicarle a un empleado.
 *
 * Los conceptos se escriben, no se eligen: la clienta pidió poner los valores a mano
 * (docs/ETAPA-05.md §1). El desplegable es una sugerencia con `list`, así que se
 * escribe rápido lo de siempre sin cerrarle la puerta a lo excepcional.
 */

interface Linea {
  id: string;
  tipo: 'DEVENGADO' | 'DEDUCCION';
  concepto: string;
  valor: string;
}

function lineaNueva(tipo: Linea['tipo']): Linea {
  return { id: crypto.randomUUID(), tipo, concepto: '', valor: '' };
}

/** Primer y último día del mes en curso, en hora de Bogotá. */
function periodoPorDefecto(): { inicio: string; fin: string } {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [anio, mes] = hoy.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio!, mes!, 0)).getUTCDate();

  return {
    inicio: `${anio}-${String(mes).padStart(2, '0')}-01`,
    fin: `${anio}-${String(mes).padStart(2, '0')}-${ultimo}`,
  };
}

export function FormularioRecibo({
  empleado,
  empresaId,
  onCerrar,
  onLiquidado,
}: {
  empleado: Empleado | null;
  empresaId: string | null;
  onCerrar: () => void;
  onLiquidado: () => void;
}) {
  const inicial = periodoPorDefecto();

  const [tipoPeriodo, setTipoPeriodo] = useState<'QUINCENAL' | 'MENSUAL'>('MENSUAL');
  const [periodoInicio, setPeriodoInicio] = useState(inicial.inicio);
  const [periodoFin, setPeriodoFin] = useState(inicial.fin);
  const [lineas, setLineas] = useState<Linea[]>([
    { id: 'inicial', tipo: 'DEVENGADO', concepto: 'Salario básico', valor: '' },
  ]);

  const totales = calcularEnVivo(lineas);

  const liquidar = useMutation({
    mutationFn: () => {
      const datos: DatosLiquidar = {
        tipoPeriodo,
        periodoInicio: periodoInicio as unknown as Date,
        periodoFin: periodoFin as unknown as Date,
        moneda: empleado?.moneda ?? 'COP',
        conceptos: lineas.map(({ tipo, concepto, valor }) => ({ tipo, concepto, valor })),
      };

      return peticion<ReciboDetalle>(`empleados/${empleado?.id}/recibos`, {
        metodo: 'POST',
        cuerpo: datos,
        empresaId,
      });
    },
    onSuccess: (recibo) => {
      toast.success(`Recibo ${recibo.consecutivo} emitido.`);
      onLiquidado();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo liquidar.');
    },
  });

  const cambiar = (id: string, campo: keyof Linea, valor: string) =>
    setLineas((previas) =>
      previas.map((linea) => (linea.id === id ? { ...linea, [campo]: valor } : linea)),
    );

  return (
    <PanelLateral
      abierto={empleado !== null}
      onCambiarAbierto={(valor) => !valor && onCerrar()}
      titulo="Liquidar período"
      descripcion={
        empleado ? `${empleado.nombre} · ${empleado.cargo}` : 'Al guardar se emite el recibo.'
      }
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={liquidar.isPending}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={liquidar.isPending || totales.estado !== 'listo'}
            onClick={() => liquidar.mutate()}
          >
            <FileText aria-hidden />
            {liquidar.isPending ? 'Emitiendo…' : 'Liquidar y emitir recibo'}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[130px_1fr_1fr] gap-3">
          <Campo etiqueta="Período" htmlFor="tipoPeriodo" obligatorio>
            <Seleccion
              id="tipoPeriodo"
              value={tipoPeriodo}
              onChange={(evento) => setTipoPeriodo(evento.target.value as 'QUINCENAL' | 'MENSUAL')}
            >
              {TIPOS_PERIODO.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_TIPO_PERIODO[valor]}
                </option>
              ))}
            </Seleccion>
          </Campo>

          <Campo etiqueta="Desde" htmlFor="periodoInicio" obligatorio>
            <Entrada
              id="periodoInicio"
              type="date"
              value={periodoInicio}
              onChange={(evento) => setPeriodoInicio(evento.target.value)}
            />
          </Campo>

          <Campo etiqueta="Hasta" htmlFor="periodoFin" obligatorio>
            <Entrada
              id="periodoFin"
              type="date"
              value={periodoFin}
              onChange={(evento) => setPeriodoFin(evento.target.value)}
            />
          </Campo>
        </div>

        <datalist id="conceptos-devengado">
          {CONCEPTOS_SUGERIDOS.DEVENGADO.map((concepto) => (
            <option key={concepto} value={concepto} />
          ))}
        </datalist>
        <datalist id="conceptos-deduccion">
          {CONCEPTOS_SUGERIDOS.DEDUCCION.map((concepto) => (
            <option key={concepto} value={concepto} />
          ))}
        </datalist>

        <Bloque
          titulo="Devengados"
          tipo="DEVENGADO"
          lineas={lineas}
          onCambiar={cambiar}
          onQuitar={(id) => setLineas((previas) => previas.filter((l) => l.id !== id))}
          onAgregar={() => setLineas((previas) => [...previas, lineaNueva('DEVENGADO')])}
        />

        <Bloque
          titulo="Deducciones"
          tipo="DEDUCCION"
          lineas={lineas}
          onCambiar={cambiar}
          onQuitar={(id) => setLineas((previas) => previas.filter((l) => l.id !== id))}
          onAgregar={() => setLineas((previas) => [...previas, lineaNueva('DEDUCCION')])}
        />

        <ResultadoEnVivo resultado={totales} moneda={empleado?.moneda ?? 'COP'} />
      </div>
    </PanelLateral>
  );
}

function Bloque({
  titulo,
  tipo,
  lineas,
  onCambiar,
  onQuitar,
  onAgregar,
}: {
  titulo: string;
  tipo: Linea['tipo'];
  lineas: Linea[];
  onCambiar: (id: string, campo: keyof Linea, valor: string) => void;
  onQuitar: (id: string) => void;
  onAgregar: () => void;
}) {
  const propias = lineas.filter((linea) => linea.tipo === tipo);
  const lista = tipo === 'DEVENGADO' ? 'conceptos-devengado' : 'conceptos-deduccion';

  return (
    <fieldset className="rounded-md border border-borde bg-superficie-alt/60 p-3.5">
      <legend className="px-1 text-[12px] font-semibold text-tinta">{titulo}</legend>

      <div className="space-y-2">
        {propias.map((linea) => (
          <div key={linea.id} className="flex items-center gap-2">
            <input
              value={linea.concepto}
              onChange={(evento) => onCambiar(linea.id, 'concepto', evento.target.value)}
              list={lista}
              placeholder="Concepto"
              aria-label={`Concepto de ${titulo.toLowerCase()}`}
              className="h-9 min-w-0 flex-1 rounded-sm border border-borde bg-campo px-2.5 text-[13px] text-tinta outline-none placeholder:text-tenue focus:border-acento focus:bg-superficie"
            />
            <input
              value={linea.valor}
              onChange={(evento) => onCambiar(linea.id, 'valor', evento.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Valor de ${linea.concepto || titulo.toLowerCase()}`}
              className="cifra h-9 w-[120px] shrink-0 rounded-sm border border-borde bg-campo px-2.5 text-right text-tinta outline-none placeholder:text-tenue focus:border-acento focus:bg-superficie"
            />
            {propias.length > 1 && (
              <Boton
                variante="fantasma"
                tamano="iconoPequeno"
                aria-label={`Quitar ${linea.concepto || 'línea'}`}
                onClick={() => onQuitar(linea.id)}
              >
                <Trash2 aria-hidden />
              </Boton>
            )}
          </div>
        ))}
      </div>

      <Boton variante="secundario" tamano="pequeno" className="mt-2.5" onClick={onAgregar}>
        <Plus aria-hidden />
        Agregar
      </Boton>
    </fieldset>
  );
}

type Resultado =
  | { estado: 'incompleto' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; totalDevengado: string; totalDeducido: string; neto: string };

/** Corre el cálculo compartido sobre lo que hay escrito, sin quejarse de lo que falta. */
function calcularEnVivo(lineas: Linea[]): Resultado {
  const completas = lineas.filter((linea) => linea.concepto.trim() && linea.valor.trim());
  if (completas.length === 0) return { estado: 'incompleto' };

  try {
    return {
      estado: 'listo',
      ...totalizarManual.liquidar(
        completas.map(({ tipo, concepto, valor }) => ({ tipo, concepto, valor })),
      ),
    };
  } catch (error) {
    return {
      estado: 'error',
      mensaje: error instanceof Error ? error.message : 'Revisa los valores.',
    };
  }
}

function ResultadoEnVivo({ resultado, moneda }: { resultado: Resultado; moneda: string }) {
  if (resultado.estado === 'incompleto') {
    return (
      <div className="rounded-md border border-dashed border-borde px-4 py-3.5 text-center text-[12px] text-tenue">
        El neto aparece aquí en cuanto haya un concepto con su valor.
      </div>
    );
  }

  if (resultado.estado === 'error') {
    return (
      <div
        role="status"
        className="rounded-md border border-alerta-borde bg-alerta-suave px-4 py-3 text-[12px] leading-relaxed text-alerta"
      >
        {resultado.mensaje}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('rounded-md border border-exito-borde bg-exito-suave px-4 py-3.5')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold text-exito">Neto a pagar</span>
        <span className="cifra text-[17px] font-semibold text-exito">
          {formatear(resultado.neto, moneda as 'COP')}
        </span>
      </div>

      <dl className="mt-2.5 space-y-1 border-t border-current/15 pt-2.5 text-[12px]">
        <div className="flex justify-between gap-3">
          <dt className="text-grafito">Total devengado</dt>
          <dd className="cifra text-tinta">
            {formatear(resultado.totalDevengado, moneda as 'COP')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-grafito">Total deducido</dt>
          <dd className="cifra text-tinta">
            {formatear(resultado.totalDeducido, moneda as 'COP')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
