import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ErrorNegocio } from '../../common/errores';
import { HttpStatus } from '@nestjs/common';

/**
 * Archivos subidos por usuarios.
 *
 * Reglas del brief §4.13, que no son negociables:
 *
 *   · solo PDF, JPG y PNG;
 *   · límite de tamaño;
 *   · almacenamiento **privado**, nunca un bucket público;
 *   · nombre de archivo generado por el servidor, nunca el que trae el usuario;
 *   · servidos **siempre** por el backend, que verifica permisos.
 *
 * Sobre lo último vale la pena insistir: aunque el almacenamiento admite URLs
 * firmadas de vida corta, aquí no se usan para leer. Una URL firmada, aunque dure
 * cinco minutos, es un enlace que se puede pegar en un chat y funciona sin sesión.
 * Sirviendo por el backend, cada descarga vuelve a verificar permiso y empresa.
 */

export const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type TipoArchivo = (typeof TIPOS_PERMITIDOS)[number];

/** 10 MB. Un soporte contable no necesita más, y el límite acota el abuso. */
export const TAMANO_MAXIMO = 10 * 1024 * 1024;

/**
 * Firmas de los formatos aceptados.
 *
 * Se valida por el **contenido**, no por la extensión ni por el `Content-Type`: las
 * dos cosas las escribe quien sube el archivo. Un `.pdf` que en realidad es un
 * ejecutable pasa cualquier validación por nombre y ninguna por magic bytes.
 */
const FIRMAS: Array<{ tipo: TipoArchivo; bytes: number[]; desplazamiento?: number }> = [
  { tipo: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export function detectarTipo(contenido: Buffer): TipoArchivo | null {
  for (const { tipo, bytes, desplazamiento = 0 } of FIRMAS) {
    const coincide = bytes.every((byte, indice) => contenido[desplazamiento + indice] === byte);
    if (coincide) return tipo;
  }
  return null;
}

export interface ArchivoGuardado {
  clave: string;
  tipo: TipoArchivo;
  tamano: number;
}

/**
 * Qué sabe hacer un almacén de archivos.
 *
 * Se tipa aparte para poder cambiar de implementación sin tocar a quien lo usa,
 * igual que `CalculadoraNomina` o `InvoicingProvider`. Hoy hay dos: el bucket real y
 * uno en memoria para desarrollo y pruebas.
 */
export interface AlmacenArchivos {
  readonly nombre: string;
  guardar(clave: string, contenido: Buffer, tipo: string): Promise<void>;
  leer(clave: string): Promise<Buffer>;
  eliminar(clave: string): Promise<void>;
}

@Injectable()
export class ArchivosService {
  private readonly registro = new Logger(ArchivosService.name);

  constructor(private readonly almacen: AlmacenArchivos) {
    this.registro.log(`Almacenamiento de archivos: ${almacen.nombre}`);
  }

  /**
   * Valida y guarda.
   *
   * La clave la arma el servidor con el prefijo de la empresa y bytes aleatorios: el
   * nombre que trae el usuario no se usa ni para nombrar ni para enrutar. Un nombre
   * como `../../etc/passwd` deja de ser interesante cuando nunca se concatena.
   */
  async guardar(
    empresaId: string,
    carpeta: string,
    contenido: Buffer,
    nombreOriginal: string,
  ): Promise<ArchivoGuardado> {
    if (contenido.length === 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El archivo llegó vacío.', HttpStatus.BAD_REQUEST);
    }

    if (contenido.length > TAMANO_MAXIMO) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `El archivo pesa más de ${Math.round(TAMANO_MAXIMO / 1024 / 1024)} MB.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const tipo = detectarTipo(contenido);
    if (!tipo) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        'Solo se aceptan archivos PDF, JPG o PNG. El contenido del archivo no corresponde a ninguno de esos formatos.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const extension = tipo === 'application/pdf' ? 'pdf' : tipo === 'image/png' ? 'png' : 'jpg';
    const clave = `${empresaId}/${carpeta}/${randomBytes(16).toString('hex')}.${extension}`;

    await this.almacen.guardar(clave, contenido, tipo);

    this.registro.log(
      `Archivo guardado (${tipo}, ${contenido.length} bytes) desde «${nombreOriginal}»`,
    );

    return { clave, tipo, tamano: contenido.length };
  }

  /**
   * Lee un archivo para servirlo.
   *
   * La clave lleva el `empresaId` como prefijo y quien llama **tiene que**
   * comprobarlo contra la empresa activa antes de pedir el archivo. Aquí se
   * verifica también, como red: es barato y evita que un descuido en un servicio se
   * convierta en una fuga entre empresas.
   */
  async leer(empresaId: string, clave: string): Promise<Buffer> {
    if (!clave.startsWith(`${empresaId}/`)) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No se encontró el archivo.', HttpStatus.NOT_FOUND);
    }

    return this.almacen.leer(clave);
  }

  async eliminar(empresaId: string, clave: string): Promise<void> {
    if (!clave.startsWith(`${empresaId}/`)) return;
    await this.almacen.eliminar(clave);
  }
}
