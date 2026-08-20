'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { iniciarSesionEsquema, type DatosIniciarSesion, type RespuestaIngreso } from '@nexo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';
import { guardarReto } from '@/lib/reto';

export default function PaginaIngresar() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosIniciarSesion>({
    resolver: zodResolver(iniciarSesionEsquema),
    defaultValues: { email: '', password: '' },
  });

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null);
    try {
      const respuesta = await peticion<RespuestaIngreso>('auth/ingresar', {
        metodo: 'POST',
        cuerpo: datos,
      });

      // El ingreso nunca entrega sesión: solo el reto del segundo factor.
      guardarReto(respuesta.tokenReto, respuesta.debeRegistrar2fa);
      router.push('/verificar');
    } catch (error) {
      setErrorGeneral(
        error instanceof ErrorDeApi ? error.message : 'No se pudo conectar con el servidor.',
      );
    }
  });

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <div className="space-y-1">
        <h1>Ingresar</h1>
        <p className="text-[13px] text-grafito">
          Usa el correo con el que te registró un administrador.
        </p>
      </div>

      <Campo etiqueta="Correo" htmlFor="email" error={errors.email?.message}>
        <Entrada id="email" type="email" autoComplete="username" autoFocus {...register('email')} />
      </Campo>

      <Campo etiqueta="Contraseña" htmlFor="password" error={errors.password?.message}>
        <Entrada
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Campo>

      {errorGeneral && (
        <p
          role="alert"
          className="rounded-[4px] border border-peligro bg-[#fef2f2] px-3 py-2 text-[13px] text-peligro"
        >
          {errorGeneral}
        </p>
      )}

      <Boton
        type="submit"
        variante="primario"
        tamano="grande"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Verificando…' : 'Continuar'}
      </Boton>

      <p className="text-[12px] text-grafito">
        Después de la contraseña se pide un código de verificación. Si perdiste el acceso, pídele a
        un administrador que reinicie tu verificación en dos pasos.
      </p>
    </form>
  );
}
