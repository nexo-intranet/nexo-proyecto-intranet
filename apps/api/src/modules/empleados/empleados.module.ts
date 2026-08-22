import { Module } from '@nestjs/common';
import { DocumentosLaboralesService } from './documentos-laborales.service';
import { EmpleadosController, RecibosController } from './empleados.controller';
import { EmpleadosService } from './empleados.service';
import { NominaService } from './nomina.service';

/**
 * Empleados, sus recibos y sus documentos laborales.
 *
 * Van juntos porque son un solo dominio visto por tres lados: quién es, qué se le
 * pagó y qué se certifica de él. Los tres servicios comparten la ficha del empleado
 * y cambian a la vez.
 */
@Module({
  controllers: [EmpleadosController, RecibosController],
  providers: [EmpleadosService, NominaService, DocumentosLaboralesService],
  exports: [EmpleadosService],
})
export class EmpleadosModule {}
