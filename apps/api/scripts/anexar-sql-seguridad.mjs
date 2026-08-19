/**
 * Anexa prisma/sql/seguridad.sql al final de la migración más reciente.
 *
 * Prisma genera el DDL de las tablas, pero no sabe nada de triggers, GRANTs ni
 * políticas de Row Level Security. En vez de escribirlas a mano cada vez —y
 * arriesgarnos a olvidar una—, se mantienen en un archivo revisable y se anexan
 * a la migración creada con `--create-only`.
 *
 * Uso:
 *   prisma migrate dev --create-only --name inicial
 *   node scripts/anexar-sql-seguridad.mjs
 *   prisma migrate dev
 */

import { readdirSync, readFileSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const carpetaMigraciones = join(raiz, 'prisma', 'migrations');
// Qué SQL anexar. Cada etapa trae el suyo con las políticas de sus tablas nuevas.
const nombreSql = process.argv[2] ?? 'seguridad.sql';
const archivoSeguridad = join(raiz, 'prisma', 'sql', nombreSql);

/** Marca de anexado: evita duplicar el SQL si el script corre dos veces. */
const MARCA = '-- [' + nombreSql + ']';

const migraciones = readdirSync(carpetaMigraciones)
  .filter((nombre) => statSync(join(carpetaMigraciones, nombre)).isDirectory())
  .sort();

const ultima = migraciones.at(-1);
if (!ultima) {
  console.error('No hay migraciones. Corre primero: prisma migrate dev --create-only');
  process.exit(1);
}

const destino = join(carpetaMigraciones, ultima, 'migration.sql');
const contenido = readFileSync(destino, 'utf8');

if (contenido.includes(MARCA)) {
  console.log(`La migración ${ultima} ya tiene el SQL de seguridad. Nada que hacer.`);
  process.exit(0);
}

const sql = readFileSync(archivoSeguridad, 'utf8');
appendFileSync(destino, `\n\n${MARCA}\n${sql}`, 'utf8');

console.log(`SQL de seguridad anexado a ${ultima}/migration.sql`);
console.log('Revisa el archivo antes de aplicar la migración.');
