import { Injectable } from '@nestjs/common';
import type { TipoConsecutivo } from '@nexo/shared';
import { ContextoService } from '../context/contexto.service';
import type { ClientePrisma } from '../prisma/prisma.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consecutivos de documentos legales (docs/ARQUITECTURA.md §3.3).
 *
 * El brief es tajante: facturas, órdenes de pago y recibos de nómina llevan
 * consecutivo único e inmutable. Eso obliga a dos cosas:
 *
 *   1. El contador se incrementa con `SELECT ... FOR UPDATE`, nunca con `count()`.
 *      Con `count()`, dos usuarios que emitan a la vez obtienen el mismo número.
 *   2. Un consecutivo emitido no se reutiliza aunque el documento se anule. Anular
 *      no libera el número: el hueco en la secuencia es la evidencia de la anulación.
 */

const LONGITUD_NUMERO = 6;

/** Prefijo por defecto cuando la empresa no tiene uno configurado. */
const PREFIJO_POR_DEFECTO: Record<TipoConsecutivo, string> = {
  ORDEN_PAGO: 'OP-',
  FACTURA: 'FV-',
  RECIBO_NOMINA: 'RN-',
};

export interface ConsecutivoEmitido {
  numero: number;
  /** Lo que se imprime en el documento: `OP-000042`. */
  texto: string;
}

@Injectable()
export class ConsecutivoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexto: ContextoService,
  ) {}

  /**
   * Emite el siguiente consecutivo dentro de una transacción ya abierta.
   *
   * Se recibe el cliente transaccional en vez de abrir uno propio: el número y el
   * documento tienen que nacer juntos. Si el documento falla después, el número se
   * devuelve con el rollback y no queda un hueco por un error técnico.
   */
  async siguienteEn(tx: ClientePrisma, tipo: TipoConsecutivo): Promise<ConsecutivoEmitido> {
    const empresaId = this.contexto.empresaIdRequerida(`consecutivo de ${tipo}`);

    // FOR UPDATE bloquea la fila hasta el fin de la transacción: cualquier otra
    // emisión del mismo tipo y empresa espera aquí en vez de leer el mismo valor.
    const filas = await tx.$queryRaw<Array<{ ultimoValor: number; prefijo: string }>>`
      SELECT "ultimoValor", "prefijo"
        FROM "Consecutivo"
       WHERE "empresaId" = ${empresaId}
         AND "tipo" = ${tipo}::"TipoConsecutivo"
       FOR UPDATE
    `;

    if (filas.length === 0) {
      // Primera emisión de este tipo para la empresa.
      const creado = await tx.consecutivo.create({
        data: { empresaId, tipo, prefijo: PREFIJO_POR_DEFECTO[tipo], ultimoValor: 1 },
        select: { prefijo: true, ultimoValor: true },
      });
      return this.formatear(creado.prefijo, creado.ultimoValor);
    }

    const actual = filas[0]!;
    const numero = actual.ultimoValor + 1;

    await tx.consecutivo.update({
      where: { empresaId_tipo: { empresaId, tipo } },
      data: { ultimoValor: numero },
    });

    return this.formatear(actual.prefijo || PREFIJO_POR_DEFECTO[tipo], numero);
  }

  /**
   * Emite un consecutivo abriendo su propia transacción.
   *
   * Solo para casos donde no hay un documento que crear en el mismo paso. Lo
   * habitual es `siguienteEn` dentro de la transacción del documento.
   */
  async siguiente(tipo: TipoConsecutivo): Promise<ConsecutivoEmitido> {
    return this.prisma.enTransaccion((tx) => this.siguienteEn(tx, tipo));
  }

  private formatear(prefijo: string, numero: number): ConsecutivoEmitido {
    return {
      numero,
      texto: `${prefijo}${String(numero).padStart(LONGITUD_NUMERO, '0')}`,
    };
  }
}
