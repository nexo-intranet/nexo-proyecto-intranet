'use client';

import { Download, Paperclip, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Boton } from '@/components/ui/boton';
import { ErrorDeApi, descargarArchivo, subirArchivo } from '@/lib/api/cliente';

/**
 * Adjuntar y descargar un archivo.
 *
 * Se usa igual en el soporte de un gasto y en el documento de una solicitud, que es
 * la misma operación con otro nombre.
 *
 * El límite y los formatos se dicen **antes** de elegir el archivo, no después de
 * que el servidor lo rechace: quien tiene una foto de 12 MB necesita saberlo ahora.
 * Aun así, el servidor vuelve a comprobarlo todo —incluido que el contenido sea de
 * verdad un PDF y no un archivo renombrado—, porque una validación en el navegador
 * es una comodidad, nunca una defensa.
 */

const MAXIMO_BYTES = 10 * 1024 * 1024;
const ACEPTADOS = 'application/pdf,image/jpeg,image/png';

export function AdjuntarArchivo({
  rutaSubida,
  rutaDescarga,
  empresaId,
  archivo,
  puedeEditar,
  etiqueta,
  onSubido,
}: {
  /** POST multipart. */
  rutaSubida: string;
  /** GET binario. */
  rutaDescarga: string;
  empresaId: string | null;
  archivo: { nombre: string; tipo: string } | null;
  puedeEditar: boolean;
  /** «soporte» o «documento»: cambia solo el texto. */
  etiqueta: string;
  onSubido: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const elegir = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = evento.target.files?.[0];
    // Se limpia siempre: sin esto, volver a elegir el mismo archivo tras un error
    // no dispara el evento y parece que el botón dejó de funcionar.
    evento.target.value = '';
    if (!elegido) return;

    if (elegido.size > MAXIMO_BYTES) {
      toast.error(
        `Ese archivo pesa ${(elegido.size / 1024 / 1024).toFixed(1)} MB y el límite son 10 MB.`,
      );
      return;
    }

    setSubiendo(true);
    try {
      await subirArchivo(rutaSubida, elegido, empresaId);
      toast.success(`Se adjuntó el ${etiqueta}.`);
      onSubido();
    } catch (error) {
      toast.error(
        error instanceof ErrorDeApi ? error.message : `No se pudo adjuntar el ${etiqueta}.`,
      );
    } finally {
      setSubiendo(false);
    }
  };

  const descargar = async () => {
    if (!archivo) return;
    setDescargando(true);
    try {
      await descargarArchivo(rutaDescarga, archivo.nombre, empresaId);
    } catch (error) {
      toast.error(
        error instanceof ErrorDeApi ? error.message : `No se pudo descargar el ${etiqueta}.`,
      );
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="rounded-md border border-borde bg-superficie-alt px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Paperclip
            className={
              archivo ? 'mt-0.5 size-4 shrink-0 text-acento' : 'mt-0.5 size-4 shrink-0 text-tenue'
            }
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tinta">
              {archivo ? archivo.nombre : `Sin ${etiqueta}`}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-tenue">
              {archivo
                ? 'Se sirve por el servidor, que verifica la sesión en cada descarga.'
                : 'PDF, JPG o PNG. Hasta 10 MB.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {archivo && (
            <Boton
              variante="secundario"
              tamano="pequeno"
              onClick={() => void descargar()}
              disabled={descargando}
            >
              <Download aria-hidden />
              {descargando ? 'Abriendo…' : 'Descargar'}
            </Boton>
          )}

          {puedeEditar && (
            <>
              <input
                ref={entrada}
                type="file"
                accept={ACEPTADOS}
                className="sr-only"
                onChange={(evento) => void elegir(evento)}
                aria-label={`Adjuntar ${etiqueta}`}
              />
              <Boton
                variante={archivo ? 'fantasma' : 'secundario'}
                tamano="pequeno"
                onClick={() => entrada.current?.click()}
                disabled={subiendo}
              >
                <Upload aria-hidden />
                {subiendo ? 'Subiendo…' : archivo ? 'Reemplazar' : 'Adjuntar'}
              </Boton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
