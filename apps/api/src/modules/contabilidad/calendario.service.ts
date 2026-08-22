import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DatosImportarCalendario,
  FechaCalendario,
  ImportacionCalendario,
  PrevisualizacionCalendario,
  TipoObligacion,
} from '@nexo/shared';
import type { UsuarioAutenticado } from '../../common/decoradores';
import { conflicto, noEncontrado } from '../../common/errores';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Calendario tributario.
 *
 * **La tabla guarda fechas, no asignaciones.** Una fila dice «para el año X, la
 * obligación Y, el último dígito Z y el tipo de contribuyente W, la fecha es F».
 * Quién queda cubierto se resuelve al consultar, cruzando con los datos del
 * cliente.
 *
 * Guardar la asignación habría sido más rápido de consultar y mucho peor: el día
 * que un cliente cambie de tipo de contribuyente, todas sus fechas cambian, y una
 * tabla de asignaciones quedaría mintiendo hasta que alguien se acuerde de
 * regenerarla.
 *
 * **Esta es la única tabla de negocio sin `empresaId`**, y por tanto sin RLS: las
 * fechas de la DIAN son las mismas para todo el mundo. Por eso este servicio usa
 * `sinAislamiento` — no hay empresa contra la cual filtrar, y la extensión de
 * Prisma intentaría inyectar una columna que no existe.
 */
