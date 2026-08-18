import { z } from 'zod';
import { idEsquema, paginacionEsquema, rangoFechasEsquema } from './comunes.js';
import { accionAuditEsquema } from '../enums/index.js';

export const filtroAuditoriaEsquema = paginacionEsquema
  .extend({
    usuarioId: idEsquema.optional(),
    accion: accionAuditEsquema.optional(),
    entidad: z.string().trim().max(60).optional(),
    entidadId: z.string().trim().max(60).optional(),
  })
  .and(rangoFechasEsquema);

export type FiltroAuditoria = z.infer<typeof filtroAuditoriaEsquema>;

export interface RegistroAuditoria {
  id: string;
  accion: z.infer<typeof accionAuditEsquema>;
  entidad: string;
  entidadId: string | null;
  usuario: { id: string; nombre: string } | null;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}
