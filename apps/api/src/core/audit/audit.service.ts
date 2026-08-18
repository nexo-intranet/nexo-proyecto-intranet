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
   */
  async registrar(entrada: RegistroAudit): Promise<void> {
    const peticion = this.contexto.obtener();

    try {
      await this.prisma.db.auditLog.create({
        data: {
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
      });

      this.contexto.marcarAuditado();
    } catch (error) {
      // Un fallo al auditar no puede tumbar la operación del usuario, pero sí tiene
      // que quedar visible: un audit log con huecos silenciosos no sirve de nada.
      this.registro.error(
        `No se pudo registrar en el audit log: ${entrada.accion} ${entrada.entidad}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
