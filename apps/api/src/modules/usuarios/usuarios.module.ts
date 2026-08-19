import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  // AuthModule aporta PasswordService y SesionService: crear un usuario necesita
  // una contraseña temporal, y desactivarlo tiene que cerrarle las sesiones.
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
