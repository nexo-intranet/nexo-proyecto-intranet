/**
 * `empresaId` en las escrituras.
 *
 * Ningún servicio lo pone: lo inyecta la extensión de aislamiento en cada `create`,
 * tomándolo del contexto de la petición (docs/SEGURIDAD.md §1). Que el servicio no
 * pueda elegir la empresa es justamente el punto — si pudiera, la primera capa de
 * aislamiento dependería de que nadie se equivoque al escribirla.
 *
 * El tipo que genera Prisma no conoce la extensión y sigue exigiendo el campo. Este
 * helper es el único lugar del sistema donde esa diferencia se resuelve, con nombre
 * propio, en vez de repartir castas anónimas por los módulos.
 */
export function conEmpresaImplicita<T extends object>(data: T): T & { empresaId: string } {
  return data as T & { empresaId: string };
}
