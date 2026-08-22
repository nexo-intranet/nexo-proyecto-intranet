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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  actualizarGastoEsquema,
  consultarCalendarioEsquema,
  crearGastoEsquema,
  crearSolicitudEsquema,
  filtroGastosEsquema,
  filtroSolicitudesEsquema,
  importarCalendarioEsquema,
  resumenEgresosEsquema,
  type DatosActualizarGasto,
  type DatosCrearGasto,
  type DatosCrearSolicitud,
  type DatosImportarCalendario,
  type FechaCalendario,
  type FiltroGastos,
  type Gasto,
  type ImportacionCalendario,
  type ParametrosPaginacion,
  type PrevisualizacionCalendario,
  type RespuestaPaginada,
  type ResumenGastos,
  type SolicitudDocumento,
} from '@nexo/shared';
import { Auditar, Permiso, UsuarioActual, type UsuarioAutenticado } from '../../common/decoradores';
import { TAMANO_MAXIMO } from '../../core/archivos/archivos.service';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { CalendarioService } from './calendario.service';
import { GastosService } from './gastos.service';
import { SolicitudesService } from './solicitudes.service';

/**
 * El límite se declara también en multer, no solo en el servicio.
 *
 * Sin esto, un archivo de 500 MB se recibe entero en memoria antes de que nadie lo
 * mire. Rechazarlo al aceptar la conexión es lo barato; rechazarlo después de
 * haberlo leído ya costó la memoria.
 */
const LIMITES = { limits: { fileSize: TAMANO_MAXIMO, files: 1 } };

@Controller('gastos')
@Auditar('Gasto')
export class GastosController {
  constructor(private readonly gastos: GastosService) {}

  @Get()
  @Permiso('CONTABILIDAD', 'ver')
  listar(@Query(zod(filtroGastosEsquema)) filtro: FiltroGastos): Promise<RespuestaPaginada<Gasto>> {
    return this.gastos.listar(filtro);
  }

  /** Va antes de `:id`: Nest resuelve en orden y «resumen» caería en el parámetro. */
  @Get('resumen')
  @Permiso('CONTABILIDAD', 'ver')
  resumen(
    @Query(zod(resumenEgresosEsquema)) rango: { desde?: Date; hasta?: Date },
  ): Promise<ResumenGastos> {
    return this.gastos.resumen(rango);
  }

  @Get(':id')
  @Permiso('CONTABILIDAD', 'ver')
  obtener(@Param('id') id: string): Promise<Gasto> {
    return this.gastos.obtener(id);
  }

  @Post()
  @Permiso('CONTABILIDAD', 'editar')
  crear(@Body(zod(crearGastoEsquema)) datos: DatosCrearGasto): Promise<Gasto> {
    return this.gastos.crear(datos);
  }

  @Patch(':id')
  @Permiso('CONTABILIDAD', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarGastoEsquema)) datos: DatosActualizarGasto,
  ): Promise<Gasto> {
    return this.gastos.actualizar(id, datos);
  }

  @Delete(':id')
  @Permiso('CONTABILIDAD', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param('id') id: string): Promise<void> {
    return this.gastos.eliminar(id);
  }

  /** Adjunta el soporte. El tipo se valida por los magic bytes, no por el nombre. */
  @Post(':id/soporte')
  @Permiso('CONTABILIDAD', 'editar')
  @UseInterceptors(FileInterceptor('archivo', LIMITES))
  adjuntar(@Param('id') id: string, @UploadedFile() archivo: Express.Multer.File): Promise<Gasto> {
    return this.gastos.adjuntar(id, archivo.buffer, archivo.originalname);
  }

  /**
   * El soporte se sirve por aquí, nunca por un enlace al bucket.
   *
   * Una URL firmada, aunque dure cinco minutos, funciona sin sesión y se puede
   * pegar en un chat. Pasando por el backend, cada descarga vuelve a verificar
   * permiso y empresa, y queda en el audit log (brief §4.13).
   */
  @Get(':id/soporte')
  @Permiso('CONTABILIDAD', 'ver')
  async descargarSoporte(@Param('id') id: string, @Res() respuesta: Response): Promise<void> {
    const { archivo, nombre, tipo } = await this.gastos.leerSoporte(id);

    respuesta.setHeader('Content-Type', tipo);
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    respuesta.setHeader('Content-Length', archivo.length);
    respuesta.send(archivo);
  }
}

