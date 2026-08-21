import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  actualizarDispersionEsquema,
  crearDispersionEsquema,
  ejecutarDestinoEsquema,
  filtroDispersionesEsquema,
  previsualizarDispersionEsquema,
  revertirDestinoEsquema,
  type DatosCrearDispersion,
  type DatosEjecutarDestino,
  type DatosRevertirDestino,
  type DispersionVista,
  type EstadoDispersion,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Auditar, Permiso } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { DispersionesService, type PrevisualizacionDispersion } from './dispersiones.service';

@Controller('dispersiones')
@Auditar('Dispersion')
export class DispersionesController {
  constructor(private readonly dispersiones: DispersionesService) {}

  @Get()
  @Permiso('OPERACIONES', 'ver')
  listar(
    @Query(zod(filtroDispersionesEsquema))
    filtro: ParametrosPaginacion & { estado?: EstadoDispersion },
  ): Promise<RespuestaPaginada<DispersionVista>> {
    return this.dispersiones.listar(filtro);
  }

  @Get(':id')
  @Permiso('OPERACIONES', 'ver')
  obtener(@Param('id') id: string): Promise<DispersionVista> {
    return this.dispersiones.obtener(id);
  }

  @Patch(':id')
  @Permiso('OPERACIONES', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarDispersionEsquema)) datos: DatosCrearDispersion,
  ): Promise<DispersionVista> {
    return this.dispersiones.actualizar(id, datos);
  }

  /** Conciliación: el giro salió, y esta es su referencia de pago. */
  @Post(':id/destinos/:destinoId/ejecutar')
  @Permiso('OPERACIONES', 'editar')
  ejecutar(
    @Param('id') id: string,
    @Param('destinoId') destinoId: string,
    @Body(zod(ejecutarDestinoEsquema)) datos: DatosEjecutarDestino,
  ): Promise<DispersionVista> {
    return this.dispersiones.ejecutarDestino(id, destinoId, datos);
  }

  /** El giro se devolvió. Deshace la conciliación y exige explicación. */
  @Post(':id/destinos/:destinoId/revertir')
  @Permiso('OPERACIONES', 'editar')
  revertir(
    @Param('id') id: string,
    @Param('destinoId') destinoId: string,
    @Body(zod(revertirDestinoEsquema)) datos: DatosRevertirDestino,
  ): Promise<DispersionVista> {
    return this.dispersiones.revertirDestino(id, destinoId, datos);
  }
}

/**
 * La dispersión de una operación.
 *
 * Vive bajo `/operaciones/:operacionId` porque no existe suelta: una dispersión es
 * el reparto *de* una operación, y hay a lo sumo una por operación.
 *
 * `previsualizar` también cuelga de aquí, y no de una dispersión, por una razón
 * práctica: se usa **antes** de que la dispersión exista, que es justo cuando el
 * usuario quiere ver los números y el cuadre antes de comprometerse.
 */
@Controller('operaciones/:operacionId/dispersion')
@Auditar('Dispersion')
export class DispersionDeOperacionController {
  constructor(private readonly dispersiones: DispersionesService) {}

  @Get()
  @Permiso('OPERACIONES', 'ver')
  obtener(@Param('operacionId') operacionId: string): Promise<DispersionVista> {
    return this.dispersiones.obtenerDeOperacion(operacionId);
  }

  @Post()
  @Permiso('OPERACIONES', 'editar')
  crear(
    @Param('operacionId') operacionId: string,
    @Body(zod(crearDispersionEsquema)) datos: DatosCrearDispersion,
  ): Promise<DispersionVista> {
    return this.dispersiones.crear(operacionId, datos);
  }

  /**
   * Calcula el reparto sin guardar nada.
   *
   * Es un POST aunque no escriba: los datos del reparto no caben en una URL, y
   * mandarlos por query dejaría montos y destinatarios en los logs del proxy.
   */
  @Post('previsualizar')
  @Permiso('OPERACIONES', 'ver')
  previsualizar(
    @Param('operacionId') operacionId: string,
    @Body(zod(previsualizarDispersionEsquema)) datos: DatosCrearDispersion,
  ): Promise<PrevisualizacionDispersion> {
    return this.dispersiones.previsualizar(operacionId, datos);
  }
}
