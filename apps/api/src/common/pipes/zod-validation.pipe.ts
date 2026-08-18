import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valida con el mismo esquema Zod que usa el frontend (packages/shared).
 *
 * La validación del cliente es comodidad; esta es el control real. El pipe deja
 * pasar el ZodError tal cual: el filtro de excepciones lo convierte en la respuesta
 * con los mensajes por campo, en español.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodSchema<T>) {}

  transform(valor: unknown): T {
    return this.esquema.parse(valor);
  }
}

/** Azúcar para usarlo en los parámetros: `@Body(zod(crearEmpresaEsquema))`. */
export const zod = <T>(esquema: ZodSchema<T>) => new ZodValidationPipe(esquema);
