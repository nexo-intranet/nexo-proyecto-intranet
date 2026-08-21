import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  actualizarOperacionEsquema,
  anularOperacionEsquema,
  buscarPorHashEsquema,
  crearOperacionEsquema,
  filtroOperacionesEsquema,
  resumenOperacionesEsquema,
  type DatosActualizarOperacion,
  type DatosAnularOperacion,
  type DatosCrearOperacion,
  type FiltroOperaciones,
  type OperacionDetalle,
  type OperacionResumen,
  type RespuestaPaginada,
  type ResumenOperaciones,
} from '@nexo/shared';
import { Auditar, Permiso, UsuarioActual, type UsuarioAutenticado } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { OperacionesService } from './operaciones.service';

/**
 * No hay `DELETE`. Una operación no se borra: se anula, con motivo, y se conserva
 * (brief §4.3). El endpoint que falta es parte del diseño.
 */
@Controller('operaciones')
@Auditar('Operacion')
export class OperacionesController {
  constructor(private readonly operaciones: OperacionesService) {}

  @Get()
  @Permiso('OPERACIONES', 'ver')
  listar(
    @Query(zod(filtroOperacionesEsquema)) filtro: FiltroOperaciones,
  ): Promise<RespuestaPaginada<OperacionResumen>> {
    return this.operaciones.listar(filtro);
  }

  /**
   * Buscador por hash. Va antes de `:id` a propósito: Nest resuelve las rutas en
   * orden y `buscar` caería en el parámetro si estuviera después.
   */
  @Get('buscar')
  @Permiso('OPERACIONES', 'ver')
  buscar(
    @Query(zod(buscarPorHashEsquema)) { hash }: { hash: string },
  ): Promise<OperacionResumen[]> {
    return this.operaciones.buscarPorHash(hash);
  }

  /** Totales del período para el tablero. También antes de `:id`. */
  @Get('resumen')
  @Permiso('OPERACIONES', 'ver')
  resumen(
    @Query(zod(resumenOperacionesEsquema)) rango: { desde?: Date; hasta?: Date },
  ): Promise<ResumenOperaciones> {
    return this.operaciones.resumen(rango);
  }

  @Get(':id')
  @Permiso('OPERACIONES', 'ver')
  obtener(@Param('id') id: string): Promise<OperacionDetalle> {
    return this.operaciones.obtener(id);
  }

  @Post()
  @Permiso('OPERACIONES', 'editar')
  crear(@Body(zod(crearOperacionEsquema)) datos: DatosCrearOperacion): Promise<OperacionDetalle> {
    return this.operaciones.crear(datos);
  }

  @Patch(':id')
  @Permiso('OPERACIONES', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarOperacionEsquema)) datos: DatosActualizarOperacion,
  ): Promise<OperacionDetalle> {
    return this.operaciones.actualizar(id, datos);
  }

  @Post(':id/anular')
  @Permiso('OPERACIONES', 'editar')
  anular(
    @Param('id') id: string,
    @Body(zod(anularOperacionEsquema)) datos: DatosAnularOperacion,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<OperacionDetalle> {
    return this.operaciones.anular(id, datos, usuario);
  }
}
