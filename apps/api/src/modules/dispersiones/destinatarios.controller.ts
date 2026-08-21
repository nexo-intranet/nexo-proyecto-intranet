import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  actualizarDestinatarioEsquema,
  crearDestinatarioEsquema,
  filtroDestinatariosEsquema,
  type DatosActualizarDestinatario,
  type DatosCrearDestinatario,
  type Destinatario,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Auditar, Permiso } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { DestinatariosService } from './destinatarios.service';

/**
 * Catálogo de destinatarios. No hay endpoint que devuelva el documento ni la cuenta
 * completos: de ahí solo salen los últimos cuatro dígitos (docs/SEGURIDAD.md §5).
 */
@Controller('destinatarios')
@Auditar('Destinatario')
export class DestinatariosController {
  constructor(private readonly destinatarios: DestinatariosService) {}

  @Get()
  @Permiso('OPERACIONES', 'ver')
  listar(
    @Query(zod(filtroDestinatariosEsquema)) filtro: ParametrosPaginacion & { activo?: boolean },
  ): Promise<RespuestaPaginada<Destinatario>> {
    return this.destinatarios.listar(filtro);
  }

  @Get(':id')
  @Permiso('OPERACIONES', 'ver')
  obtener(@Param('id') id: string): Promise<Destinatario> {
    return this.destinatarios.obtener(id);
  }

  @Post()
  @Permiso('OPERACIONES', 'editar')
  crear(@Body(zod(crearDestinatarioEsquema)) datos: DatosCrearDestinatario): Promise<Destinatario> {
    return this.destinatarios.crear(datos);
  }

  @Patch(':id')
  @Permiso('OPERACIONES', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarDestinatarioEsquema)) datos: DatosActualizarDestinatario,
  ): Promise<Destinatario> {
    return this.destinatarios.actualizar(id, datos);
  }

  @Delete(':id')
  @Permiso('OPERACIONES', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param('id') id: string): Promise<void> {
    return this.destinatarios.desactivar(id);
  }
}
