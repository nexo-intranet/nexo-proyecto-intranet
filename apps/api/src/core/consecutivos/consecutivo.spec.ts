import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';
import { ContextoService } from '../context/contexto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsecutivoService } from './consecutivo.service';

cargarEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Consecutivos de documentos legales.
 *
 * El brief exige pruebas justo aquí (§4.10). Lo que se verifica no es que el
 * contador sume uno —eso es trivial— sino que **dos emisiones simultáneas nunca
 * produzcan el mismo número**. Ese es el error que rompe la unicidad de una
 * factura, y solo aparece bajo concurrencia real contra la base de datos.
 */

const EMPRESA = 'contest_empresa';
const OTRA_EMPRESA = 'contest_otra_empresa';

async function comoDueno<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

async function limpiar(): Promise<void> {
  await comoDueno(async (cliente) => {
    await cliente.query('DELETE FROM "Consecutivo" WHERE "empresaId" = ANY($1)', [
      [EMPRESA, OTRA_EMPRESA],
    ]);
    await cliente.query('DELETE FROM "EmpresaAdministrada" WHERE "id" = ANY($1)', [
      [EMPRESA, OTRA_EMPRESA],
    ]);
  });
}

describe('ConsecutivoService', () => {
  let contexto: ContextoService;
  let prisma: PrismaService;
  let consecutivos: ConsecutivoService;

  beforeAll(async () => {
    await limpiar();
    await comoDueno(async (cliente) => {
      for (const [id, nit] of [
        [EMPRESA, '900000101'],
        [OTRA_EMPRESA, '900000102'],
      ]) {
        await cliente.query(
          'INSERT INTO "EmpresaAdministrada" ' +
            '("id","nombre","nit","digitoVerificacion","tipoContribuyente","municipio","updatedAt") ' +
            "VALUES ($1,$2,$3,1,'PERSONA_JURIDICA','Medellin',now())",
          [id, `Empresa ${id}`, nit],
        );
      }
    });

    contexto = new ContextoService();
    prisma = new PrismaService(contexto, process.env.DATABASE_URL!);
    consecutivos = new ConsecutivoService(prisma, contexto);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await limpiar();
  });

  /** Ejecuta dentro de un contexto de petición con la empresa indicada. */
  const conEmpresa = <T>(empresaId: string, fn: () => Promise<T>): Promise<T> =>
    contexto.ejecutarCon({ esAdministrador: true, empresaId }, fn);

  it('empieza en uno y avanza de a uno', async () => {
    const primero = await conEmpresa(EMPRESA, () => consecutivos.siguiente('ORDEN_PAGO'));
    const segundo = await conEmpresa(EMPRESA, () => consecutivos.siguiente('ORDEN_PAGO'));

    expect(primero.numero).toBe(1);
    expect(segundo.numero).toBe(2);
  });

  it('formatea con prefijo y ceros a la izquierda', async () => {
    const emitido = await conEmpresa(EMPRESA, () => consecutivos.siguiente('ORDEN_PAGO'));
    expect(emitido.texto).toBe(`OP-${String(emitido.numero).padStart(6, '0')}`);
  });

  it('cada tipo de documento lleva su propia secuencia', async () => {
    const factura = await conEmpresa(EMPRESA, () => consecutivos.siguiente('FACTURA'));
    expect(factura.numero).toBe(1);
    expect(factura.texto).toBe('FV-000001');
  });

  it('cada empresa lleva su propia secuencia', async () => {
    const otra = await conEmpresa(OTRA_EMPRESA, () => consecutivos.siguiente('ORDEN_PAGO'));
    expect(otra.numero).toBe(1);
  });

  /**
   * Timeout generoso, y no por debilitar la prueba.
   *
   * Veinte transacciones se serializan sobre el mismo `SELECT ... FOR UPDATE`, que
   * es justo lo que se está comprobando. Con el resto del monorepo compilando en
   * paralelo, esa fila tarda más que los 5 s que Jest da por defecto, y la prueba
   * falla por falta de CPU en vez de por un número repetido. Lo que verifica —que no
   * haya duplicados ni huecos— sigue siendo exactamente lo mismo.
   */
  it('veinte emisiones simultáneas no repiten ningún número', async () => {
    const cantidad = 20;

    const emitidos = await Promise.all(
      Array.from({ length: cantidad }, () =>
        conEmpresa(EMPRESA, () => consecutivos.siguiente('RECIBO_NOMINA')),
      ),
    );

    const numeros = emitidos.map((emitido) => emitido.numero);
    const unicos = new Set(numeros);

    expect(unicos.size).toBe(cantidad);
    // Además de no repetirse, no deja huecos: 1..cantidad exactamente.
    expect([...unicos].sort((a, b) => a - b)).toEqual(
      Array.from({ length: cantidad }, (_, i) => i + 1),
    );
  }, 30_000);

  it('no emite sin empresa en el contexto', async () => {
    await expect(
      contexto.ejecutarCon({ esAdministrador: true }, () => consecutivos.siguiente('FACTURA')),
    ).rejects.toThrow(/empresa activa/i);
  });
});