/**
 * Calendario tributario.
 *
 * Vive aquí y Clientes lo consulta, como pide el brief: la regla del cruce está
 * escrita en un solo sitio.
 */
@Controller('calendario')
@Auditar('CalendarioTributario')
export class CalendarioController {
  constructor(private readonly calendario: CalendarioService) {}

  /**
   * Las fechas de alguien, por sus datos y no por su id.
   *
   * Se consulta con el último dígito, el tipo de contribuyente y el municipio
   * porque el calendario no sabe de clientes: cruza características, no personas.
   */
  @Get()
  @Permiso('CONTABILIDAD', 'ver')
  consultar(
    @Query(zod(consultarCalendarioEsquema))
    parametros: {
      anio?: number;
      ultimoDigito: number;
      tipoContribuyente?: string;
      codigoDaneMunicipio?: string;
    },
  ): Promise<FechaCalendario[]> {
    return this.calendario.consultar(parametros);
  }

  @Get('importaciones')
  @Permiso('ADMINISTRACION', 'ver')
  historial(@Query('anio') anio?: string): Promise<ImportacionCalendario[]> {
    return this.calendario.historial(anio ? Number(anio) : undefined);
  }

  /** Qué va a pasar si se confirma. Sin escribir nada. */
  @Post('previsualizar')
  @Permiso('ADMINISTRACION', 'editar')
  @HttpCode(HttpStatus.OK)
  previsualizar(
    @Body(zod(importarCalendarioEsquema)) datos: DatosImportarCalendario,
  ): Promise<PrevisualizacionCalendario> {
    return this.calendario.previsualizar(datos);
  }

  @Post('importar')
  @Permiso('ADMINISTRACION', 'editar')
  importar(
    @Body(zod(importarCalendarioEsquema)) datos: DatosImportarCalendario,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ImportacionCalendario> {
    return this.calendario.importar(datos, usuario);
  }

  /** Vuelve a una importación anterior. Nada se borró, así que se puede. */
  @Post('importaciones/:id/restaurar')
  @Permiso('ADMINISTRACION', 'editar')
  restaurar(
    @Param('id') id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ImportacionCalendario> {
    return this.calendario.restaurar(id, usuario);
  }
}

@Controller('solicitudes-documento')
@Auditar('SolicitudDocumento')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Get()
  @Permiso('CONTABILIDAD', 'ver')
  listar(
    @Query(zod(filtroSolicitudesEsquema))
    filtro: ParametrosPaginacion & { clienteId?: string; estado?: string },
  ): Promise<RespuestaPaginada<SolicitudDocumento>> {
    return this.solicitudes.listar(filtro);
  }

  @Get(':id')
  @Permiso('CONTABILIDAD', 'ver')
  obtener(@Param('id') id: string): Promise<SolicitudDocumento> {
    return this.solicitudes.obtener(id);
  }

  @Post()
  @Permiso('CONTABILIDAD', 'editar')
  crear(@Body(zod(crearSolicitudEsquema)) datos: DatosCrearSolicitud): Promise<SolicitudDocumento> {
    return this.solicitudes.crear(datos);
  }

  @Post(':id/recibir')
  @Permiso('CONTABILIDAD', 'editar')
  @UseInterceptors(FileInterceptor('archivo', LIMITES))
  recibir(
    @Param('id') id: string,
    @UploadedFile() archivo: Express.Multer.File,
  ): Promise<SolicitudDocumento> {
    return this.solicitudes.recibir(id, archivo.buffer, archivo.originalname);
  }

  @Get(':id/archivo')
  @Permiso('CONTABILIDAD', 'ver')
  async descargar(@Param('id') id: string, @Res() respuesta: Response): Promise<void> {
    const { archivo, nombre, tipo } = await this.solicitudes.leerArchivo(id);

    respuesta.setHeader('Content-Type', tipo);
    respuesta.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    respuesta.setHeader('Content-Length', archivo.length);
    respuesta.send(archivo);
  }

  @Delete(':id')
  @Permiso('CONTABILIDAD', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param('id') id: string): Promise<void> {
    return this.solicitudes.eliminar(id);
  }
}
