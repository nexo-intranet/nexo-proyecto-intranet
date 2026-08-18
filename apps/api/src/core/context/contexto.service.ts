import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/**
 * Contexto de la petición en curso.
 *
 * Existe para que el aislamiento por empresa y el audit log no dependan de que cada
 * endpoint se acuerde de pasar `empresaId` y `usuarioId` hacia abajo. El brief es
 * explícito: "impleméntalo en el repositorio o con middleware, no confiando en que
 * cada endpoint se acuerde".
 */
export interface ContextoPeticion {
  usuarioId?: string;
  esAdministrador: boolean;
  /** Empresa activa. La fija EmpresaGuard después de verificar el acceso. */
  empresaId?: string;
  ip?: string;
  userAgent?: string;
  ruta?: string;
  /**
   * Marca que ya hay una transacción abierta con `app.empresa_id` fijada. Evita
   * que la extensión de Prisma abra una transacción anidada por cada consulta.
   */
  dentroDeTransaccion?: boolean;
  /**
   * Un servicio ya registró esta mutación en el audit log con su valor anterior.
   * El interceptor no vuelve a registrarla de forma genérica.
   */
  auditado?: boolean;
}

/** Error de programación: se intentó tocar datos de negocio sin empresa activa. */
export class SinEmpresaEnContextoError extends Error {
  constructor(detalle: string) {
    super(
      `Se intentó consultar ${detalle} sin una empresa activa en el contexto. ` +
        'Ninguna consulta de negocio puede ejecutarse sin filtro por empresa.',
    );
    this.name = 'SinEmpresaEnContextoError';
  }
}

@Injectable()
export class ContextoService {
  private readonly almacen = new AsyncLocalStorage<ContextoPeticion>();

  /** Ejecuta `fn` dentro de un contexto nuevo. Lo llama el middleware de petición. */
  ejecutarCon<T>(contexto: ContextoPeticion, fn: () => T): T {
    return this.almacen.run(contexto, fn);
  }

  obtener(): ContextoPeticion | undefined {
    return this.almacen.getStore();
  }

  usuarioId(): string | undefined {
    return this.almacen.getStore()?.usuarioId;
  }

  esAdministrador(): boolean {
    return this.almacen.getStore()?.esAdministrador ?? false;
  }

  empresaId(): string | undefined {
    return this.almacen.getStore()?.empresaId;
  }

  empresaIdRequerida(detalle = 'datos de negocio'): string {
    const empresaId = this.empresaId();
    if (!empresaId) throw new SinEmpresaEnContextoError(detalle);
    return empresaId;
  }

  /**
   * Fija la identidad del usuario autenticado. Solo lo llama JwtAuthGuard.
   */
  establecerUsuario(usuarioId: string, esAdministrador: boolean): void {
    const contexto = this.almacen.getStore();
    if (!contexto) return;
    contexto.usuarioId = usuarioId;
    contexto.esAdministrador = esAdministrador;
  }

  /**
   * Fija la empresa activa. Solo lo llama EmpresaGuard, y únicamente después de
   * comprobar contra UsuarioEmpresa que el usuario tiene acceso a ella.
   */
  establecerEmpresa(empresaId: string): void {
    const contexto = this.almacen.getStore();
    if (!contexto) return;
    contexto.empresaId = empresaId;
  }

  /** Marca que la mutación ya quedó registrada con detalle. Lo llama AuditService. */
  marcarAuditado(): void {
    const contexto = this.almacen.getStore();
    if (contexto) contexto.auditado = true;
  }

  fueAuditado(): boolean {
    return this.almacen.getStore()?.auditado ?? false;
  }

  dentroDeTransaccion(): boolean {
    return this.almacen.getStore()?.dentroDeTransaccion ?? false;
  }

  /** Marca el tramo en que hay una transacción abierta. Solo lo usa PrismaService. */
  async conTransaccionAbierta<T>(fn: () => Promise<T>): Promise<T> {
    const contexto = this.almacen.getStore();
    if (!contexto) return fn();

    const anterior = contexto.dentroDeTransaccion;
    contexto.dentroDeTransaccion = true;
    try {
      return await fn();
    } finally {
      contexto.dentroDeTransaccion = anterior;
    }
  }

  /**
   * Ejecuta `fn` con otra empresa activa, y restaura la anterior al terminar.
   *
   * Es la única forma admitida de tocar varias empresas en una misma petición
   * (por ejemplo, un reporte consolidado del administrador). No existe un modo
   * "omitir aislamiento": se itera empresa por empresa. Ver docs/SEGURIDAD.md §1.
   */
  async conEmpresa<T>(empresaId: string, fn: () => Promise<T>): Promise<T> {
    const contexto = this.almacen.getStore();
    if (!contexto) throw new SinEmpresaEnContextoError('otra empresa');

    const anterior = contexto.empresaId;
    contexto.empresaId = empresaId;
    try {
      return await fn();
    } finally {
      contexto.empresaId = anterior;
    }
  }
}
