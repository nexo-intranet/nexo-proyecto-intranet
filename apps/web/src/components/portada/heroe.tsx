'use client';

import type { ModuloSistema } from '@nexo/shared';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { abrirBuscador } from '@/lib/buscador';
import { FondoPortada } from './formas';
import { MosaicoModulos } from './mosaico-modulos';

/**
 * El héroe de la portada.
 *
 * Es lo único del sistema que se permite tipografía de 52px y espacio en blanco a
 * manos llenas. Se ve una vez al día, al entrar; el resto del tiempo se trabaja en
 * pantallas densas. Ese contraste es deliberado — no es incoherencia.
 *
 * El saludo lleva el nombre y la empresa activa juntos a propósito: en un sistema
 * multiempresa, saber *sobre cuál* se está trabajando es tan importante como saber
 * quién eres. Casi todos los errores caros empiezan por registrar algo en la
 * empresa equivocada.
 */

/** Saludo según la hora de Bogotá, que es donde está el equipo. */
function saludo(): string {
  const hora = Number(
    new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(new Date()),
  );

  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function HeroePortada({
  nombre,
  empresa,
  modulos,
}: {
  nombre: string;
  /** Solo lo que el héroe pinta. La sesión trae una versión ligera de la empresa. */
  empresa: { nombre: string } | undefined;
  modulos: ModuloSistema[];
}) {
  const [consulta, setConsulta] = useState('');

  const buscar = (evento: FormEvent) => {
    evento.preventDefault();
    abrirBuscador(consulta.trim() || undefined);
  };

  return (
    <section className="relative isolate overflow-hidden border-b border-borde bg-superficie">
      <FondoPortada />

      <div className="relative mx-auto max-w-[1180px] px-6 pb-10 pt-12 lg:px-10 lg:pb-12 lg:pt-16">
        {/* Pastilla de contexto: qué empresa manda en todo lo que se haga hoy. */}
        <span className="inline-flex items-center gap-2 rounded-pill border border-acento-borde bg-acento-suave px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-acento">
          <span className="size-1.5 rounded-full bg-acento" aria-hidden />
          {empresa ? empresa.nombre : 'Sin empresa seleccionada'}
        </span>

        <h1 className="titulo-portada mt-5 max-w-[620px]">
          {saludo()}
          {nombre ? ',' : ''}
          {nombre && (
            <>
              <br />
              {nombre}
            </>
          )}
        </h1>

        <p className="mt-4 max-w-[440px] text-[14px] leading-relaxed text-grafito">
          {empresa
            ? 'Todo lo que registres hoy queda bajo esta empresa. Puedes cambiarla en la barra de arriba.'
            : 'Selecciona una empresa en la barra de arriba para empezar a trabajar.'}
        </p>

        {/* El buscador por hash: la función que más se usa, según el brief §5. */}
        <form onSubmit={buscar} className="mt-7 max-w-[520px]" role="search">
          <div className="flex items-center gap-2.5 rounded-pill border border-borde bg-superficie py-2 pl-4 pr-2 shadow-tarjeta transition-colors focus-within:border-acento-borde">
            <Sparkles className="size-4 shrink-0 text-decorativo" aria-hidden />
            <input
              value={consulta}
              onChange={(evento) => setConsulta(evento.target.value)}
              placeholder="Buscar por hash, cliente o módulo…"
              aria-label="Buscar en la intranet"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-tinta outline-none placeholder:text-tenue"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-acento text-white transition-colors hover:bg-acento-fuerte"
            >
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-2 pl-4 text-[12px] text-tenue">
            <Search className="mr-1 inline size-3 align-[-1px]" aria-hidden />
            También con{' '}
            <kbd className="rounded-sm border border-borde bg-superficie-alt px-1 py-px font-sans text-[11px] text-grafito">
              Ctrl
            </kbd>{' '}
            +{' '}
            <kbd className="rounded-sm border border-borde bg-superficie-alt px-1 py-px font-sans text-[11px] text-grafito">
              K
            </kbd>{' '}
            desde cualquier pantalla
          </p>
        </form>

        <div className="mt-10">
          {modulos.length > 0 ? (
            <MosaicoModulos modulos={modulos} />
          ) : (
            // Sin permisos, el mosaico queda vacío. Callar sería peor: quien llega
            // aquí necesita saber que no es una falla y a quién pedirle acceso.
            <div className="max-w-[440px] rounded-xl border border-borde bg-superficie px-5 py-4 shadow-tarjeta">
              <p className="text-[14px] font-semibold text-tinta">Todavía no tienes módulos</p>
              <p className="mt-1 text-[13px] leading-snug text-grafito">
                Un administrador tiene que darte acceso para que aparezcan aquí y en la barra
                lateral.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
