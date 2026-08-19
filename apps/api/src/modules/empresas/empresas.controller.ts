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
  actualizarEmpresaEsquema,
  crearEmpresaEsquema,
  paginacionEsquema,
  type DatosActualizarEmpresa,
  type DatosCrearEmpresa,
  type Empresa,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import {
  Auditar,
  Permiso,
  SinEmpresa,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { EmpresasService } from './empresas.service';

/**
 * `@SinEmpresa` porque este módulo es el que *elige* la empresa: exigir una empresa
 * activa para poder listarlas sería circular. El control de acceso aquí es la
 * pertenencia del usuario a cada empresa, verificada en el servicio.
 */
@Controller('empresas')
@SinEmpresa()
@Auditar('EmpresaAdministrada')
export class EmpresasController {
  constructor(private readonly empresas: EmpresasService) {}

  /** Alimenta el selector de la barra superior. Sin permiso especial: todo usuario
   * necesita saber a qué empresas entra. */
  @Get('accesibles')
  accesibles(@UsuarioActual() usuario: UsuarioAutenticado): Promise<Empresa[]> {
    return this.empresas.listarAccesibles(usuario);
  }

  @Get()
  @Permiso('ADMINISTRACION', 'ver')
  listar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Query(zod(paginacionEsquema)) parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<Empresa>> {
    return this.empresas.listar(usuario, parametros);
  }

  @Get(':id')
  @Permiso('ADMINISTRACION', 'ver')
  obtener(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<Empresa> {
    return this.empresas.obtener(id, usuario);
  }

  @Post()
  @Permiso('ADMINISTRACION', 'editar')
  crear(@Body(zod(crearEmpresaEsquema)) datos: DatosCrearEmpresa): Promise<Empresa> {
    return this.empresas.crear(datos);
  }

  @Patch(':id')
  @Permiso('ADMINISTRACION', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarEmpresaEsquema)) datos: DatosActualizarEmpresa,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<Empresa> {
    return this.empresas.actualizar(id, datos, usuario);
  }

  @Delete(':id')
  @Permiso('ADMINISTRACION', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado): Promise<void> {
    return this.empresas.desactivar(id, usuario);
  }
}
