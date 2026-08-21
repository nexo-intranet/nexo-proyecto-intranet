import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  Decimal,
  ESTADOS_OPERACION,
  calcularGanancia,
  type DatosActualizarOperacion,
  type DatosAnularOperacion,
  type DatosCrearOperacion,
  type FiltroOperaciones,
  type OperacionDetalle,
  type OperacionResumen,
  type RespuestaPaginada,
  type ResumenOperaciones,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, documentoAnulado, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { conEmpresaImplicita } from '../../core/prisma/empresa-implicita';
import { PrismaService } from '../../core/prisma/prisma.service';

/** Cuántas operaciones devuelve el buscador por hash antes de pedir más caracteres. */
const MAX_COINCIDENCIAS_HASH = 10;

/** Un decimal de Prisma nunca sale como número: en JSON el dinero viaja como texto. */
const texto = (valor: Prisma.Decimal | null): string | null => valor?.toString() ?? null;

/**
 * Operaciones de compra y venta.
 *
 * El corazón del sistema. Dos reglas mandan sobre todo lo demás:
 *
 * 1. La ganancia se calcula al guardar y se persiste (brief §5). Las tasas quedan
 *    congeladas ahí. Recalcular hoy una operación del año pasado con la tasa de hoy
 *    cambiaría un número que ya se reportó.
 * 2. Una operación conciliada o anulada no se edita. La conciliada ya cerró su
 *    dispersión; la anulada se conserva con su motivo, no se toca (brief §4.3).
 */
