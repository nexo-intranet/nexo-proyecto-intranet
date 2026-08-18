import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit/audit.service';
import { ContextoService } from './context/contexto.service';
import { CifradoService } from './crypto/cifrado.service';
import { PrismaService } from './prisma/prisma.service';
import type { Entorno } from './config/configuracion';

/**
 * Infraestructura transversal: contexto de petición, acceso a datos, cifrado,
 * audit log y firma de tokens de acceso.
 *
 * Es `@Global` a propósito. Son piezas de las que depende todo el sistema, y
 * repetir el import en cada módulo solo agrega ruido sin agregar aislamiento.
 *
 * El secreto de refresco no se registra aquí: lo maneja el servicio de sesiones,
 * que firma y verifica con su propia clave.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
      }),
    }),
  ],
  providers: [
    ContextoService,
    AuditService,
    {
      provide: PrismaService,
      inject: [ConfigService, ContextoService],
      useFactory: (config: ConfigService<Entorno, true>, contexto: ContextoService) =>
        new PrismaService(contexto, config.get('DATABASE_URL', { infer: true })),
    },
    {
      provide: CifradoService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        new CifradoService(
          config.get('ENCRYPTION_KEY', { infer: true }),
          config.get('ENCRYPTION_KEY_VERSION', { infer: true }),
          config.get('HMAC_DOC_KEY', { infer: true }),
        ),
    },
  ],
  exports: [ContextoService, PrismaService, CifradoService, AuditService, JwtModule],
})
export class CoreModule {}
