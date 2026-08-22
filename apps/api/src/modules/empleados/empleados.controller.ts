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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  actualizarEmpleadoEsquema,
  anularReciboEsquema,
  buscarClienteEsquema,
  crearEmpleadoEsquema,
  emitirDocumentoEsquema,
  filtroEmpleadosEsquema,
  liquidarEsquema,
  paginacionEsquema,
  type DatosActualizarEmpleado,
  type DatosAnulacion,
  type DatosCrearEmpleado,
  type DatosEmitirDocumento,
  type DatosLiquidar,
  type DocumentoLaboral,
  type Empleado,
  type FiltroEmpleados,
  type LiquidacionCalculada,
  type ParametrosPaginacion,
  type ReciboDetalle,
  type ReciboResumen,
  type RespuestaPaginada,
  type ResumenEmpleado,
} from '@nexo/shared';
import { Auditar, Permiso, UsuarioActual, type UsuarioAutenticado } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { DocumentosLaboralesService } from './documentos-laborales.service';
import { EmpleadosService } from './empleados.service';
import { NominaService } from './nomina.service';

@Controller('empleados')
@Auditar('Empleado')
export class EmpleadosController {
  constructor(
    private readonly empleados: EmpleadosService,
    private readonly nomina: NominaService,
    private readonly documentos: DocumentosLaboralesService,
  ) {}

  @Get()
  @Permiso('EMPLEADOS', 'ver')
  listar(
    @Query(zod(filtroEmpleadosEsquema)) filtro: FiltroEmpleados,
  ): Promise<RespuestaPaginada<Empleado>> {
    return this.empleados.listar(filtro);
  }

  /** Va antes de `:id`: Nest resuelve en orden y «buscar» caería en el parámetro. */
  @Get('buscar')
  @Permiso('EMPLEADOS', 'ver')
  buscar(
    @Query(zod(buscarClienteEsquema)) { documento }: { documento: string },
  ): Promise<Empleado> {
    return this.empleados.buscarPorDocumento(documento);
  }

  @Get(':id')
  @Permiso('EMPLEADOS', 'ver')
  obtener(@Param('id') id: string): Promise<Empleado> {
    return this.empleados.obtener(id);
  }

  @Get(':id/resumen')
  @Permiso('EMPLEADOS', 'ver')
  resumen(@Param('id') id: string): Promise<ResumenEmpleado> {
    return this.empleados.resumen(id);
  }

  @Post()
  @Permiso('EMPLEADOS', 'editar')
  crear(@Body(zod(crearEmpleadoEsquema)) datos: DatosCrearEmpleado): Promise<Empleado> {
    return this.empleados.crear(datos);
  }

  @Patch(':id')
  @Permiso('EMPLEADOS', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarEmpleadoEsquema)) datos: DatosActualizarEmpleado,
  ): Promise<Empleado> {
    return this.empleados.actualizar(id, datos);
  }

  /** Retira de la nómina; no borra. Sus recibos siguen siendo suyos. */
  @Delete(':id')
  @Permiso('EMPLEADOS', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param('id') id: string): Promise<void> {
    return this.empleados.desactivar(id);
  }

  // ── Nómina ────────────────────────────────────────────────────────────────

  @Get(':id/recibos')
  @Permiso('EMPLEADOS', 'ver')
  recibos(
    @Param('id') id: string,
    @Query(zod(paginacionEsquema)) parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<ReciboResumen>> {
    return this.nomina.listar({ ...parametros, empleadoId: id });
  }

  /** Liquida el período **y emite el recibo**, en una sola transacción. */
  @Post(':id/recibos')
  @Permiso('EMPLEADOS', 'editar')
  liquidar(
    @Param('id') id: string,
    @Body(zod(liquidarEsquema)) datos: DatosLiquidar,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ReciboDetalle> {
    return this.nomina.liquidar(id, datos, usuario);
  }

  // ── Documentos laborales ──────────────────────────────────────────────────

  @Get(':id/documentos')
  @Permiso('EMPLEADOS', 'ver')
  documentosEmitidos(@Param('id') id: string): Promise<DocumentoLaboral[]> {
    return this.documentos.historial(id);
  }

  /**
   * Emite la carta o el certificado **y devuelve el PDF de una vez**.
   *
   * No hay paso intermedio a propósito: nadie emite una carta laboral para
   * descargarla después — la pide y se la lleva. El registro existe para el
   * historial, no como un estado en el que el documento espera.
   */
  @Post(':id/documentos')
  @Permiso('EMPLEADOS', 'editar')
  async emitirDocumento(
    @Param('id') id: string,
    @Body(zod(emitirDocumentoEsquema)) datos: DatosEmitirDocumento,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res() respuesta: Response,
  ): Promise<void> {
    const { archivo, nombre } = await this.documentos.emitir(id, datos, usuario);

    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    respuesta.setHeader('Content-Length', archivo.length);
    respuesta.send(archivo);
  }
}

/** Previsualizar no cuelga de un empleado: totaliza lo que le pasen, sin guardar. */
@Controller('recibos-nomina')
@Auditar('ReciboNomina')
export class RecibosController {
  constructor(private readonly nomina: NominaService) {}

  @Get()
  @Permiso('EMPLEADOS', 'ver')
  listar(
    @Query(zod(paginacionEsquema)) parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<ReciboResumen>> {
    return this.nomina.listar(parametros);
  }

  /**
   * Es un POST aunque no escriba: los conceptos no caben en una URL, y mandarlos
   * por query dejaría los salarios en los logs del proxy.
   */
  @Post('previsualizar')
  @Permiso('EMPLEADOS', 'ver')
  @HttpCode(HttpStatus.OK)
  previsualizar(@Body(zod(liquidarEsquema)) datos: DatosLiquidar): LiquidacionCalculada {
    return this.nomina.previsualizar(datos);
  }

  @Get(':id')
  @Permiso('EMPLEADOS', 'ver')
  obtener(@Param('id') id: string): Promise<ReciboDetalle> {
    return this.nomina.obtener(id);
  }

  @Get(':id/pdf')
  @Permiso('EMPLEADOS', 'ver')
  async descargar(@Param('id') id: string, @Res() respuesta: Response): Promise<void> {
    const { archivo, nombre } = await this.nomina.generarPdf(id);

    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    respuesta.setHeader('Content-Length', archivo.length);
    respuesta.send(archivo);
  }

  /** Anular exige el consecutivo escrito a mano, como todo documento legal. */
  @Post(':id/anular')
  @Permiso('EMPLEADOS', 'editar')
  anular(
    @Param('id') id: string,
    @Body(zod(anularReciboEsquema)) datos: DatosAnulacion,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ReciboDetalle> {
    return this.nomina.anular(id, datos, usuario);
  }
}
