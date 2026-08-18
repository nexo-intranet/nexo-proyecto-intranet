import { Injectable, Logger } from '@nestjs/common';
import type { AccionAudit } from '@nexo/shared';
import { ContextoService } from '../context/contexto.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Audit log (docs/SEGURIDAD.md §3.2).
 *
 * La tabla es append-only y eso lo garantiza PostgreSQL con un trigger y con los
 * permisos del rol, no este servicio. Aquí solo se decide qué se registra y con
 * qué forma.
 */

export interface RegistroAudit {
  accion: AccionAudit;
  entidad: string;
  entidadId?: string | null;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  /** Se usa cuando aún no hay usuario en el contexto, como en un ingreso fallido. */
  usuarioId?: string | null;
}

/**
 * Campos que nunca se copian al audit log, en ningún nivel del objeto.
 * Registrar el cambio de una contraseña es correcto; registrar su valor, no.
 */
const CAMPOS_SENSIBLES = new Set([
  'password',
  'passwordActual',
  'passwordNueva',
  'passwordHash',
  'passwordTemporal',
  'confirmacion',
  'totpSecret',
  'totpSecretCifrado',
  'codigo',
  'codigoRespaldo',
  'codigoHash',
  'tokenReto',
  'tokenHash',
  'token',
  'credencialesCifradas',
  'numeroDoc',
  'numeroDocumento',
]);

const MARCA_REDACTADO = '[redactado]';

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (valor === null || valor === undefined) return valor;
  if (profundidad > 6) return MARCA_REDACTADO;

  if (Array.isArray(valor)) {
    return valor.map((elemento) => redactar(elemento, profundidad + 1));
  }

  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();

    const salida: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = CAMPOS_SENSIBLES.has(clave)
        ? MARCA_REDACTADO
        : redactar(contenido, profundidad + 1);
    }
    return salida;
  }

  return valor;
}

@Injectable()
export class AuditService {
  private readonly registro = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contexto: ContextoService,
  ) {}

  /**
   * Escribe una entrada. Marca la petición como auditada para que el interceptor
   * no vuelva a registrar la misma mutación de forma genérica.
   *
   * **Propaga el error a propósito.** Lo normal es que esto se llame dentro de la
   * misma transacción que hace el cambio, así que si la auditoría falla, el cambio
   * se deshace con ella. El brief no admite mutaciones sin registro, y una
   * excepción tragada aquí sería justo eso, sin que nadie se entere.
   */
  async registrar(entrada: RegistroAudit): Promise<void> {
    const peticion = this.contexto.obtener();

    // Se usa createMany y no create porque `create` genera INSERT ... RETURNING, y
    // con RLS activa el RETURNING pasa por la política de SELECT. Los eventos
    // previos a elegir empresa —ingreso, ingreso fallido, salida— no tienen
    // empresaId, así que esa política los filtraría y el INSERT fallaría entero.
    // createMany no devuelve la fila, que además nunca necesitamos.
    await this.prisma.db.auditLog.createMany({
      data: [
        {
          usuarioId: entrada.usuarioId ?? peticion?.usuarioId ?? null,
          accion: entrada.accion,
          entidad: entrada.entidad,
          entidadId: entrada.entidadId ?? null,
          valorAnterior: redactar(entrada.valorAnterior) as never,
          valorNuevo: redactar(entrada.valorNuevo) as never,
          ip: peticion?.ip ?? null,
          userAgent: peticion?.userAgent ?? null,
          ruta: peticion?.ruta ?? null,
        },
      ],
    });

    this.contexto.marcarAuditado();
  }

  /**
   * Igual que `registrar`, pero sin propagar el error.
   *
   * Solo lo usa el interceptor, que corre **después** de que la mutación ya se
   * confirmó: fallar ahí devolvería un error al usuario por un cambio que sí
   * ocurrió, y eso es peor que un registro perdido. El fallo queda en el log del
   * servidor, bien visible.
   */
  async registrarSinFallar(entrada: RegistroAudit): Promise<void> {
    try {
      await this.registrar(entrada);
    } catch (error) {
      this.registro.error(
        `No se pudo registrar en el audit log: ${entrada.accion} ${entrada.entidad}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
