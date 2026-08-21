'use client';

import type { ModuloSistema } from '@nexo/shared';
import { ArrowRight, Sparkles } from 'lucide-react';
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
 * La empresa activa va dentro de la frase, no en una etiqueta aparte. En un sistema
 * multiempresa saber *sobre cuál* se trabaja es crítico —casi todos los errores
 * caros empiezan por registrar algo en la empresa equivocada— y una frase que se
 * lee pesa más que una pastilla de color que el ojo aprende a saltarse.
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

      <div className="relative mx-auto flex max-w-[1240px] flex-col items-center px-5 pb-14 pt-16 text-center lg:px-8 lg:pb-16 lg:pt-20">
        <h1 className="titulo-portada max-w-[16ch] text-balance">
          {saludo()}
          {nombre ? `, ${nombre}` : ''}
        </h1>

        <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-grafito">
          {empresa ? (
            <>
              Todo lo que registres hoy queda bajo{' '}
              <strong className="font-semibold text-tinta">{empresa.nombre}</strong>. Puedes cambiar
              de empresa en la barra de arriba.
            </>
          ) : (
            'Selecciona una empresa en la barra de arriba para empezar a trabajar.'
          )}
        </p>

        {/* El buscador por hash: la función que más se usa, según el brief §5. */}
        <form onSubmit={buscar} className="mt-8 w-full max-w-[560px]" role="search">
          <label htmlFor="buscador-portada" className="sr-only">
            Buscar por hash, cliente o módulo
          </label>
          <div className="flex items-center gap-3 rounded-pill border border-borde bg-superficie py-2 pl-5 pr-2 shadow-tarjeta transition-colors focus-within:border-acento-borde">
            <Sparkles className="size-[18px] shrink-0 text-decorativo" aria-hidden />
            <input
              id="buscador-portada"
              value={consulta}
              onChange={(evento) => setConsulta(evento.target.value)}
              placeholder="Buscar por hash, cliente o módulo…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-tinta outline-none placeholder:text-tenue"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-acento text-superficie transition-colors hover:bg-acento-fuerte"
            >
              <ArrowRight className="size-[18px]" aria-hidden />
            </button>
          </div>
          <p className="mt-3 text-[13px] text-tenue">
            También con{' '}
            <kbd className="rounded-sm border border-borde bg-superficie-alt px-1.5 py-0.5 font-sans text-[11px] text-grafito">
              Ctrl
            </kbd>{' '}
            +{' '}
            <kbd className="rounded-sm border border-borde bg-superficie-alt px-1.5 py-0.5 font-sans text-[11px] text-grafito">
              K
            </kbd>{' '}
            desde cualquier pantalla
          </p>
        </form>

        <div className="mt-12 w-full">
          {modulos.length > 0 ? (
            <MosaicoModulos modulos={modulos} />
          ) : (
            // Sin permisos, el mosaico queda vacío. Callar sería peor: quien llega
            // aquí necesita saber que no es una falla y a quién pedirle acceso.
            <div className="mx-auto max-w-[460px] rounded-xl border border-borde bg-superficie px-5 py-4 shadow-tarjeta">
              <p className="text-[14px] font-semibold text-tinta">Todavía no tienes módulos</p>
              <p className="mt-1 text-[13px] leading-snug text-grafito">
                Un administrador tiene que darte acceso para que aparezcan aquí y en el menú de
                arriba.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
