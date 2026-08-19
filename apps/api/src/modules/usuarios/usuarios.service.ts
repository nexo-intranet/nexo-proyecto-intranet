import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  DatosCrearUsuario,
  ParametrosPaginacion,
  PermisoModulo,
  RespuestaPaginada,
  Usuario,
  UsuarioCreado,
} from '@nexo/shared';
import { z } from 'zod';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { ErrorNegocio, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PasswordService } from '../auth/servicios/password.service';
import { SesionService } from '../auth/servicios/sesion.service';
import { actualizarUsuarioEsquema } from '@nexo/shared';

type DatosActualizarUsuario = z.infer<typeof actualizarUsuarioEsquema>;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly sesiones: SesionService,
    private readonly audit: AuditService,
  ) {}

  private readonly campos = {
    id: true,
    nombre: true,
    email: true,
    activo: true,
    totpActivado: true,
    ultimoAcceso: true,
    rol: { select: { nombre: true } },
    empresas: { select: { empresa: { select: { id: true, nombre: true } } } },
    permisos: { select: { modulo: true, puedeVer: true, puedeEditar: true } },
  } as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aDto(fila: any): Usuario {
    return {
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      rol: fila.rol.nombre,
      activo: fila.activo,
      totpActivado: fila.totpActivado,
      ultimoAcceso: fila.ultimoAcceso ? fila.ultimoAcceso.toISOString() : null,
      empresas: fila.empresas.map(
        (relacion: { empresa: { id: string; nombre: string } }) => relacion.empresa,
      ),
      permisos: fila.permisos,
    };
  }

  async listar(parametros: ParametrosPaginacion): Promise<RespuestaPaginada<Usuario>> {
    const where = {
      deletedAt: null,
      ...(parametros.busqueda
        ? {
            OR: [
              { nombre: { contains: parametros.busqueda, mode: 'insensitive' as const } },
              { email: { contains: parametros.busqueda, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.usuario.findMany({
        where,
        select: this.campos,
        orderBy: { nombre: 'asc' },
        skip: (parametros.pagina - 1) * parametros.porPagina,
        take: parametros.porPagina,
      }),
      this.prisma.db.usuario.count({ where }),
    ]);

    return {
      datos: filas.map((fila) => this.aDto(fila)),
      total,
      pagina: parametros.pagina,
      porPagina: parametros.porPagina,
    };
  }

  async obtener(id: string): Promise<Usuario> {
    const fila = await this.prisma.db.usuario.findFirst({
      where: { id, deletedAt: null },
      select: this.campos,
    });
    if (!fila) throw noEncontrado('el usuario');
    return this.aDto(fila);
  }

  /**
   * Crea el usuario y devuelve su contraseña temporal **una sola vez**.
   *
   * No hay correo saliente en esta etapa: el administrador se la entrega por fuera
   * del sistema. Nunca se guarda en claro y no vuelve a estar disponible.
   */
  async crear(datos: DatosCrearUsuario): Promise<UsuarioCreado> {
    const existente = await this.prisma.db.usuario.findUnique({
      where: { email: datos.email },
      select: { id: true, deletedAt: true },
    });
    if (existente) {
      throw new ErrorNegocio(
        'CONFLICTO',
        'Ya existe un usuario con ese correo.',
        HttpStatus.CONFLICT,
      );
    }

    const rol = await this.prisma.db.rol.findUnique({
      where: { nombre: datos.rol },
      select: { id: true },
    });
    if (!rol) throw noEncontrado('el rol');

    const passwordTemporal = this.password.generarTemporal();
    const passwordHash = await this.password.hash(passwordTemporal);

    const creado = await this.prisma.enTransaccion(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nombre: datos.nombre,
          email: datos.email,
          passwordHash,
          rolId: rol.id,
          debeCambiarPassword: true,
          activo: true,
          empresas: { create: datos.empresaIds.map((empresaId) => ({ empresaId })) },
          permisos: { create: datos.permisos },
        },
        select: this.campos,
      });

      await this.audit.registrar({
        accion: 'CREAR',
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorNuevo: { email: datos.email, rol: datos.rol, permisos: datos.permisos },
      });

      return usuario;
    });

    return { usuario: this.aDto(creado), passwordTemporal };
  }

  async actualizar(
    id: string,
    datos: DatosActualizarUsuario,
    quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    const anterior = await this.obtener(id);

    // Nadie se desactiva a sí mismo: quedarse fuera del sistema por accidente y
    // sin otro administrador disponible es un problema difícil de deshacer.
    if (id === quienEdita.id && datos.activo === false) {
      throw new ErrorNegocio(
        'CONFLICTO',
        'No puedes desactivar tu propia cuenta.',
        HttpStatus.CONFLICT,
      );
    }

    if (datos.rol && anterior.rol === 'ADMINISTRADOR' && datos.rol !== 'ADMINISTRADOR') {
      await this.verificarQueQuedeUnAdministrador(id);
    }
    if (datos.activo === false && anterior.rol === 'ADMINISTRADOR') {
      await this.verificarQueQuedeUnAdministrador(id);
    }

    const rolId = datos.rol
      ? (
          await this.prisma.db.rol.findUnique({
            where: { nombre: datos.rol },
            select: { id: true },
          })
        )?.id
      : undefined;

    const fila = await this.prisma.db.usuario.update({
      where: { id },
      data: {
        ...(datos.nombre ? { nombre: datos.nombre } : {}),
        ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
        ...(rolId ? { rolId } : {}),
      },
      select: this.campos,
    });

    // Desactivar a alguien cierra sus sesiones ya, no cuando expire su token.
    if (datos.activo === false) await this.sesiones.revocarTodas(id);

    const actualizado = this.aDto(fila);
    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Usuario',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: actualizado,
    });

    return actualizado;
  }

  /** Reemplaza el conjunto completo de permisos. No es un parche incremental. */
  async asignarPermisos(
    id: string,
    permisos: PermisoModulo[],
    quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    this.rechazarAutoedicion(id, quienEdita, 'tus propios permisos');
    const anterior = await this.obtener(id);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.permisoModulo.deleteMany({ where: { usuarioId: id } });
      if (permisos.length > 0) {
        await tx.permisoModulo.createMany({
          data: permisos.map((permiso) => ({ usuarioId: id, ...permiso })),
        });
      }

      await this.audit.registrar({
        accion: 'ACTUALIZAR',
        entidad: 'PermisoModulo',
        entidadId: id,
        valorAnterior: anterior.permisos,
        valorNuevo: permisos,
      });
    });

    return this.obtener(id);
  }

  /** Reemplaza el conjunto completo de empresas accesibles. */
  async asignarEmpresas(
    id: string,
    empresaIds: string[],
    quienEdita: UsuarioAutenticado,
  ): Promise<Usuario> {
    this.rechazarAutoedicion(id, quienEdita, 'tus propias empresas');
    const anterior = await this.obtener(id);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.usuarioEmpresa.deleteMany({ where: { usuarioId: id } });
      await tx.usuarioEmpresa.createMany({
        data: empresaIds.map((empresaId) => ({ usuarioId: id, empresaId })),
      });

      await this.audit.registrar({
        accion: 'ACTUALIZAR',
        entidad: 'UsuarioEmpresa',
        entidadId: id,
        valorAnterior: anterior.empresas.map((empresa) => empresa.id),
        valorNuevo: empresaIds,
      });
    });

    return this.obtener(id);
  }

  async desactivar(id: string, quienEdita: UsuarioAutenticado): Promise<void> {
    const anterior = await this.obtener(id);

    if (id === quienEdita.id) {
      throw new ErrorNegocio(
        'CONFLICTO',
        'No puedes eliminar tu propia cuenta.',
        HttpStatus.CONFLICT,
      );
    }
    if (anterior.rol === 'ADMINISTRADOR') await this.verificarQueQuedeUnAdministrador(id);

    await this.prisma.db.usuario.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    await this.sesiones.revocarTodas(id);

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'Usuario',
      entidadId: id,
      valorAnterior: anterior,
    });
  }

  /**
   * Reinicia el segundo factor para que el usuario lo registre de nuevo.
   * Es el camino cuando alguien pierde el teléfono y se quedó sin códigos de respaldo.
   */
  async reiniciar2fa(id: string): Promise<void> {
    await this.obtener(id);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          totpActivado: false,
          totpSecretCifrado: null,
          ultimoTotpUsado: null,
          ultimoTotpEn: null,
        },
      });
      await tx.codigoRespaldo.deleteMany({ where: { usuarioId: id } });

      await this.audit.registrar({
        accion: 'ACTUALIZAR',
        entidad: 'Usuario',
        entidadId: id,
        valorNuevo: { totpReiniciado: true },
      });
    });

    await this.sesiones.revocarTodas(id);
  }

  async reiniciarPassword(id: string): Promise<{ passwordTemporal: string }> {
    await this.obtener(id);

    const passwordTemporal = this.password.generarTemporal();
    await this.prisma.db.usuario.update({
      where: { id },
      data: {
        passwordHash: await this.password.hash(passwordTemporal),
        debeCambiarPassword: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
    });
    await this.sesiones.revocarTodas(id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Usuario',
      entidadId: id,
      valorNuevo: { passwordReiniciada: true },
    });

    return { passwordTemporal };
  }

  // ── Reglas de protección ──────────────────────────────────────────────────

  /**
   * Nadie edita sus propios permisos ni sus propias empresas. Si pudiera, el RBAC
   * dejaría de ser un control: cualquiera con acceso al módulo se autoconcedería
   * el resto.
   */
  private rechazarAutoedicion(id: string, quienEdita: UsuarioAutenticado, que: string): void {
    if (id === quienEdita.id) {
      throw new ErrorNegocio(
        'CONFLICTO',
        `No puedes modificar ${que}. Pídeselo a otro administrador.`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /** El sistema no puede quedarse sin ningún administrador activo. */
  private async verificarQueQuedeUnAdministrador(idExcluido: string): Promise<void> {
    const restantes = await this.prisma.db.usuario.count({
      where: {
        id: { not: idExcluido },
        deletedAt: null,
        activo: true,
        rol: { nombre: 'ADMINISTRADOR' },
      },
    });

    if (restantes === 0) {
      throw new ErrorNegocio(
        'CONFLICTO',
        'Debe quedar al menos un administrador activo.',
        HttpStatus.CONFLICT,
      );
    }
  }
}