@Injectable()
export class OperacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly camposResumen = {
    id: true,
    hash: true,
    red: true,
    cantidad: true,
    monedaActivo: true,
    valorCompra: true,
    monedaCompra: true,
    valorVenta: true,
    monedaVenta: true,
    gananciaCOP: true,
    estado: true,
    fechaOperacion: true,
    cliente: { select: { id: true, nombre: true } },
    dispersion: { select: { id: true, estado: true } },
  } as const;

  private readonly camposDetalle = {
    ...this.camposResumen,
    tasaCompra: true,
    tasaVenta: true,
    observaciones: true,
    motivoAnulacion: true,
    anuladaEn: true,
    createdAt: true,
  } as const;

  private aResumen(
    fila: Prisma.OperacionGetPayload<{ select: OperacionesService['camposResumen'] }>,
  ): OperacionResumen {
    return {
      id: fila.id,
      hash: fila.hash,
      red: fila.red,
      cliente: fila.cliente,
      cantidad: texto(fila.cantidad),
      monedaActivo: fila.monedaActivo,
      valorCompra: fila.valorCompra.toFixed(2),
      monedaCompra: fila.monedaCompra,
      valorVenta: fila.valorVenta.toFixed(2),
      monedaVenta: fila.monedaVenta,
      gananciaCOP: fila.gananciaCOP.toFixed(2),
      estado: fila.estado,
      fechaOperacion: fila.fechaOperacion.toISOString(),
      dispersion: fila.dispersion,
    };
  }

  private aDetalle(
    fila: Prisma.OperacionGetPayload<{ select: OperacionesService['camposDetalle'] }>,
  ): OperacionDetalle {
    return {
      ...this.aResumen(fila),
      tasaCompra: texto(fila.tasaCompra),
      tasaVenta: texto(fila.tasaVenta),
      observaciones: fila.observaciones,
      motivoAnulacion: fila.motivoAnulacion,
      anuladaEn: fila.anuladaEn?.toISOString() ?? null,
      createdAt: fila.createdAt.toISOString(),
    };
  }

  async listar(filtro: FiltroOperaciones): Promise<RespuestaPaginada<OperacionResumen>> {
    const where: Prisma.OperacionWhereInput = {
      deletedAt: null,
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.moneda
        ? { OR: [{ monedaCompra: filtro.moneda }, { monedaVenta: filtro.moneda }] }
        : {}),
      ...(filtro.desde || filtro.hasta
        ? {
            fechaOperacion: {
              ...(filtro.desde ? { gte: filtro.desde } : {}),
              ...(filtro.hasta ? { lte: filtro.hasta } : {}),
            },
          }
        : {}),
      // Escribir en el buscador general también encuentra por hash: es lo que la
      // gente tiene a mano cuando llega un reclamo.
      ...(filtro.busqueda
        ? {
            OR: [
              { hash: { startsWith: filtro.busqueda.toLowerCase() } },
              { cliente: { nombre: { contains: filtro.busqueda, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.db.operacion.findMany({
        where,
        select: this.camposResumen,
        orderBy: { fechaOperacion: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
      this.prisma.db.operacion.count({ where }),
    ]);

    return {
      datos: datos.map((fila) => this.aResumen(fila)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  /**
   * Buscador por hash: la función más usada del sistema (brief §5).
   *
   * Busca por prefijo porque nadie teclea 66 caracteres: se pegan los primeros o se
   * copian del explorador de bloques. El mínimo de caracteres lo impone el esquema
   * — con menos, el prefijo devolvería medio libro mayor.
   */
  async buscarPorHash(prefijo: string): Promise<OperacionResumen[]> {
    const filas = await this.prisma.db.operacion.findMany({
      where: { deletedAt: null, hash: { startsWith: prefijo } },
      select: this.camposResumen,
      orderBy: { fechaOperacion: 'desc' },
      take: MAX_COINCIDENCIAS_HASH,
    });

    return filas.map((fila) => this.aResumen(fila));
  }

  /**
   * Totales del período para el tablero.
   *
   * Las anuladas quedan fuera de las sumas pero sí se cuentan en `porEstado`: en el
   * tablero hay que poder ver que existen sin que inflen el resultado.
   */
  async resumen(rango: { desde?: Date; hasta?: Date }): Promise<ResumenOperaciones> {
    const enRango: Prisma.OperacionWhereInput = {
      deletedAt: null,
      ...(rango.desde || rango.hasta
        ? {
            fechaOperacion: {
              ...(rango.desde ? { gte: rango.desde } : {}),
              ...(rango.hasta ? { lte: rango.hasta } : {}),
            },
          }
        : {}),
    };

    const vigentes = { ...enRango, estado: { not: 'ANULADA' as const } };

    const [totales, porEstado, porMoneda, dispersionesPendientes] = await Promise.all([
      this.prisma.db.operacion.aggregate({
        where: vigentes,
        _count: true,
        _sum: { gananciaCOP: true },
      }),
      this.prisma.db.operacion.groupBy({
        by: ['estado'],
        where: enRango,
        _count: { _all: true },
      }),
      // El volumen va por moneda y no sumado en pesos: `valorCompra` está en la
      // moneda de cada operación, y sumar dólares con pesos daría un número que no
      // significa nada. Lo único ya convertido —y por eso comparable— es la ganancia.
      this.prisma.db.operacion.groupBy({
        by: ['monedaCompra'],
        where: vigentes,
        _sum: { valorCompra: true, valorVenta: true },
      }),
      this.prisma.db.dispersion.count({
        where: { deletedAt: null, estado: { in: ['PENDIENTE', 'PARCIAL'] } },
      }),
    ]);

    const conteos = Object.fromEntries(
      ESTADOS_OPERACION.map((estado) => [estado, 0]),
    ) as ResumenOperaciones['porEstado'];
    for (const fila of porEstado) conteos[fila.estado] = fila._count._all;

    return {
      cantidad: totales._count,
      // Sin operaciones la suma llega nula: cero es la respuesta correcta, no null.
      gananciaCOP: (totales._sum.gananciaCOP ?? new Decimal(0)).toFixed(2),
      porEstado: conteos,
      volumenPorMoneda: porMoneda.map((fila) => ({
        moneda: fila.monedaCompra,
        compra: (fila._sum.valorCompra ?? new Decimal(0)).toFixed(2),
        venta: (fila._sum.valorVenta ?? new Decimal(0)).toFixed(2),
      })),
      dispersionesPendientes,
    };
  }

  async obtener(id: string): Promise<OperacionDetalle> {
    const operacion = await this.prisma.db.operacion.findFirst({
      where: { id, deletedAt: null },
      select: this.camposDetalle,
    });

    // 404 y no 403 cuando es de otra empresa: confirmar que existe ya es filtrar.
    if (!operacion) throw noEncontrado('la operación');
    return this.aDetalle(operacion);
  }

  async crear(datos: DatosCrearOperacion): Promise<OperacionDetalle> {
    await this.verificarClienteExiste(datos.clienteId);
    if (datos.hash) await this.verificarHashLibre(datos.hash);

    const ganancia = calcularGanancia(
      { valor: datos.valorCompra, moneda: datos.monedaCompra, tasa: datos.tasaCompra },
      { valor: datos.valorVenta, moneda: datos.monedaVenta, tasa: datos.tasaVenta },
    );

    const operacion = await this.prisma.db.operacion.create({
      data: conEmpresaImplicita({ ...datos, gananciaCOP: ganancia.gananciaCOP }),
      select: this.camposDetalle,
    });

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'Operacion',
      entidadId: operacion.id,
      valorNuevo: this.aDetalle(operacion),
    });

    return this.aDetalle(operacion);
  }

  async actualizar(id: string, datos: DatosActualizarOperacion): Promise<OperacionDetalle> {
    const anterior = await this.obtener(id);
    this.exigirEditable(anterior);

    if (datos.clienteId) await this.verificarClienteExiste(datos.clienteId);
    if (datos.hash && datos.hash !== anterior.hash) await this.verificarHashLibre(datos.hash);

    // La ganancia se recalcula sobre el estado resultante, no sobre lo que llegó:
    // cambiar solo la tasa de venta tiene que rehacer el número completo.
    const ganancia = calcularGanancia(
      {
        valor: datos.valorCompra ?? anterior.valorCompra,
        moneda: datos.monedaCompra ?? anterior.monedaCompra,
        tasa: datos.tasaCompra ?? anterior.tasaCompra,
      },
      {
        valor: datos.valorVenta ?? anterior.valorVenta,
        moneda: datos.monedaVenta ?? anterior.monedaVenta,
        tasa: datos.tasaVenta ?? anterior.tasaVenta,
      },
    );

    const operacion = await this.prisma.db.operacion.update({
      where: { id },
      data: { ...datos, gananciaCOP: ganancia.gananciaCOP },
      select: this.camposDetalle,
    });

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'Operacion',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: this.aDetalle(operacion),
    });

    return this.aDetalle(operacion);
  }

  /**
   * Anular, nunca borrar (brief §4.3).
   *
   * Si la dispersión ya tiene giros ejecutados, anular dejaría plata girada contra
   * un registro sin efecto. Ahí hay que devolver los giros primero.
   */
  async anular(
    id: string,
    datos: DatosAnularOperacion,
    usuario: UsuarioAutenticado,
  ): Promise<OperacionDetalle> {
    const anterior = await this.obtener(id);
    if (anterior.estado === 'ANULADA') throw documentoAnulado('La operación');

    const girosHechos = await this.prisma.db.dispersionDestino.count({
      where: { dispersion: { operacionId: id }, estado: 'EJECUTADO', deletedAt: null },
    });
    if (girosHechos > 0) {
      throw conflicto(
        `No se puede anular: la dispersión tiene ${girosHechos} giro(s) ya ejecutados. Devuélvelos primero.`,
      );
    }

    const operacion = await this.prisma.db.operacion.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        motivoAnulacion: datos.motivo,
        anuladaEn: new Date(),
        anuladaPorId: usuario.id,
      },
      select: this.camposDetalle,
    });

    await this.audit.registrar({
      accion: 'ANULAR',
      entidad: 'Operacion',
      entidadId: id,
      valorAnterior: anterior,
      valorNuevo: this.aDetalle(operacion),
    });

    return this.aDetalle(operacion);
  }

  private exigirEditable(operacion: OperacionDetalle): void {
    if (operacion.estado === 'ANULADA') throw documentoAnulado('La operación');
    if (operacion.estado === 'CONCILIADA') {
      throw conflicto(
        'La operación está conciliada: su dispersión ya se ejecutó y no admite cambios.',
      );
    }
  }

  private async verificarClienteExiste(clienteId: string): Promise<void> {
    const cliente = await this.prisma.db.cliente.findFirst({
      where: { id: clienteId, deletedAt: null },
      select: { id: true },
    });
    if (!cliente) throw noEncontrado('el cliente de la operación');
  }

  /**
   * El hash es único por empresa: la misma transacción en cadena no puede estar
   * registrada dos veces. Se verifica aquí para dar un mensaje que se entienda, en
   * vez del error de índice único que llegaría al usuario como un 500.
   */
  private async verificarHashLibre(hash: string): Promise<void> {
    const existente = await this.prisma.db.operacion.findFirst({
      where: { hash, deletedAt: null },
      select: { id: true },
    });
    if (existente) {
      throw conflicto('Ese hash ya está registrado en otra operación de esta empresa.');
    }
  }
}
