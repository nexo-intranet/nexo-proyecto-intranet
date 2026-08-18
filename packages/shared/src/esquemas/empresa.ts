import { z } from 'zod';
import { emailEsquema, textoRequerido } from './comunes.js';
import { tipoContribuyenteEsquema } from '../enums/index.js';
import { calcularDigitoVerificacion, soloDigitos } from '../utilidades/nit.js';

export const nitEsquema = z
  .string({ required_error: 'El NIT es obligatorio' })
  .trim()
  .transform(soloDigitos)
  .refine(
    (valor) => valor.length >= 6 && valor.length <= 15,
    'El NIT debe tener entre 6 y 15 dígitos',
  );

export const crearEmpresaEsquema = z
  .object({
    nombre: textoRequerido('La razón social'),
    nombreComercial: z.string().trim().max(200).optional(),
    nit: nitEsquema,
    digitoVerificacion: z.coerce
      .number()
      .int()
      .min(0, 'El dígito de verificación va de 0 a 9')
      .max(9, 'El dígito de verificación va de 0 a 9'),
    tipoContribuyente: tipoContribuyenteEsquema,
    municipio: textoRequerido('El municipio', 120),
    codigoDaneMunicipio: z.string().trim().max(10).optional(),
    direccion: z.string().trim().max(200).optional(),
    telefono: z.string().trim().max(40).optional(),
    email: emailEsquema.optional(),
  })
  // El dígito de verificación es calculable: si no cuadra, casi siempre es un
  // NIT mal digitado, y ese error se propaga a facturas y reportes a la DIAN.
  .refine(({ nit, digitoVerificacion }) => calcularDigitoVerificacion(nit) === digitoVerificacion, {
    message: 'El dígito de verificación no corresponde al NIT',
    path: ['digitoVerificacion'],
  });

export type DatosCrearEmpresa = z.infer<typeof crearEmpresaEsquema>;

export const actualizarEmpresaEsquema = crearEmpresaEsquema
  .innerType()
  .partial()
  .extend({ activa: z.boolean().optional() });

export type DatosActualizarEmpresa = z.infer<typeof actualizarEmpresaEsquema>;

export interface Empresa {
  id: string;
  nombre: string;
  nombreComercial: string | null;
  nit: string;
  digitoVerificacion: number;
  tipoContribuyente: z.infer<typeof tipoContribuyenteEsquema>;
  municipio: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  logoUrl: string | null;
  esNexo: boolean;
  activa: boolean;
}
