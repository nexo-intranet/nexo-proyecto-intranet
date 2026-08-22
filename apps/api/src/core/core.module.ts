import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { crearAlmacen } from './archivos/almacenes';
import { ArchivosService } from './archivos/archivos.service';
import { AuditService } from './audit/audit.service';
import { ConsecutivoService } from './consecutivos/consecutivo.service';
import { ContextoService } from './context/contexto.service';
import { CifradoService } from './crypto/cifrado.service';
import { PdfService } from './pdf/pdf.service';
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
    ConsecutivoService,
    PdfService,
    {
      provide: PrismaService,
      inject: [ConfigService, ContextoService],
      useFactory: (config: ConfigService<Entorno, true>, contexto: ContextoService) =>
        new PrismaService(contexto, config.get('DATABASE_URL', { infer: true })),
    },
    {
      provide: ArchivosService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Entorno, true>) =>
        new ArchivosService(
          crearAlmacen(
            {
              endpoint: config.get('S3_ENDPOINT', { infer: true }),
              region: config.get('S3_REGION', { infer: true }),
              bucket: config.get('S3_BUCKET', { infer: true }),
              accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
              secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
            },
            config.get('NODE_ENV', { infer: true }) === 'production',
          ),
        ),
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
  exports: [
    ContextoService,
    PrismaService,
    CifradoService,
    AuditService,
    ConsecutivoService,
    // Lo estrena la etapa 3: hasta ahora nadie fuera de core generaba documentos.
    PdfService,
    // Lo estrena la etapa 6a: los soportes de gastos.
    ArchivosService,
    JwtModule,
  ],
})
export class CoreModule {}
