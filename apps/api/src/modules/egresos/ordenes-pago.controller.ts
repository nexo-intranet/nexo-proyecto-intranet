import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  anularEgresoEsquema,
  filtroOrdenesEsquema,
  reemitirOrdenEsquema,
  type DatosAnularEgreso,
  type DatosReemitirOrden,
  type OrdenPagoDetalle,
  type OrdenPagoResumen,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Auditar, Permiso, UsuarioActual, type UsuarioAutenticado } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { OrdenesPagoService } from './ordenes-pago.service';

/**
 * `POST /ordenes-pago` no existe: una orden nace de un egreso, nunca suelta.
 * Lo que se puede hacer con ella es consultarla, descargarla, anularla y —una vez
 * anulada— reemitirla.
 */
@Controller('ordenes-pago')
@Auditar('OrdenPago')
export class OrdenesPagoController {
  constructor(private readonly ordenes: OrdenesPagoService) {}

  @Get()
  @Permiso('EGRESOS', 'ver')
  listar(
    @Query(zod(filtroOrdenesEsquema))
    filtro: ParametrosPaginacion & { estado?: 'VIGENTE' | 'ANULADA'; desde?: Date; hasta?: Date },
  ): Promise<RespuestaPaginada<OrdenPagoResumen>> {
    return this.ordenes.listar(filtro);
  }

  @Get(':id')
  @Permiso('EGRESOS', 'ver')
  obtener(@Param('id') id: string): Promise<OrdenPagoDetalle> {
    return this.ordenes.obtener(id);
  }

  /**
   * El PDF se sirve siempre por el backend, que verifica permisos y empresa antes
   * de generar un byte. Nunca por enlace directo (brief §4.13).
   */
  @Get(':id/pdf')
  @Permiso('EGRESOS', 'ver')
  async descargar(@Param('id') id: string, @Res() respuesta: Response): Promise<void> {
    const { archivo, nombre } = await this.ordenes.generarPdf(id);

    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    respuesta.setHeader('Content-Length', archivo.length);
    respuesta.send(archivo);
  }

  @Post(':id/anular')
  @Permiso('EGRESOS', 'editar')
  anular(
    @Param('id') id: string,
    @Body(zod(anularEgresoEsquema)) datos: DatosAnularEgreso,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<OrdenPagoDetalle> {
    return this.ordenes.anular(id, datos, usuario);
  }

  @Post(':id/reemitir')
  @Permiso('EGRESOS', 'editar')
  reemitir(
    @Param('id') id: string,
    @Body(zod(reemitirOrdenEsquema)) datos: DatosReemitirOrden,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<OrdenPagoDetalle> {
    return this.ordenes.reemitir(id, datos, usuario);
  }
}
