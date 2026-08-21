import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  calcularReparto,
  type DatosGuardarRegla,
  type ParametrosPaginacion,
  type RespuestaPaginada,
} from '@nexo/shared';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface ReglaVista {
  id: string;
  nombre: string;
  tipoReparto: 'PORCENTAJE' | 'MONTO_FIJO';
  activa: boolean;
  destinos: {
    destinatarioId: string;
    nombre: string;
    cuentaFinal: string | null;
    porcentaje: string | null;
    montoFijo: string | null;
    orden: number;
  }[];
}

/**
 * Reglas de dispersión: el reparto que se repite operación tras operación.
 *
 * Una regla se guarda entera —cabecera y destinos en una sola transacción— porque a
 * medias no significa nada: una regla de porcentajes que sume 40 % no es una regla
 * incompleta, es una que reparte mal.
 *
 * Las de porcentaje se validan aquí mismo con `calcularReparto`, el mismo cálculo
 * que usa el formulario y el que después ejecuta la dispersión. Que sume 100 % se
 * comprueba al guardar y no al dispersar: es mucho mejor enterarse al configurar
 * que en el momento de girar la plata.
 */
@Injectable()
export class ReglasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly conDestinos = {
    id: true,
    nombre: true,
    tipoReparto: true,
    activa: true,
    destinos: {
      select: {
        destinatarioId: true,
        porcentaje: true,
        montoFijo: true,
        orden: true,
        destinatario: { select: { nombre: true, cuentaFinal: true } },
      },
      orderBy: { orden: 'asc' as const },
    },
  } as const;

  private aVista(fila: Prisma.ReglaDispersionGetPayload<{ select: ReglasService['conDestinos'] }>) {
    return {
      id: fila.id,
      nombre: fila.nombre,
      tipoReparto: fila.tipoReparto,
      activa: fila.activa,
      destinos: fila.destinos.map((destino) => ({
        destinatarioId: destino.destinatarioId,
        nombre: destino.destinatario.nombre,
        cuentaFinal: destino.destinatario.cuentaFinal,
        porcentaje: destino.porcentaje?.toFixed(4) ?? null,
        montoFijo: destino.montoFijo?.toFixed(2) ?? null,
        orden: destino.orden,
      })),
    } as ReglaVista;
  }

  async listar(filtro: ParametrosPaginacion): Promise<RespuestaPaginada<ReglaVista>> {
    const where = {
      deletedAt: null,
      ...(filtro.busqueda
        ? { nombre: { contains: filtro.busqueda, mode: 'insensitive' as const } }
        : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.reglaDispersion.findMany({
        where,
        select: this.conDestinos,
        orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.reglaDispersion.count({ where }),
    ]);

    return {
      datos: filas.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<ReglaVista> {
    const regla = await this.prisma.db.reglaDispersion.findFirst({
      where: { id, deletedAt: null },
      select: this.conDestinos,
    });

    if (!regla) throw noEncontrado('la regla de dispersión');
    return this.aVista(regla);
  }

  async crear(datos: DatosGuardarRegla): Promise<ReglaVista> {
    await this.verificarDestinatarios(datos);
    this.verificarReparto(datos);

    const id = await this.prisma.enTransaccion(async (tx) => {
      const regla = await tx.reglaDispersion.create({
        data: conEmpresaImplicita({
          nombre: datos.nombre,
          tipoReparto: datos.tipoReparto,
          activa: datos.activa,
        }),
        select: { id: true },
      });

      await this.escribirDestinos(tx, regla.id, datos);
      return regla.id;
    });

    const regla = await this.obtener(id);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'ReglaDispersion',
      entidadId: id,
      valorNuevo: regla,
    });

    return regla;
  }

  /**
   * Editar una regla reemplaza sus destinos, no los mezcla.
   *
   * Es lo que espera quien la edita: la pantalla muestra una lista y la guarda
   * completa. Fusionar dejaría destinos que el usuario ya había quitado.
   *
   * Las dispersiones ya hechas no se ven afectadas: cada una guardó su propia copia
   * de a quién y cuánto se giró.
   */
  async actualizar(id: string, datos: DatosGuardarRegla): Promise<ReglaVista> {
    const anterior = await this.obtener(id);
    await this.verificarDestinatarios(datos);
    this.verificarReparto(datos);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.reglaDispersion.update({
        where: { id },
        data: { nombre: datos.nombre, tipoReparto: datos.tipoReparto, activa: datos.activa },
      });

      await tx.reglaDispersionDestino.deleteMany({ where: { reglaId: id } });
      await this.escribirDestinos(tx, id, datos);
    });

    const regla = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'ReglaDispersion',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: regla,
    });

    return regla;
  }

  async desactivar(id: string): Promise<void> {
    const anterior = await this.obtener(id);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.reglaDispersion.update({
        where: { id },
        data: { activa: false, deletedAt: new Date() },
      });
      await tx.reglaDispersionDestino.deleteMany({ where: { reglaId: id } });
    });

    await this.audit.registrar({
      accion: 'ELIMINAR',
      entidad: 'ReglaDispersion',
      entidadId: id,
      valorAnterior: anterior,
    });
  }

  private async escribirDestinos(
    tx: Parameters<Parameters<PrismaService['enTransaccion']>[0]>[0],
    reglaId: string,
    datos: DatosGuardarRegla,
  ): Promise<void> {
    await tx.reglaDispersionDestino.createMany({
      data: datos.destinos.map((destino) =>
        conEmpresaImplicita({
          reglaId,
          destinatarioId: destino.destinatarioId,
          porcentaje: datos.tipoReparto === 'PORCENTAJE' ? destino.porcentaje : null,
          montoFijo: datos.tipoReparto === 'MONTO_FIJO' ? destino.montoFijo : null,
          orden: destino.orden,
        }),
      ),
    });
  }

  /** Nadie puede meter en una regla a un destinatario de otra empresa: la extensión
   * de aislamiento filtra esta consulta, así que un id ajeno simplemente no aparece. */
  private async verificarDestinatarios(datos: DatosGuardarRegla): Promise<void> {
    const ids = datos.destinos.map((destino) => destino.destinatarioId);

    const encontrados = await this.prisma.db.destinatario.count({
      where: { id: { in: ids }, deletedAt: null, activo: true },
    });

    if (encontrados !== ids.length) {
      throw noEncontrado('alguno de los destinatarios de la regla');
    }
  }

  /**
   * Una regla de porcentajes tiene que sumar 100 %.
   *
   * Se comprueba con `calcularReparto` sobre un total de referencia, y no con una
   * suma escrita aquí, para que la validación y la ejecución no puedan divergir.
   * Las de monto fijo no se pueden validar todavía: dependen del total de cada
   * operación, y ese cuadre se verifica al dispersar.
   */
  private verificarReparto(datos: DatosGuardarRegla): void {
    if (datos.tipoReparto !== 'PORCENTAJE') return;

    try {
      calcularReparto(
        '1000000.00',
        'PORCENTAJE',
        datos.destinos.map((destino) => ({
          referencia: destino.destinatarioId,
          orden: destino.orden,
          porcentaje: destino.porcentaje,
        })),
      );
    } catch (error) {
      throw conflicto(error instanceof Error ? error.message : 'El reparto de la regla no cuadra.');
    }
  }
}
