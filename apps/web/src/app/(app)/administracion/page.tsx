import { redirect } from 'next/navigation';

/** El módulo de administración abre en empresas. */
export default function AdministracionRaiz() {
  redirect('/administracion/empresas');
}
