import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { origenesPermitidos, type Entorno } from './core/config/configuracion';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El cuerpo crudo hace falta para verificar la firma de los webhooks (etapa 6).
    rawBody: true,
  });

  const config = app.get(ConfigService<Entorno, true>);
  const entorno = config.get('NODE_ENV', { infer: true });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  // Railway va detrás de un proxy: sin esto, req.ip sería siempre la del proxy y
  // el límite de tasa por IP y el audit log registrarían el origen equivocado.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());

  // CORS con lista exacta de orígenes. Nunca `*`, y nunca reflejando el header
  // Origin: con `credentials: true` eso equivaldría a no tener CORS.
  app.enableCors({
    origin: origenesPermitidos(config.get('CORS_ORIGIN', { infer: true })),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Empresa-Id', 'X-CSRF-Token'],
    maxAge: 86_400,
  });

  // Railway y la mayoría de plataformas asignan el puerto por `PORT` y comprueban
  // ahí que el servicio esté vivo. Si el proceso escuchara en otro, el despliegue
  // quedaría reiniciándose sin que el log dijera nada raro.
  const puerto = Number(process.env.PORT) || config.get('API_PORT', { infer: true });

  // Explícito en 0.0.0.0: dentro de un contenedor, escuchar solo en localhost
  // deja el servicio inalcanzable desde fuera.
  await app.listen(puerto, '0.0.0.0');

  new Logger('Arranque').log(`API escuchando en el puerto ${puerto} (${entorno})`);
}

void arrancar();
