import { config as cargarEnv } from 'dotenv';
import { defineConfig } from '@prisma/config';

// El .env vive en la raíz del monorepo y lo comparten API y web. Prisma corre con
// el directorio de trabajo en apps/api, así que hay que apuntarle explícitamente.
cargarEnv({ path: ['../../.env', '.env'], quiet: true });

/**
 * Configuración de las herramientas de Prisma (migrate, studio, seed).
 *
 * Ojo con la separación de roles: aquí va DIRECT_URL, que es el rol `nexo_owner`,
 * dueño del esquema. Es el único lugar del proyecto donde se usa ese rol.
 * El cliente de la aplicación se conecta con DATABASE_URL (`nexo_app`, sin
 * BYPASSRLS) desde PrismaService. Ver docs/SEGURIDAD.md §1.
 *
 * La URL se lee con `process.env` y no con el helper `env()` de Prisma porque este
 * archivo también se carga durante `prisma generate`, que corre en el postinstall
 * y no necesita base de datos. Con `env()`, un clon limpio sin `.env` fallaría al
 * instalar. Si falta la URL, quien avisa es `migrate`, que sí la necesita.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
