'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { cambiarPasswordEsquema, type DatosCambiarPassword } from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Distintivo, EncabezadoPagina } from '@/components/patrones';
import { Boton } from '@/components/ui/boton';
import { Campo, Entrada } from '@/components/ui/campo';
import { ErrorDeApi, peticion } from '@/lib/api/cliente';

import { useSesion } from '@/lib/sesion';

export default function PaginaPerfil() {
  return (
    <Suspense fallback={null}>
      <ContenidoPerfil />
    </Suspense>
  );
}

function ContenidoPerfil() {
  const { data: sesion } = useSesion();
  const parametros = useSearchParams();
  const debeCambiar = parametros.get('cambiar') === '1' || sesion?.usuario.debeCambiarPassword;

  return (
    <>
      <EncabezadoPagina titulo="Mi cuenta" descripcion={sesion?.usuario.email} />

      <div className="max-w-[520px] space-y-8 p-6">
        {debeCambiar && (
          <div
            role="alert"
            className="rounded-[4px] border border-[--color-dorado] bg-[--color-dorado-suave] px-3 py-2.5 text-[13px]"
          >
            Tu contraseña es temporal. Cámbiala para seguir usando el sistema.
          </div>
        )}

        <section className="space-y-3">
          <h2>Verificación en dos pasos</h2>
          <div className="flex items-center gap-3">
            {sesion?.usuario.totpActivado ? (
              <Distintivo tono="exito">Activa</Distintivo>
            ) : (
              <Distintivo tono="alerta">Sin registrar</Distintivo>
            )}
            <p className="text-[13px] text-[--color-texto-suave]">
              {sesion?.usuario.totpActivado
                ? 'Si cambias de teléfono, pídele a un administrador que la reinicie.'
                : 'Se registra la próxima vez que ingreses.'}
            </p>
          </div>
        </section>

        <FormularioPassword />

        <section className="space-y-2 border-t border-[--color-borde] pt-6">
          <h2>Empresas a las que tienes acceso</h2>
          <ul className="space-y-1">
            {(sesion?.empresas ?? []).map((empresa) => (
              <li key={empresa.id} className="flex items-center justify-between text-[13px]">
                <span>{empresa.nombre}</span>
                <span className="cifra text-[--color-texto-suave]">
                  {empresa.nit}-{empresa.digitoVerificacion}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function FormularioPassword() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosCambiarPassword>({
    resolver: zodResolver(cambiarPasswordEsquema),
  });

  const cambiar = useMutation({
    mutationFn: (datos: DatosCambiarPassword) =>
      peticion('auth/password/cambiar', { metodo: 'POST', cuerpo: datos }),
    onSuccess: () => {
      // Cambiar la contraseña revoca todas las sesiones, incluida esta.
      toast.success('Contraseña actualizada. Vuelve a ingresar.');
      router.push('/ingresar');
    },
    onError: (problema) =>
      toast.error(
        problema instanceof ErrorDeApi ? problema.message : 'No se pudo cambiar la contraseña.',
      ),
  });

  return (
    <section className="space-y-3 border-t border-[--color-borde] pt-6">
      <div className="space-y-0.5">
        <h2>Cambiar contraseña</h2>
        <p className="text-[13px] text-[--color-texto-suave]">
          Al cambiarla se cierran todas tus sesiones abiertas, incluida esta.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={handleSubmit((datos) => cambiar.mutate(datos))}
        noValidate
      >
        <Campo
          etiqueta="Contraseña actual"
          htmlFor="passwordActual"
          error={errors.passwordActual?.message}
        >
          <Entrada
            id="passwordActual"
            type="password"
            autoComplete="current-password"
            {...register('passwordActual')}
          />
        </Campo>

        <Campo
          etiqueta="Contraseña nueva"
          htmlFor="passwordNueva"
          error={errors.passwordNueva?.message}
          ayuda="Mínimo 12 caracteres, con mayúscula, minúscula y número."
        >
          <Entrada
            id="passwordNueva"
            type="password"
            autoComplete="new-password"
            {...register('passwordNueva')}
          />
        </Campo>

        <Campo
          etiqueta="Confirmar contraseña"
          htmlFor="confirmacion"
          error={errors.confirmacion?.message}
        >
          <Entrada
            id="confirmacion"
            type="password"
            autoComplete="new-password"
            {...register('confirmacion')}
          />
        </Campo>

        <Boton variante="primario" type="submit" disabled={cambiar.isPending}>
          {cambiar.isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </Boton>
      </form>
    </section>
  );
}
