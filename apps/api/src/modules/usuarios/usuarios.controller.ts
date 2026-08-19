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
  Put,
  Query,
} from '@nestjs/common';
import {
  actualizarUsuarioEsquema,
  asignarEmpresasEsquema,
  asignarPermisosEsquema,
  crearUsuarioEsquema,
  paginacionEsquema,
  type DatosCrearUsuario,
  type ParametrosPaginacion,
  type PermisoModulo,
  type RespuestaPaginada,
  type Usuario,
  type UsuarioCreado,
} from '@nexo/shared';
import type { z } from 'zod';
import {
  Auditar,
  Permiso,
  SinEmpresa,
  UsuarioActual,
  type UsuarioAutenticado,
} from '../../common/decoradores';
import { zod } from '../../common/pipes/zod-validation.pipe';
import { UsuariosService } from './usuarios.service';

/**
 * Gestión de usuarios. `@SinEmpresa` porque un usuario no pertenece a una empresa:
 * pertenece a Nexo y tiene acceso a varias.
 */
@Controller('usuarios')
@SinEmpresa()
@Auditar('Usuario')
@Permiso('ADMINISTRACION', 'ver')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar(
    @Query(zod(paginacionEsquema)) parametros: ParametrosPaginacion,
  ): Promise<RespuestaPaginada<Usuario>> {
    return this.usuarios.listar(parametros);
  }

  @Get(':id')
  obtener(@Param('id') id: string): Promise<Usuario> {
    return this.usuarios.obtener(id);
  }

  @Post()
  @Permiso('ADMINISTRACION', 'editar')
  crear(@Body(zod(crearUsuarioEsquema)) datos: DatosCrearUsuario): Promise<UsuarioCreado> {
    return this.usuarios.crear(datos);
  }

  @Patch(':id')
  @Permiso('ADMINISTRACION', 'editar')
  actualizar(
    @Param('id') id: string,
    @Body(zod(actualizarUsuarioEsquema)) datos: z.infer<typeof actualizarUsuarioEsquema>,
    @UsuarioActual() quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    return this.usuarios.actualizar(id, datos, quienEdita);
  }

  @Put(':id/permisos')
  @Permiso('ADMINISTRACION', 'editar')
  asignarPermisos(
    @Param('id') id: string,
    @Body(zod(asignarPermisosEsquema)) permisos: PermisoModulo[],
    @UsuarioActual() quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    return this.usuarios.asignarPermisos(id, permisos, quienEdita);
  }

  @Put(':id/empresas')
  @Permiso('ADMINISTRACION', 'editar')
  asignarEmpresas(
    @Param('id') id: string,
    @Body(zod(asignarEmpresasEsquema)) datos: z.infer<typeof asignarEmpresasEsquema>,
    @UsuarioActual() quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    return this.usuarios.asignarEmpresas(id, datos.empresaIds, quienEdita);
  }

  @Post(':id/reiniciar-2fa')
  @Permiso('ADMINISTRACION', 'editar')
  @HttpCode(HttpStatus.OK)
  reiniciar2fa(@Param('id') id: string): Promise<void> {
    return this.usuarios.reiniciar2fa(id);
  }

  /** Devuelve la contraseña temporal una sola vez, para que el admin la entregue. */
  @Post(':id/reiniciar-password')
  @Permiso('ADMINISTRACION', 'editar')
  @HttpCode(HttpStatus.OK)
  reiniciarPassword(@Param('id') id: string): Promise<{ passwordTemporal: string }> {
    return this.usuarios.reiniciarPassword(id);
  }

  @Delete(':id')
  @Permiso('ADMINISTRACION', 'editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  desactivar(
    @Param('id') id: string,
    @UsuarioActual() quienEdita: UsuarioAutenticado,
  ): Promise<void> {
    return this.usuarios.desactivar(id, quienEdita);
  }
}
