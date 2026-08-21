import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  calcularReparto,
  sumar,
  type DatosCrearDispersion,
  type DatosEjecutarDestino,
  type DatosRevertirDestino,
  type DestinoReparto,
  type DispersionVista,
  type EstadoDispersion,
  type ParametrosPaginacion,
  type RepartoCalculado,
  type RespuestaPaginada,
  type TipoReparto,
} from '@nexo/shared';
import { conflicto, documentoAnulado, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { CifradoService } from '../../core/crypto/cifrado.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/** Reparto calculado más los nombres, que es lo que el formulario necesita mostrar. */
export interface PrevisualizacionDispersion extends RepartoCalculado {
  destinos: (RepartoCalculado['destinos'][number] & {
    nombre: string;
    cuentaFinal: string | null;
  })[];
}

/**
 * Dispersión: repartir lo que dejó una operación.
 *
 * Tres cosas la definen, y las tres vienen del brief (§5):
 *
 * 1. **El cálculo es uno solo.** `calcularReparto` vive en `shared` y lo corren
 *    igual el formulario al previsualizar y el servidor al guardar. Si el navegador
 *    hiciera su propia cuenta, aparecerían diferencias de un peso que después nadie
 *    sabe explicar.
 * 2. **No se guarda si no cuadra.** La suma de los destinos tiene que ser exacta al
 *    centavo. Guardar un reparto descuadrado es crear un problema contable que
 *    alguien va a tener que perseguir meses después.
 * 3. **El histórico se congela.** Cada destino guarda su copia del nombre y la
 *    cuenta. Si mañana corrigen la cuenta en el catálogo, este registro tiene que
 *    seguir diciendo a dónde se giró realmente.
 */
@Injectable()
export class DispersionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cifrado: CifradoService,
    private readonly audit: AuditService,
  ) {}

  private readonly conDestinos = {
    id: true,
    operacionId: true,
    montoTotal: true,
    moneda: true,
    estado: true,
    regla: { select: { id: true, nombre: true } },
    destinos: {
      select: {
        id: true,
        destinatarioId: true,
        nombreSnapshot: true,
        cuentaSnapshot: true,
        monto: true,
        porcentaje: true,
        estado: true,
        ejecutadoEn: true,
        referenciaPago: true,
        observaciones: true,
      },
      orderBy: { createdAt: 'asc' as const },
    },
  } as const;

  private aVista(
    fila: Prisma.DispersionGetPayload<{ select: DispersionesService['conDestinos'] }>,
  ): DispersionVista {
    const asignado = sumar(...fila.destinos.map((destino) => destino.monto.toFixed(2)));

    return {
      id: fila.id,
      operacionId: fila.operacionId,
      montoTotal: fila.montoTotal.toFixed(2),
      moneda: fila.moneda,
      estado: fila.estado,
      regla: fila.regla,
      destinos: fila.destinos.map((destino) => ({
        id: destino.id,
        destinatarioId: destino.destinatarioId,
        nombreSnapshot: destino.nombreSnapshot,
        // El snapshot está cifrado: al navegador solo vuelven los últimos cuatro.
        cuentaSnapshot: this.ultimosCuatro(destino.cuentaSnapshot),
        monto: destino.monto.toFixed(2),
        porcentaje: destino.porcentaje?.toFixed(4) ?? null,
        estado: destino.estado,
        ejecutadoEn: destino.ejecutadoEn?.toISOString() ?? null,
        referenciaPago: destino.referenciaPago,
        observaciones: destino.observaciones,
      })),
      diferencia: fila.montoTotal.minus(asignado).toFixed(2),
    };
  }

  async listar(
    filtro: ParametrosPaginacion & { estado?: EstadoDispersion },
  ): Promise<RespuestaPaginada<DispersionVista>> {
    const where = {
      deletedAt: null,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };

    const [filas, total] = await Promise.all([
      this.prisma.db.dispersion.findMany({
        where,
        select: this.conDestinos,
        orderBy: { createdAt: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.dispersion.count({ where }),
    ]);

    return {
      datos: filas.map((fila) => this.aVista(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(id: string): Promise<DispersionVista> {
    const dispersion = await this.prisma.db.dispersion.findFirst({
      where: { id, deletedAt: null },
      select: this.conDestinos,
    });

    if (!dispersion) throw noEncontrado('la dispersión');
    return this.aVista(dispersion);
  }

  async obtenerDeOperacion(operacionId: string): Promise<DispersionVista> {
    const dispersion = await this.prisma.db.dispersion.findFirst({
      where: { operacionId, deletedAt: null },
      select: this.conDestinos,
    });

    if (!dispersion) throw noEncontrado('la dispersión de esa operación');
    return this.aVista(dispersion);
  }

  /**
   * Calcula el reparto sin guardar nada.
   *
   * Es la pantalla que el usuario mira antes de comprometerse: los mismos números
   * que va a producir `crear`, incluido el residuo del redondeo y a quién le tocó.
   */
  async previsualizar(
    operacionId: string,
    datos: DatosCrearDispersion,
  ): Promise<PrevisualizacionDispersion> {
    const { total, tipo, destinos, nombres } = await this.armarReparto(operacionId, datos);
    const reparto = this.calcular(total, tipo, destinos);

    return {
      ...reparto,
      destinos: reparto.destinos.map((destino) => ({
        ...destino,
        nombre: nombres.get(destino.referencia)?.nombre ?? '(destinatario desconocido)',
        cuentaFinal: nombres.get(destino.referencia)?.cuentaFinal ?? null,
      })),
    };
  }

  async crear(operacionId: string, datos: DatosCrearDispersion): Promise<DispersionVista> {
    const yaExiste = await this.prisma.db.dispersion.findFirst({
      where: { operacionId, deletedAt: null },
      select: { id: true },
    });
    if (yaExiste) {
      throw conflicto('Esa operación ya tiene una dispersión. Ajusta la existente.');
    }

    const reparto = await this.calcularParaGuardar(operacionId, datos);

    const id = await this.prisma.enTransaccion(async (tx) => {
      const dispersion = await tx.dispersion.create({
        data: conEmpresaImplicita({
          operacionId,
          montoTotal: reparto.total,
          moneda: datos.moneda,
          reglaId: datos.reglaId ?? null,
        }),
        select: { id: true },
      });

      await this.escribirDestinos(tx, dispersion.id, reparto);
      return dispersion.id;
    });

    const dispersion = await this.obtener(id);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Dispersion',
      entidadId: id,
      valorNuevo: dispersion,
    });

    return dispersion;
  }

  /**
   * Rehacer el reparto de una dispersión.
   *
   * Solo mientras no haya salido un solo peso. Después de un giro ejecutado, cambiar
   * el reparto dejaría el histórico diciendo una cosa y la plata habiendo ido a otra:
   * ahí lo que corresponde es devolver el giro primero.
   */
  async actualizar(id: string, datos: DatosCrearDispersion): Promise<DispersionVista> {
    const anterior = await this.obtener(id);

    if (anterior.destinos.some((destino) => destino.estado !== 'PENDIENTE')) {
      throw conflicto(
        'Esta dispersión ya tiene giros marcados. Devuélvelos antes de rehacer el reparto.',
      );
    }

    const reparto = await this.calcularParaGuardar(anterior.operacionId, datos);

    await this.prisma.enTransaccion(async (tx) => {
      await tx.dispersion.update({
        where: { id },
        data: {
          montoTotal: reparto.total,
          moneda: datos.moneda,
          reglaId: datos.reglaId ?? null,
          estado: 'PENDIENTE',
        },
      });

      await tx.dispersionDestino.deleteMany({ where: { dispersionId: id } });
      await this.escribirDestinos(tx, id, reparto);
    });

    const dispersion = await this.obtener(id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Dispersion',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: dispersion,
    });

    return dispersion;
  }

  /**
   * Marcar un giro como ejecutado.
   *
   * Es el paso de conciliación: cuando todos los destinos quedan ejecutados, la
   * dispersión pasa a EJECUTADA y la operación a CONCILIADA, que es el estado en el
   * que ya no admite ediciones.
   */
  async ejecutarDestino(
    dispersionId: string,
    destinoId: string,
    datos: DatosEjecutarDestino,
  ): Promise<DispersionVista> {
    return this.cambiarEstadoDestino(dispersionId, destinoId, 'EJECUTADO', {
      referenciaPago: datos.referenciaPago,
      ejecutadoEn: datos.ejecutadoEn ?? new Date(),
      observaciones: datos.observaciones ?? null,
    });
  }

  /**
   * Devolver un giro.
   *
   * Deshace la conciliación: la dispersión deja de estar ejecutada y la operación
   * vuelve a REGISTRADA, donde se puede volver a tocar. El motivo queda escrito en
   * el destino y en el audit log.
   */
  async revertirDestino(
    dispersionId: string,
    destinoId: string,
    datos: DatosRevertirDestino,
  ): Promise<DispersionVista> {
    return this.cambiarEstadoDestino(dispersionId, destinoId, 'DEVUELTO', {
      ejecutadoEn: null,
      observaciones: datos.motivo,
    });
  }

  private async cambiarEstadoDestino(
    dispersionId: string,
    destinoId: string,
    estadoDestino: 'EJECUTADO' | 'DEVUELTO',
    campos: {
      referenciaPago?: string;
      ejecutadoEn: Date | null;
      observaciones: string | null;
    },
  ): Promise<DispersionVista> {
    // El id de la dispersión va en la ruta y se exige que coincida: así un id de giro
    // adivinado no alcanza para tocar el reparto de otra operación.
    const destino = await this.prisma.db.dispersionDestino.findFirst({
      where: { id: destinoId, dispersionId, deletedAt: null },
      select: {
        id: true,
        estado: true,
        dispersion: { select: { operacionId: true, operacion: { select: { estado: true } } } },
      },
    });

    if (!destino) throw noEncontrado('el giro');
    if (destino.dispersion.operacion.estado === 'ANULADA') {
      throw documentoAnulado('La operación de esta dispersión');
    }
    if (destino.estado === estadoDestino) {
      throw conflicto(
        estadoDestino === 'EJECUTADO'
          ? 'Ese giro ya está marcado como ejecutado.'
          : 'Ese giro ya está devuelto.',
      );
    }

    await this.prisma.enTransaccion(async (tx) => {
      await tx.dispersionDestino.update({
        where: { id: destinoId },
        data: { estado: estadoDestino, ...campos },
      });

      const hermanos = await tx.dispersionDestino.findMany({
        where: { dispersionId, deletedAt: null },
        select: { estado: true },
      });

      const ejecutados = hermanos.filter((fila) => fila.estado === 'EJECUTADO').length;
      const estado: EstadoDispersion =
        ejecutados === 0 ? 'PENDIENTE' : ejecutados === hermanos.length ? 'EJECUTADA' : 'PARCIAL';

      await tx.dispersion.update({ where: { id: dispersionId }, data: { estado } });

      // La operación se cierra sola cuando su reparto queda completo, y vuelve atrás
      // si un giro se devuelve: conciliar no es un camino de una sola dirección.
      await tx.operacion.update({
        where: { id: destino.dispersion.operacionId },
        data: { estado: estado === 'EJECUTADA' ? 'CONCILIADA' : 'REGISTRADA' },
      });
    });

    const dispersion = await this.obtener(dispersionId);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'DispersionDestino',
      entidadId: destinoId,
      valorAnterior: { estado: destino.estado },
      valorNuevo: { estado: estadoDestino, ...campos },
    });

    return dispersion;
  }

  // ── Interior ──────────────────────────────────────────────────────────────

  /**
   * Reúne lo que hace falta para calcular: monto, tipo de reparto y destinos.
   *
   * El monto por defecto es la ganancia de la operación, que es lo que Nexo reparte.
   * Se puede pasar otro explícitamente, pero nunca se adivina.
   */
  private async armarReparto(
    operacionId: string,
    datos: DatosCrearDispersion,
  ): Promise<{
    total: string;
    tipo: TipoReparto;
    destinos: DestinoReparto[];
    nombres: Map<string, { nombre: string; cuentaFinal: string | null }>;
  }> {
    const operacion = await this.prisma.db.operacion.findFirst({
      where: { id: operacionId, deletedAt: null },
      select: { id: true, estado: true, gananciaCOP: true },
    });

    if (!operacion) throw noEncontrado('la operación a dispersar');
    if (operacion.estado === 'ANULADA') throw documentoAnulado('La operación');
    if (operacion.estado === 'BORRADOR') {
      throw conflicto('La operación todavía es un borrador: complétala antes de dispersar.');
    }

    const total = datos.montoTotal ?? operacion.gananciaCOP.toFixed(2);

    let tipo: TipoReparto;
    let destinos: DestinoReparto[];

    if (datos.reglaId) {
      const regla = await this.prisma.db.reglaDispersion.findFirst({
        where: { id: datos.reglaId, deletedAt: null, activa: true },
        select: {
          tipoReparto: true,
          destinos: {
            select: { destinatarioId: true, porcentaje: true, montoFijo: true, orden: true },
          },
        },
      });

      if (!regla) throw noEncontrado('la regla de dispersión');
      if (regla.destinos.length === 0) throw conflicto('Esa regla no tiene destinatarios.');

      tipo = regla.tipoReparto;
      destinos = regla.destinos.map((destino) => ({
        referencia: destino.destinatarioId,
        orden: destino.orden,
        porcentaje: destino.porcentaje?.toFixed(4),
        montoFijo: destino.montoFijo?.toFixed(2),
      }));
    } else {
      // Reparto a mano: son montos, no porcentajes, y tienen que sumar el total.
      tipo = 'MONTO_FIJO';
      destinos = (datos.destinos ?? []).map((destino) => ({
        referencia: destino.destinatarioId,
        orden: destino.orden,
        montoFijo: destino.monto,
      }));
    }

    const nombres = await this.nombresDe(destinos.map((destino) => destino.referencia));
    return { total, tipo, destinos, nombres };
  }

  /**
   * Todo lo que hace falta para escribir un reparto: los montos ya cuadrados, más
   * los nombres y las cuentas que se van a congelar en el histórico.
   */
  private async calcularParaGuardar(operacionId: string, datos: DatosCrearDispersion) {
    const { total, tipo, destinos, nombres } = await this.armarReparto(operacionId, datos);
    const reparto = this.calcular(total, tipo, destinos);
    const cuentas = await this.cuentasDe([...nombres.keys()]);

    return { ...reparto, nombres, cuentas };
  }

  private async escribirDestinos(
    tx: Parameters<Parameters<PrismaService['enTransaccion']>[0]>[0],
    dispersionId: string,
    reparto: Awaited<ReturnType<DispersionesService['calcularParaGuardar']>>,
  ): Promise<void> {
    await tx.dispersionDestino.createMany({
      data: reparto.destinos.map((destino) =>
        conEmpresaImplicita({
          dispersionId,
          destinatarioId: destino.referencia,
          nombreSnapshot: reparto.nombres.get(destino.referencia)?.nombre ?? '(sin nombre)',
          // La cuenta se copia cifrada tal como está en el catálogo: el histórico
          // guarda a dónde se giró, sin volver a dejar el número legible.
          cuentaSnapshot: reparto.cuentas.get(destino.referencia) ?? null,
          monto: destino.monto,
          porcentaje: destino.porcentaje ?? null,
        }),
      ),
    });
  }

  /** Traduce los errores del cálculo compartido a un conflicto con su explicación. */
  private calcular(total: string, tipo: TipoReparto, destinos: DestinoReparto[]) {
    let reparto;
    try {
      reparto = calcularReparto(total, tipo, destinos);
    } catch (error) {
      throw conflicto(error instanceof Error ? error.message : 'El reparto no se pudo calcular.');
    }

    if (!reparto.cuadra) {
      throw conflicto(
        `El reparto no cuadra: los destinos suman ${reparto.asignado} sobre un total de ${reparto.total}.`,
      );
    }

    return reparto;
  }

  /**
   * Nombres y últimos cuatro de la cuenta, para mostrar.
   *
   * La consulta pasa por el aislamiento por empresa, así que un destinatario de otra
   * empresa simplemente no aparece y el conteo lo delata.
   */
  private async nombresDe(
    ids: string[],
  ): Promise<Map<string, { nombre: string; cuentaFinal: string | null }>> {
    const unicos = [...new Set(ids)];

    const filas = await this.prisma.db.destinatario.findMany({
      where: { id: { in: unicos }, deletedAt: null, activo: true },
      select: { id: true, nombre: true, cuentaFinal: true },
    });

    if (filas.length !== unicos.length) {
      throw noEncontrado('alguno de los destinatarios del reparto');
    }

    return new Map(
      filas.map((fila) => [fila.id, { nombre: fila.nombre, cuentaFinal: fila.cuentaFinal }]),
    );
  }

  /** Cuentas cifradas tal como están guardadas: se copian al histórico sin descifrar. */
  private async cuentasDe(ids: string[]): Promise<Map<string, string | null>> {
    const filas = await this.prisma.db.destinatario.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, cuentaCifrada: true },
    });

    return new Map(filas.map((fila) => [fila.id, fila.cuentaCifrada]));
  }

  /**
   * El snapshot guarda la cuenta completa **cifrada**, porque es la prueba de a
   * dónde salió la plata. Al navegador solo vuelven los últimos cuatro dígitos.
   */
  private ultimosCuatro(cuentaCifrada: string | null): string | null {
    if (!cuentaCifrada) return null;
    try {
      return this.cifrado.descifrar(cuentaCifrada).slice(-4);
    } catch {
      // Una cuenta ilegible no puede tumbar la vista de una dispersión: se muestra
      // que está y que no se pudo leer, y el problema queda para quien lo revise.
      return null;
    }
  }
}
