import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  guardarReglaEsquema,
  paginacionEsquema,
  type DatosGuardarRegla,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Auditar, Permiso } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { ReglasService, type ReglaVista } from './reglas.service';

/**
 * `PUT` y no `PATCH`: una regla se guarda entera, con todos sus destinos. Media
 * regla de porcentajes no reparte mal a medias — reparte mal.
 */
@Controller('reglas-dispersion')
@Auditar('ReglaDispersion')
export class ReglasController {
  constructor(private readonly reglas: ReglasService) {}

  @Get()
  @Permiso('OPERACIONES', 'ver')
  listar(
    @Query(zod(paginacionEsquema)) filtro: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<ReglaVista>> {
    return this.reglas.listar(filtro);
  }

  @Get(':id')
  @Permiso('OPERACIONES', 'ver')
  obtener(@Param('id') id: string): Promise<ReglaVista> {
    return this.reglas.obtener(id);
  }

  @Post()
  @Permiso('OPERACIONES', 'editar')
  crear(@Body(zod(guardarReglaEsquema)) datos: DatosGuardarRegla): Promise<ReglaVista> {
    return this.reglas.crear(datos);
  }

  @Put(':id')
  @Permiso('OPERACIONES', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(guardarReglaEsquema)) datos: DatosGuardarRegla,
  ): Promise<ReglaVista> {
    return this.reglas.actualizar(id, datos);
  }

  @Delete(':id')
  @Permiso('OPERACIONES', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param('id') id: string): Promise<void> {
    return this.reglas.desactivar(id);
  }
}
