import { z } from 'zod';

/**
 * Espejo de los enums de Prisma. Se declaran aquí como `const` para poder usarlos
 * en el frontend sin importar `@prisma/client`, que es código de servidor.
 *
 * Si se agrega un valor en `schema.prisma`, se agrega aquí. Los tests de tipos
 * del API fallan si los dos se desincronizan.
 */

export const MODULOS = [
  'OPERACIONES',
  'EGRESOS',
  'EMPLEADOS',
  'CONTABILIDAD',
  'CUMPLIMIENTO',
  'CLIENTES',
  'ADMINISTRACION',
] as const;
export type ModuloSistema = (typeof MODULOS)[number];
export const moduloSistemaEsquema = z.enum(MODULOS);

export const NOMBRES_ROL = ['ADMINISTRADOR', 'EQUIPO_INTERNO'] as const;
export type NombreRol = (typeof NOMBRES_ROL)[number];
export const nombreRolEsquema = z.enum(NOMBRES_ROL);

export const TIPOS_CONTRIBUYENTE = [
  'GRAN_CONTRIBUYENTE',
  'PERSONA_JURIDICA',
  'PERSONA_NATURAL',
  'REGIMEN_SIMPLE',
  'NO_RESPONSABLE_IVA',
] as const;
export type TipoContribuyente = (typeof TIPOS_CONTRIBUYENTE)[number];
export const tipoContribuyenteEsquema = z.enum(TIPOS_CONTRIBUYENTE);

export const ETIQUETA_TIPO_CONTRIBUYENTE: Record<TipoContribuyente, string> = {
  GRAN_CONTRIBUYENTE: 'Gran contribuyente',
  PERSONA_JURIDICA: 'Persona jurídica',
  PERSONA_NATURAL: 'Persona natural',
  REGIMEN_SIMPLE: 'Régimen simple de tributación',
  NO_RESPONSABLE_IVA: 'No responsable de IVA',
};

export const TIPOS_DOCUMENTO = ['CC', 'CE', 'NIT', 'PASAPORTE', 'PPT'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const tipoDocumentoEsquema = z.enum(TIPOS_DOCUMENTO);

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  PPT: 'Permiso por protección temporal',
};

export const MONEDAS = ['COP', 'USD', 'USDT'] as const;
export type Moneda = (typeof MONEDAS)[number];
export const monedaEsquema = z.enum(MONEDAS);

/** Monedas que se manejan con dos decimales; el resto son cripto (18 decimales). */
export const MONEDAS_FIAT: readonly Moneda[] = ['COP', 'USD'];

export const TIPOS_CONSECUTIVO = ['ORDEN_PAGO', 'FACTURA', 'RECIBO_NOMINA'] as const;
export type TipoConsecutivo = (typeof TIPOS_CONSECUTIVO)[number];
export const tipoConsecutivoEsquema = z.enum(TIPOS_CONSECUTIVO);

export const ACCIONES_AUDIT = [
  'CREAR',
  'ACTUALIZAR',
  'ANULAR',
  'ELIMINAR',
  'INGRESAR',
  'SALIR',
  'INGRESO_FALLIDO',
  'EXPORTAR',
  'CAMBIAR_EMPRESA',
  'LLAMADA_EXTERNA',
] as const;
export type AccionAudit = (typeof ACCIONES_AUDIT)[number];
export const accionAuditEsquema = z.enum(ACCIONES_AUDIT);

export const ETIQUETA_ACCION_AUDIT: Record<AccionAudit, string> = {
  CREAR: 'Creó',
  ACTUALIZAR: 'Actualizó',
  ANULAR: 'Anuló',
  ELIMINAR: 'Eliminó',
  INGRESAR: 'Ingresó',
  SALIR: 'Cerró sesión',
  INGRESO_FALLIDO: 'Intento de ingreso fallido',
  EXPORTAR: 'Exportó',
  CAMBIAR_EMPRESA: 'Cambió de empresa',
  LLAMADA_EXTERNA: 'Llamada a servicio externo',
};
