import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  anularEgresoEsquema,
  corregirEgresoEsquema,
  crearEgresoEsquema,
  filtroEgresosEsquema,
  resumenEgresosEsquema,
  type DatosAnularEgreso,
  type DatosCorregirEgreso,
  type DatosCrearEgreso,
  type EgresoDetalle,
  type EgresoResumen,
  type FiltroEgresos,
  type RespuestaPaginada,
  type ResumenEgresos,
} from '@nexo/shared';
import { Auditar, Permiso, UsuarioActual, type UsuarioAutenticado } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { EgresosService } from './egresos.service';

/**
 * No hay `DELETE`. Un egreso no se borra: se anula, con motivo y con el
 * consecutivo de su orden escrito a mano. El endpoint que falta es parte del
 * diseño (brief §4.3).
 */
@Controller('egresos')
@Auditar('Egreso')
export class EgresosController {
  constructor(private readonly egresos: EgresosService) {}

  @Get()
  @Permiso('EGRESOS', 'ver')
  listar(
    @Query(zod(filtroEgresosEsquema)) filtro: FiltroEgresos,
  ): Promise<RespuestaPaginada<EgresoResumen>> {
    return this.egresos.listar(filtro);
  }

  /** Va antes de `:id`: Nest resuelve en orden y «resumen» caería en el parámetro. */
  @Get('resumen')
  @Permiso('EGRESOS', 'ver')
  resumen(
    @Query(zod(resumenEgresosEsquema)) rango: { desde?: Date; hasta?: Date },
  ): Promise<ResumenEgresos> {
    return this.egresos.resumen(rango);
  }

  @Get(':id')
  @Permiso('EGRESOS', 'ver')
  obtener(@Param('id') id: string): Promise<EgresoDetalle> {
    return this.egresos.obtener(id);
  }

  @Post()
  @Permiso('EGRESOS', 'editar')
  crear(
    @Body(zod(crearEgresoEsquema)) datos: DatosCrearEgreso,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<EgresoDetalle> {
    return this.egresos.crear(datos, usuario);
  }

  /** Corregir anula la orden vigente y emite una nueva. Por eso exige motivo. */
  @Patch(':id')
  @Permiso('EGRESOS', 'editar')
  corregir(
    @Param('id') id: string,
    @Body(zod(corregirEgresoEsquema)) datos: DatosCorregirEgreso,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<EgresoDetalle> {
    return this.egresos.corregir(id, datos, usuario);
  }

  @Post(':id/anular')
  @Permiso('EGRESOS', 'editar')
  anular(
    @Param('id') id: string,
    @Body(zod(anularEgresoEsquema)) datos: DatosAnularEgreso,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<EgresoDetalle> {
    return this.egresos.anular(id, datos, usuario);
  }
}
