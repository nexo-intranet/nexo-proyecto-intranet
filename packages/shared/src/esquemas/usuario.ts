import { z } from 'zod';
import { emailEsquema, idEsquema, textoRequerido } from './comunes.js';
import { moduloSistemaEsquema, nombreRolEsquema } from '../enums/index.js';

export const crearUsuarioEsquema = z.object({
  nombre: textoRequerido('El nombre', 150),
  email: emailEsquema,
  rol: nombreRolEsquema,
  empresaIds: z.array(idEsquema).min(1, 'Asigna al menos una empresa').max(100),
  permisos: z
    .array(
      z.object({
        modulo: moduloSistemaEsquema,
        puedeVer: z.boolean(),
        puedeEditar: z.boolean(),
      }),
    )
    .default([])
    // Poder editar sin poder ver no significa nada y esconde errores de captura.
    .refine(
      (permisos) => permisos.every((p) => !p.puedeEditar || p.puedeVer),
      'Un módulo no puede tener permiso de edición sin permiso de lectura',
    ),
});

export type DatosCrearUsuario = z.infer<typeof crearUsuarioEsquema>;

export const actualizarUsuarioEsquema = z.object({
  nombre: textoRequerido('El nombre', 150).optional(),
  rol: nombreRolEsquema.optional(),
  activo: z.boolean().optional(),
});

/** Reemplaza el conjunto completo de permisos: no es un parche incremental. */
export const asignarPermisosEsquema = crearUsuarioEsquema.shape.permisos;

/** Reemplaza el conjunto completo de empresas accesibles. */
export const asignarEmpresasEsquema = z.object({
  empresaIds: z.array(idEsquema).min(1, 'El usuario debe tener acceso al menos a una empresa'),
});

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: z.infer<typeof nombreRolEsquema>;
  activo: boolean;
  totpActivado: boolean;
  ultimoAcceso: string | null;
  empresas: Array<{ id: string; nombre: string }>;
  permisos: Array<{
    modulo: z.infer<typeof moduloSistemaEsquema>;
    puedeVer: boolean;
    puedeEditar: boolean;
  }>;
}

/**
 * La contraseña temporal se devuelve UNA sola vez, al crear el usuario o al
 * reiniciarla. No se guarda en claro, no se envía por correo (Etapa 1) y no
 * vuelve a estar disponible. Ver docs/ARQUITECTURA.md §5.6.
 */
export interface UsuarioCreado {
  usuario: Usuario;
  passwordTemporal: string;
}
