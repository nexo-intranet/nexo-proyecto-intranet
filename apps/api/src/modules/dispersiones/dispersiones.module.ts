import { Module } from '@nestjs/common';
import { DestinatariosController } from './destinatarios.controller';
import { DestinatariosService } from './destinatarios.service';
import { DispersionDeOperacionController, DispersionesController } from './dispersiones.controller';
import { DispersionesService } from './dispersiones.service';
import { ReglasController } from './reglas.controller';
import { ReglasService } from './reglas.service';

/**
 * Todo lo que rodea al reparto: a quién se gira, con qué regla, y el reparto en sí.
 * Van juntos porque comparten el mismo cálculo y las mismas reglas de histórico
 * congelado; separarlos en tres módulos solo agregaría imports cruzados.
 */
@Module({
  controllers: [
    DestinatariosController,
    ReglasController,
    DispersionesController,
    DispersionDeOperacionController,
  ],
  providers: [DestinatariosService, ReglasService, DispersionesService],
  exports: [DispersionesService],
})
export class DispersionesModule {}
