import { Module } from '@nestjs/common';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { OperacionesModule } from '../operaciones/operaciones.module';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

/**
 * Importa Operaciones para el historial de un cliente: en vez de rearmar la
 * consulta aquí, delega en el servicio que ya sabe cómo se muestra una operación.
 */
@Module({
  imports: [OperacionesModule, ContabilidadModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
