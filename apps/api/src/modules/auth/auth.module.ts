import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './servicios/password.service';
import { SesionService } from './servicios/sesion.service';
import { TotpService } from './servicios/totp.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SesionService, TotpService],
  // PasswordService y SesionService los usa también el módulo de usuarios, para
  // crear cuentas con contraseña temporal y para revocar sesiones al desactivar.
  exports: [PasswordService, SesionService],
})
export class AuthModule {}
