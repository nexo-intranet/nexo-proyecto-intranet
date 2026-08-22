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
  actualizarClienteEsquema,
  buscarClienteEsquema,
  crearClienteEsquema,
  filtroClientesEsquema,
  paginacionEsquema,
  type Cliente,
  type DatosActualizarCliente,
  type DatosCrearCliente,
  type FiltroClientes,
  type OperacionResumen,
  type ParametrosPaginacion,
  type ResumenCliente,
  type RespuestaPaginada,
} from '@nexo/shared';
import { Auditar, Permiso } from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { ClientesService } from './clientes.service';

@Controller('clientes')
@Auditar('Cliente')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @Permiso('CLIENTES', 'ver')
  listar(
    @Query(zod(filtroClientesEsquema)) filtro: FiltroClientes,
  ): Promise<RespuestaPaginada<Cliente>> {
    return this.clientes.listar(filtro);
  }

  /** Va antes de `:id`: Nest resuelve en orden y `buscar` caería en el parámetro. */
  @Get('buscar')
  @Permiso('CLIENTES', 'ver')
  buscar(@Query(zod(buscarClienteEsquema)) { documento }: { documento: string }): Promise<Cliente> {
    return this.clientes.buscarPorDocumento(documento);
  }

  @Get(':id')
  @Permiso('CLIENTES', 'ver')
  obtener(@Param('id') id: string): Promise<Cliente> {
    return this.clientes.obtener(id);
  }

  /** Historial de operaciones del cliente, paginado en servidor. */
  @Get(':id/operaciones')
  @Permiso('CLIENTES', 'ver')
  operaciones(
    @Param('id') id: string,
    @Query(zod(paginacionEsquema)) parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<OperacionResumen>> {
    return this.clientes.operaciones(id, parametros);
  }

  /** Cuánto ha movido y desde cuándo. Cabecera de la ficha del cliente. */
  @Get(':id/resumen')
  @Permiso('CLIENTES', 'ver')
  resumen(@Param('id') id: string): Promise<ResumenCliente> {
    return this.clientes.resumen(id);
  }

  @Post()
  @Permiso('CLIENTES', 'editar')
  crear(@Body(zod(crearClienteEsquema)) datos: DatosCrearCliente): Promise<Cliente> {
    return this.clientes.crear(datos);
  }

  @Patch(':id')
  @Permiso('CLIENTES', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarClienteEsquema)) datos: DatosActualizarCliente,
  ): Promise<Cliente> {
    return this.clientes.actualizar(id, datos);
  }

  @Delete(':id')
  @Permiso('CLIENTES', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param('id') id: string): Promise<void> {
    return this.clientes.desactivar(id);
  }
}
