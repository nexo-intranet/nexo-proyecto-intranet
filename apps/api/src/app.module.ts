import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { FiltroExcepciones } from './common/filtros/filtro-excepciones';
import { CsrfGuard } from './common/guards/csrf.guard';
import { EmpresaGuard } from './common/guards/empresa.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermisoGuard } from './common/guards/permiso.guard';
import { AuditInterceptor } from './common/interceptores/audit.interceptor';
import type { Entorno } from './core/config/configuracion';
import { validarEntorno } from './core/config/configuracion';
import { ContextoMiddleware } from './core/context/contexto.middleware';
import { CoreModule } from './core/core.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { SaludModule } from './modules/salud/salud.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

/**
 * Los guards globales corren en el orden en que se declaran aquí:
 *
 *   1. límite de tasa      — antes de tocar la base de datos
 *   2. CSRF                — antes de validar nada de la mutación
 *   3. sesión              — quién es
 *   4. empresa activa      — sobre qué empresa opera
 *   5. permiso de módulo   — si puede hacerlo
 *
 * Todo endpoint nuevo queda cubierto por los cinco sin escribir una línea: lo que
 * hay que declarar es la excepción (`@Publico`, `@SinEmpresa`), no la regla.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raíz del monorepo y lo comparten API y web.
      envFilePath: ['../../.env', '.env'],
      // Si falta un secreto o está mal formado, el proceso no arranca.
      validate: validarEntorno,
    }),
    // Límite de tasa general. Las rutas de autenticación llevan uno más estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    CoreModule,
    AuthModule,
    SaludModule,
    EmpresasModule,
    UsuariosModule,
    AuditoriaModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: EmpresaGuard },
    { provide: APP_GUARD, useClass: PermisoGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    {
      provide: APP_FILTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        new FiltroExcepciones(config.get('NODE_ENV', { infer: true }) === 'production'),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextoMiddleware).forRoutes('{*ruta}');
  }
}
