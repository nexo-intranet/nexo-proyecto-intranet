import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { HttpStatus } from '@nestjs/common';
import { ErrorNegocio } from '../../common/errores';
import type { AlmacenArchivos } from './archivos.service';

/**
 * Las dos implementaciones del almacén.
 *
 * En producción, un bucket privado S3-compatible (Cloudflare R2, según
 * docs/ARQUITECTURA.md §3.6). En desarrollo, una carpeta local — porque exigir
 * credenciales de un bucket para poder probar un formulario de gastos frena a
 * cualquiera que clone el repositorio.
 *
 * Cuál se usa lo decide la presencia de las variables, no un `NODE_ENV`. Así una
 * copia de desarrollo apuntando a un bucket real funciona sin tocar código, y
 * producción sin variables **falla al arrancar** en vez de escribir en un disco
 * efímero que Railway borra en el siguiente despliegue.
 */

export interface ConfigAlmacen {
  endpoint?: string;
  region: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Bucket privado S3-compatible. */
class AlmacenS3 implements AlmacenArchivos {
  readonly nombre: string;

  constructor(private readonly config: Required<ConfigAlmacen>) {
    this.nombre = `S3 (${config.bucket})`;
  }

  private async cliente() {
    // Import diferido: sin credenciales configuradas, el SDK no se carga siquiera.
    const { S3Client } = await import('@aws-sdk/client-s3');

    return new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async guardar(clave: string, contenido: Buffer, tipo: string): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const cliente = await this.cliente();

    await cliente.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: clave,
        Body: contenido,
        ContentType: tipo,
      }),
    );
  }

  async leer(clave: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const cliente = await this.cliente();

    try {
      const respuesta = await cliente.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: clave }),
      );

      const partes: Uint8Array[] = [];
      for await (const parte of respuesta.Body as AsyncIterable<Uint8Array>) partes.push(parte);
      return Buffer.concat(partes);
    } catch {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No se encontró el archivo.', HttpStatus.NOT_FOUND);
    }
  }

  async eliminar(clave: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const cliente = await this.cliente();
    await cliente.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: clave }));
  }
}

/**
 * Carpeta local. Solo para desarrollo y pruebas.
 *
 * La ruta se resuelve y se compara contra la raíz antes de tocar el disco. La clave
 * la genera el servidor, así que hoy no puede traer `..`, pero un almacén que
 * escribe donde le digan es la clase de cosa que un día deja de ser cierta.
 */
class AlmacenLocal implements AlmacenArchivos {
  readonly nombre = 'carpeta local (solo desarrollo)';
  private readonly raiz = resolve(process.cwd(), '.archivos');

  private rutaSegura(clave: string): string {
    const ruta = resolve(this.raiz, clave);
    if (!ruta.startsWith(this.raiz)) {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No se encontró el archivo.', HttpStatus.NOT_FOUND);
    }
    return ruta;
  }

  async guardar(clave: string, contenido: Buffer): Promise<void> {
    const ruta = this.rutaSegura(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido);
  }

  async leer(clave: string): Promise<Buffer> {
    try {
      return await readFile(this.rutaSegura(clave));
    } catch {
      throw new ErrorNegocio('NO_ENCONTRADO', 'No se encontró el archivo.', HttpStatus.NOT_FOUND);
    }
  }

  async eliminar(clave: string): Promise<void> {
    await rm(this.rutaSegura(clave), { force: true });
  }
}

export function crearAlmacen(config: ConfigAlmacen, produccion: boolean): AlmacenArchivos {
  const completo = config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey;

  if (completo) {
    return new AlmacenS3(config as Required<ConfigAlmacen>);
  }

  if (produccion) {
    // El disco de Railway es efímero: guardar ahí es perder los soportes en el
    // siguiente despliegue, y en silencio. Mejor que el arranque avise.
    throw new Error(
      'Faltan las credenciales del bucket (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, ' +
        'S3_SECRET_ACCESS_KEY). En producción no se puede guardar archivos en disco local.',
    );
  }

  return new AlmacenLocal();
}
