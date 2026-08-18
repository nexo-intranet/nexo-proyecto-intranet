-- Rol con el que se conecta la aplicación en tiempo de ejecución.
--
-- Deliberadamente NO es dueño de ninguna tabla y NO tiene BYPASSRLS ni SUPERUSER:
-- esa es la razón por la que las políticas de Row Level Security aplican de verdad.
-- Un superusuario las ignoraría en silencio y el aislamiento entre empresas
-- quedaría dependiendo solo del código de la aplicación.
--
-- Los GRANT sobre tablas y las políticas RLS se crean en la migración de Prisma,
-- porque las tablas todavía no existen en este punto.
--
-- En producción (Railway) este rol se crea a mano una sola vez, con una clave
-- distinta y guardada en las variables de entorno del servicio.
-- Ver docs/SEGURIDAD.md §1.

CREATE ROLE nexo_app WITH LOGIN PASSWORD 'nexo_local_app' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE nexo TO nexo_app;
