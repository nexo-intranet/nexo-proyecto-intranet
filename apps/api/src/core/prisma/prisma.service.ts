import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ContextoService } from '../context/contexto.service';
import { crearExtensionAislamiento, type EjecutorRls } from './extensiones/aislamiento-empresa';

/**
 * Acceso a la base de datos.
 *
 * Se conecta con `DATABASE_URL`, que es el rol `nexo_app`: no es dueño de ninguna
 * tabla y no tiene BYPASSRLS. Esa es la razón por la que las políticas de Row Level
 * Security aplican de verdad. El rol dueño solo aparece en `prisma.config.ts`, para
 * las migraciones. Ver docs/SEGURIDAD.md §1.
 *
 * Los repositorios usan `prisma.db`, nunca el cliente base: `db` es el que trae el
 * aislamiento por empresa.
 */
function crearCliente(connectionString: string, contexto: ContextoService) {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  // La extensión necesita el propio cliente extendido para abrir la transacción en
  // la que fija `app.empresa_id`. Se resuelve con una referencia diferida para no
  // caer en una inferencia de tipos circular.
  let ejecutor: EjecutorRls | null = null;
  const db = base.$extends(crearExtensionAislamiento(contexto, () => ejecutor));
  ejecutor = db as unknown as EjecutorRls;

  return { base, db };
}

export type ClientePrisma = ReturnType<typeof crearCliente>['db'];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly registro = new Logger(PrismaService.name);
  private readonly base: PrismaClient;

  /** Cliente con aislamiento por empresa. Es el único que deben usar los módulos. */
  readonly db: ClientePrisma;

  constructor(
    private readonly contexto: ContextoService,
    connectionString: string,
  ) {
    const { base, db } = crearCliente(connectionString, contexto);
    this.base = base;
    this.db = db;
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.registro.log('Conexión a PostgreSQL establecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  /**
   * Transacción interactiva con `app.empresa_id` fijada una sola vez al abrirla.
   *
   * Es lo que deben usar las operaciones de varios pasos: emitir un consecutivo y
   * crear el documento, o escribir una entidad y su registro de auditoría. Dentro
   * del callback el aislamiento sigue aplicando, pero sin abrir una transacción por
   * cada consulta.
   */
  async enTransaccion<T>(fn: (tx: ClientePrisma) => Promise<T>): Promise<T> {
    const empresaId = this.contexto.empresaId();

    return this.db.$transaction(async (tx) => {
      if (empresaId) {
        await tx.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, TRUE)`;
      }
      return this.contexto.conTransaccionAbierta(() => fn(tx as unknown as ClientePrisma));
    });
  }

  /**
   * Ejecuta SQL sin pasar por el aislamiento de la extensión.
   *
   * Reservado para la infraestructura (migraciones de datos, chequeos de salud) y
   * para las pruebas de RLS. Nunca para consultas de negocio: ahí la única defensa
   * que quedaría sería la política de PostgreSQL.
   */
  get sinAislamiento(): PrismaClient {
    return this.base;
  }
}
