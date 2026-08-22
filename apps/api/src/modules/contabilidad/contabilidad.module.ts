import { Module } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import {
  CalendarioController,
  GastosController,
  SolicitudesController,
} from './contabilidad.controller';
import { GastosService } from './gastos.service';
import { SolicitudesService } from './solicitudes.service';

/**
 * Contabilidad — etapa 6a.
 *
 * Gastos, calendario tributario y solicitudes de documento. La facturación
 * electrónica (6b) queda aplazada a la espera de las credenciales de Siigo, y nada
 * de lo de aquí depende de ella.
 *
 * `CalendarioService` se exporta porque Clientes lo consulta: el brief pide que la
 * regla del cruce viva en un solo sitio y que Clientes la use, no la copie.
 */
@Module({
  controllers: [GastosController, CalendarioController, SolicitudesController],
  providers: [GastosService, CalendarioService, SolicitudesService],
  exports: [CalendarioService],
})
export class ContabilidadModule {}
