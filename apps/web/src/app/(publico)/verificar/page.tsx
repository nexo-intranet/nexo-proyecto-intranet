'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { borrarReto, leerReto } from '@/lib/reto';

type Paso = 'cargando' | 'codigo' | 'registrar' | 'respaldo' | 'codigosRespaldo';

/**
 * Segundo factor.
 *
 * Cubre los dos caminos: quien ya tiene el 2FA registrado ingresa su código, y
 * quien entra por primera vez lo registra aquí mismo. Ambos usan el token de reto,
 * porque todavía no existe sesión.
 */
export default function PaginaVerificar() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>('cargando');
  const [token, setToken] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigosRespaldo, setCodigosRespaldo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const { token: guardado, debeRegistrar2fa } = leerReto();
    if (!guardado) {
      router.replace('/ingresar');
      return;
    }
    setToken(guardado);
    setPaso(debeRegistrar2fa ? 'registrar' : 'codigo');
  }, [router]);

  useEffect(() => {
    if (paso !== 'registrar' || !token || qr) return;

    void (async () => {
      try {
        const respuesta = await peticion<{ secreto: string; qr: string }>('auth/2fa/iniciar', {
          metodo: 'POST',
          cuerpo: { tokenReto: token },
        });
        setQr(respuesta.qr);
        setSecreto(respuesta.secreto);
      } catch (problema) {
        setError(
          problema instanceof ErrorDeApi ? problema.message : 'No se pudo generar el código.',
        );
      }
    })();
  }, [paso, token, qr]);

  const entrar = async (ruta: string, cuerpo: Record<string, unknown>) => {
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await peticion<{ codigosRespaldo?: string[] }>(ruta, {
        metodo: 'POST',
        cuerpo,
      });
      borrarReto();

      if (respuesta?.codigosRespaldo?.length) {
        setCodigosRespaldo(respuesta.codigosRespaldo);
        setPaso('codigosRespaldo');
        return;
      }
      router.push('/');
    } catch (problema) {
      setError(
        problema instanceof ErrorDeApi ? problema.message : 'No se pudo verificar el código.',
      );
    } finally {
      setEnviando(false);
    }
  };

  if (paso === 'cargando') {
    return <div className="h-32 animate-pulse rounded-[4px] bg-[--color-superficie-alt]" />;
  }

  // Los códigos de respaldo se muestran una única vez. Después solo existen como hash.
  if (paso === 'codigosRespaldo') {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1>Guarda estos códigos</h1>
          <p className="text-[13px] text-[--color-texto-suave]">
            Sirven para entrar si pierdes el teléfono. Cada uno funciona una sola vez y no volverás
            a verlos.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 rounded-[4px] border border-[--color-borde] bg-[--color-superficie-alt] p-3">
          {codigosRespaldo.map((respaldo) => (
            <li key={respaldo} className="cifra text-center">
              {respaldo}
            </li>
          ))}
        </ul>

        <Boton
          variante="primario"
          tamano="grande"
          className="w-full"
          onClick={() => router.push('/')}
        >
          Ya los guardé, continuar
        </Boton>
      </div>
    );
  }

  const esRegistro = paso === 'registrar';
  const esRespaldo = paso === 'respaldo';

  return (
    <form
      className="space-y-5"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!token) return;
        if (esRegistro) return void entrar('auth/2fa/confirmar', { tokenReto: token, codigo });
        void entrar('auth/2fa/verificar', {
          tokenReto: token,
          ...(esRespaldo ? { codigoRespaldo: codigo } : { codigo }),
        });
      }}
    >
      <div className="space-y-1">
        <h1>{esRegistro ? 'Configura la verificación' : 'Verificación en dos pasos'}</h1>
        <p className="text-[13px] text-[--color-texto-suave]">
          {esRegistro
            ? 'Escanea el código con tu aplicación de autenticación y escribe el número que aparece.'
            : esRespaldo
              ? 'Escribe uno de los códigos de respaldo que guardaste.'
              : 'Escribe el código de seis dígitos de tu aplicación de autenticación.'}
        </p>
      </div>

      {esRegistro && qr && (
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="Código QR para la aplicación de autenticación"
            className="mx-auto rounded-[4px] border border-[--color-borde]"
            width={200}
            height={200}
          />
          {secreto && (
            <p className="cifra break-all text-[--color-texto-suave]">
              ¿No puedes escanear? Escribe: {secreto}
            </p>
          )}
        </div>
      )}

      <Campo
        etiqueta={esRespaldo ? 'Código de respaldo' : 'Código'}
        htmlFor="codigo"
        error={error ?? undefined}
      >
        <Entrada
          id="codigo"
          autoFocus
          autoComplete="one-time-code"
          inputMode={esRespaldo ? 'text' : 'numeric'}
          placeholder={esRespaldo ? 'XXXX-XXXX' : '000000'}
          className="cifra text-center tracking-[0.3em]"
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
        />
      </Campo>

      <Boton
        type="submit"
        variante="primario"
        tamano="grande"
        className="w-full"
        disabled={enviando || codigo.length < 6}
      >
        {enviando ? 'Verificando…' : esRegistro ? 'Activar y entrar' : 'Entrar'}
      </Boton>

      {!esRegistro && (
        <Boton
          type="button"
          variante="fantasma"
          className="w-full"
          onClick={() => {
            setCodigo('');
            setError(null);
            setPaso(esRespaldo ? 'codigo' : 'respaldo');
          }}
        >
          {esRespaldo ? 'Usar la aplicación de autenticación' : 'Usar un código de respaldo'}
        </Boton>
      )}
    </form>
  );
}
