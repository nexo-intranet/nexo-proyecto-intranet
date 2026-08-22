'use client';

import { ETIQUETA_CATEGORIA_GASTO, formatear, type Gasto } from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AdjuntarArchivo } from '@/components/contabilidad/adjuntar-archivo';
import { Distintivo } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { formatearFecha } from '@/lib/formato';

/**
 * El detalle de un gasto y su soporte.
 *
 * Un gasto se puede eliminar —no es un documento legal, así que no aplica la regla
 * de anular en vez de borrar— pero el borrado es lógico: la fila desaparece de las
 * listas y el archivo se queda. Borrar el archivo haría irreversible un «eliminar»
 * que en el resto del sistema no lo es.
 */
export function DetalleGasto({
  gasto,
  empresaId,
  puedeEditar,
  onCambio,
}: {
  gasto: Gasto;
  empresaId: string | null;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const eliminar = useMutation({
    mutationFn: () => peticion<void>(`gastos/${gasto.id}`, { metodo: 'DELETE', empresaId }),
    onSuccess: () => {
      toast.success('Gasto eliminado.');
      onCambio();
    },
    onError: (error) => {
      toast.error(error instanceof ErrorDeApi ? error.message : 'No se pudo eliminar el gasto.');
    },
  });

  const filas: Array<[string, string]> = [
    ['Categoría', ETIQUETA_CATEGORIA_GASTO[gasto.categoria]],
    ['Proveedor', gasto.proveedor ?? '—'],
    ['Fecha', formatearFecha(gasto.fecha)],
    ['Monto', formatear(gasto.monto, gasto.moneda)],
  ];

  if (gasto.moneda !== 'COP' && gasto.tasaCambio) {
    filas.push(['Tasa de cambio', `${gasto.tasaCambio} COP por ${gasto.moneda}`]);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-semibold leading-snug text-tinta">{gasto.concepto}</p>
        <p className="cifra mt-1 text-[20px] font-semibold text-tinta">
          {formatear(gasto.montoCOP, 'COP')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Distintivo tono={gasto.deducible ? 'acento' : 'neutro'}>
          {gasto.deducible ? 'Deducible' : 'No deducible'}
        </Distintivo>
        {!gasto.soporte && (
          <Distintivo tono="alerta" punto>
            Sin soporte
          </Distintivo>
        )}
      </div>

      <dl className="space-y-2.5">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-baseline justify-between gap-4">
            <dt className="etiqueta shrink-0">{etiqueta}</dt>
            <dd className="min-w-0 text-right text-[13px] text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>

      <AdjuntarArchivo
        rutaSubida={`gastos/${gasto.id}/soporte`}
        rutaDescarga={`gastos/${gasto.id}/soporte`}
        empresaId={empresaId}
        archivo={gasto.soporte}
        puedeEditar={puedeEditar}
        etiqueta="soporte"
        onSubido={onCambio}
      />

      {!gasto.soporte && (
        <p className="rounded-sm border border-alerta-borde bg-alerta-suave px-3 py-2.5 text-[12px] leading-relaxed text-alerta">
          Sin la factura o el recibo adjunto, este gasto no es deducible ante la DIAN por más que
          esté marcado como tal.
        </p>
      )}

      {puedeEditar && (
        <div className="border-t border-borde pt-4">
          <Boton
            variante="peligroSuave"
            tamano="pequeno"
            onClick={() => eliminar.mutate()}
            disabled={eliminar.isPending}
          >
            <Trash2 aria-hidden />
            {eliminar.isPending ? 'Eliminando…' : 'Eliminar gasto'}
          </Boton>
          <p className="mt-1.5 text-[12px] leading-snug text-tenue">
            Deja de aparecer en las listas y en el resumen. El soporte adjunto se conserva.
          </p>
        </div>
      )}
    </div>
  );
}
