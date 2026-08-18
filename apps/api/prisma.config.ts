import { defineConfig, env } from '@prisma/config';

/**
 * Configuración de las herramientas de Prisma (migrate, studio, seed).
 *
 * Ojo con la separación de roles: aquí va DIRECT_URL, que es el rol `nexo_owner`,
 * dueño del esquema. Es el único lugar del proyecto donde se usa ese rol.
 * El cliente de la aplicación se conecta con DATABASE_URL (`nexo_app`, sin
 * BYPASSRLS) desde PrismaService. Ver docs/SEGURIDAD.md §1.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
