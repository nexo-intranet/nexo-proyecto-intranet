import { Module } from '@nestjs/common';
import { OperacionesModule } from '../operaciones/operaciones.module';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

/**
 * Importa Operaciones para el historial de un cliente: en vez de rearmar la
 * consulta aquí, delega en el servicio que ya sabe cómo se muestra una operación.
 */
@Module({
  imports: [OperacionesModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
