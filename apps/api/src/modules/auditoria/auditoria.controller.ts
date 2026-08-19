import { Controller, Get, Query } from '@nestjs/common';
import {
  filtroAuditoriaEsquema,
  type FiltroAuditoria,
  type RegistroAuditoria,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Permiso } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { AuditoriaService } from './auditoria.service';

/**
 * A diferencia del resto de administración, este controlador **sí** exige empresa
 * activa: el historial se consulta por empresa, y esa es la garantía de que desde
 * una no se lee el de otra.
 */
@Controller('auditoria')
@Permiso('ADMINISTRACION', 'ver')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(
    @Query(zod(filtroAuditoriaEsquema)) filtro: FiltroAuditoria,
  ): Promise<RespuestaPaginada<RegistroAuditoria>> {
    return this.auditoria.listar(filtro);
  }
}
