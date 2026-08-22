import { Module } from '@nestjs/common';
import { EgresosController } from './egresos.controller';
import { EgresosService } from './egresos.service';
import { OrdenesPagoController } from './ordenes-pago.controller';
import { OrdenesPagoService } from './ordenes-pago.service';

/**
 * Egresos y sus órdenes de pago van en el mismo módulo porque son una sola cosa
 * vista desde dos lados: el registro operativo y su documento legal. Separarlos
 * solo agregaría un import cruzado entre dos servicios que siempre cambian juntos.
 */
@Module({
  controllers: [EgresosController, OrdenesPagoController],
  providers: [EgresosService, OrdenesPagoService],
  exports: [EgresosService],
})
export class EgresosModule {}
