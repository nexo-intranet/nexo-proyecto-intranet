import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validarEntorno } from './core/config/configuracion';
import { ContextoMiddleware } from './core/context/contexto.middleware';
import { CoreModule } from './core/core.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Si falta un secreto o está mal formado, el proceso no arranca.
      validate: validarEntorno,
    }),
    // Límite de tasa general. Las rutas de autenticación llevan uno más estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    CoreModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextoMiddleware).forRoutes('*');
  }
}