@Injectable()
export class CalendarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Las fechas que le corresponden a alguien.
   *
   * El cruce es lo único que hay que entender de este módulo:
   *
   *   · el **último dígito** siempre tiene que coincidir;
   *   · el **tipo de contribuyente** coincide, o la fila no lo especifica —una fila
   *     sin tipo aplica a cualquiera;
   *   · el **municipio** solo se compara en ICA, que es lo único municipal.
   */
  async consultar(parametros: {
    anio?: number;
    ultimoDigito: number;
    tipoContribuyente?: string;
    codigoDaneMunicipio?: string;
  }): Promise<FechaCalendario[]> {
    const anio = parametros.anio ?? new Date().getFullYear();

    const vigente = await this.prisma.sinAislamiento.importacionCalendario.findFirst({
      where: { anio, vigente: true },
      select: { id: true },
    });

    // Sin calendario cargado no hay nada que decir. Devolver vacío es correcto: no
    // es un error, es que nadie ha subido el archivo del año.
    if (!vigente) return [];

    const filas = await this.prisma.sinAislamiento.calendarioTributario.findMany({
      where: {
        importacionId: vigente.id,
        ultimoDigito: parametros.ultimoDigito,
        OR: [
          { tipoContribuyente: null },
          ...(parametros.tipoContribuyente
            ? [{ tipoContribuyente: parametros.tipoContribuyente as never }]
            : []),
        ],
      },
      orderBy: { fechaLimite: 'asc' },
    });

    const hoy = new Date();

    return filas
      .filter((fila) => {
        // El municipio solo importa en ICA. En el resto, una fila con municipio
        // sería un dato mal cargado, y se ignora en vez de filtrar de más.
        if (fila.tipoObligacion !== 'ICA') return true;
        if (!fila.codigoDaneMunicipio) return true;
        return fila.codigoDaneMunicipio === parametros.codigoDaneMunicipio;
      })
      .map((fila) => ({
        id: fila.id,
        anio: fila.anio,
        tipoObligacion: fila.tipoObligacion,
        fechaLimite: fila.fechaLimite.toISOString(),
        descripcion: fila.descripcion,
        diasRestantes: Math.ceil(
          (fila.fechaLimite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24),
        ),
      }));
  }

  /**
   * Qué va a pasar si se confirma esta importación.
   *
   * Cargar un archivo que define fechas legales para todo un año merece verse antes
   * de aplicarse. Si alguien sube el archivo equivocado, el error se ve aquí.
   */
  async previsualizar(datos: DatosImportarCalendario): Promise<PrevisualizacionCalendario> {
    const anterior = await this.prisma.sinAislamiento.importacionCalendario.findFirst({
      where: { anio: datos.anio, vigente: true },
      select: { id: true, filas: true, importadoEn: true },
    });

    const porObligacion = new Map<TipoObligacion, number>();
    for (const fila of datos.filas) {
      porObligacion.set(fila.tipoObligacion, (porObligacion.get(fila.tipoObligacion) ?? 0) + 1);
    }

    return {
      anio: datos.anio,
      filas: datos.filas.length,
      reemplaza: anterior
        ? {
            id: anterior.id,
            filas: anterior.filas,
            importadoEn: anterior.importadoEn.toISOString(),
          }
        : null,
      porObligacion: [...porObligacion.entries()].map(([tipoObligacion, filas]) => ({
        tipoObligacion,
        filas,
      })),
    };
  }

  /**
   * Aplica la importación.
   *
   * Reemplazar el calendario de un año **no borra el anterior**: lo marca como no
   * vigente. Un índice parcial en la base garantiza que solo haya uno vigente por
   * año, así que si dos personas importan a la vez, una de las dos falla en vez de
   * dejar dos calendarios activos.
   */
  async importar(
    datos: DatosImportarCalendario,
    usuario: UsuarioAutenticado,
  ): Promise<ImportacionCalendario> {
    const id = await this.prisma.enTransaccion(async () => {
      // Se usa `sinAislamiento` incluso dentro de la transacción: estas tablas no
      // tienen empresaId y la extensión intentaría filtrar por una columna ausente.
      const db = this.prisma.sinAislamiento;

      await db.importacionCalendario.updateMany({
        where: { anio: datos.anio, vigente: true },
        data: { vigente: false },
      });

      const importacion = await db.importacionCalendario.create({
        data: {
          anio: datos.anio,
          nota: datos.nota ?? null,
          filas: datos.filas.length,
          importadoPorId: usuario.id,
        },
        select: { id: true },
      });

      await db.calendarioTributario.createMany({
        data: datos.filas.map((fila) => ({
          anio: datos.anio,
          tipoObligacion: fila.tipoObligacion,
          ultimoDigito: fila.ultimoDigito,
          tipoContribuyente: fila.tipoContribuyente ?? null,
          codigoDaneMunicipio: fila.codigoDaneMunicipio ?? null,
          fechaLimite: fila.fechaLimite,
          descripcion: fila.descripcion ?? null,
          importacionId: importacion.id,
        })),
      });

      return importacion.id;
    });

    const importacion = await this.obtenerImportacion(id);

    await this.audit.registrar({
      accion: 'CREAR',
      entidad: 'ImportacionCalendario',
      entidadId: id,
      valorNuevo: importacion,
    });

    return importacion;
  }

  async historial(anio?: number): Promise<ImportacionCalendario[]> {
    const filas = await this.prisma.sinAislamiento.importacionCalendario.findMany({
      where: anio ? { anio } : {},
      select: this.campos,
      orderBy: [{ anio: 'desc' }, { importadoEn: 'desc' }],
      take: 50,
    });

    return filas.map((fila) => this.aVista(fila));
  }

  /**
   * Vuelve a un calendario anterior.
   *
   * Existe porque la importación es la única operación del sistema que puede dejar
   * todo un año de fechas mal de una sola vez, y notarlo un día después no debería
   * costar rehacer el archivo.
   */
  async restaurar(id: string, usuario: UsuarioAutenticado): Promise<ImportacionCalendario> {
    const objetivo = await this.prisma.sinAislamiento.importacionCalendario.findFirst({
      where: { id },
      select: { id: true, anio: true, vigente: true },
    });
    if (!objetivo) throw noEncontrado('esa importación del calendario');
    if (objetivo.vigente) throw conflicto('Esa importación ya es la vigente.');

    await this.prisma.enTransaccion(async () => {
      const db = this.prisma.sinAislamiento;
      await db.importacionCalendario.updateMany({
        where: { anio: objetivo.anio, vigente: true },
        data: { vigente: false },
      });
      await db.importacionCalendario.update({ where: { id }, data: { vigente: true } });
    });

    const importacion = await this.obtenerImportacion(id);

    await this.audit.registrar({
      accion: 'ACTUALIZAR',
      entidad: 'ImportacionCalendario',
      entidadId: id,
      valorNuevo: { ...importacion, restauradaPor: usuario.id },
    });

    return importacion;
  }

  private readonly campos = {
    id: true,
    anio: true,
    vigente: true,
    filas: true,
    nota: true,
    importadoEn: true,
    importadoPor: { select: { id: true, nombre: true } },
  } as const;

  private aVista(
    fila: Prisma.ImportacionCalendarioGetPayload<{ select: CalendarioService['campos'] }>,
  ): ImportacionCalendario {
    return { ...fila, importadoEn: fila.importadoEn.toISOString() };
  }

  private async obtenerImportacion(id: string): Promise<ImportacionCalendario> {
    const fila = await this.prisma.sinAislamiento.importacionCalendario.findFirstOrThrow({
      where: { id },
      select: this.campos,
    });
    return this.aVista(fila);
  }
}
