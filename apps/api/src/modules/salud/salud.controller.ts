import { Controller, Get } from '@nestjs/common';
import { Publico, SinEmpresa } from '../../common/decoradores';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Estado del servicio, para el monitoreo de Railway.
 *
 * Es una de las tres rutas accesibles sin sesión (docs/SEGURIDAD.md §3.3), así que
 * no revela versiones, configuración ni datos de negocio: solo si el servicio
 * responde y si la base de datos contesta.
 */
@Controller('salud')
@Publico()
@SinEmpresa()
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async estado(): Promise<{ estado: 'ok' | 'degradado'; baseDeDatos: boolean }> {
    let baseDeDatos = false;
    try {
      await this.prisma.sinAislamiento.$queryRaw`SELECT 1`;
      baseDeDatos = true;
    } catch {
      baseDeDatos = false;
    }

    return { estado: baseDeDatos ? 'ok' : 'degradado', baseDeDatos };
  }
}
