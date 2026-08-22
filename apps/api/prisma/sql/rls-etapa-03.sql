-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security de las tablas de la Etapa 3.
--
-- Dos tablas nuevas con empresaId, dos políticas. Es el ítem del checklist de
-- docs/SEGURIDAD.md §7: toda tabla nueva con empresaId lleva su RLS en la misma
-- migración, no en una posterior. Una tabla sin política es una fuga esperando
-- a que alguien escriba la consulta equivocada.
--
-- `current_setting('app.empresa_id', true)` devuelve NULL si nadie la fijó, y la
-- comparación con NULL no devuelve filas: el modo de falla es cerrado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Permisos del rol de la aplicación, nombrando las tablas una por una.
--
-- Nunca `ON ALL TABLES IN SCHEMA public`: eso le devolvería a nexo_app el UPDATE y
-- el DELETE sobre "AuditLog" que la migración inicial le revocó, y el audit log
-- dejaría de ser append-only sin que nadie se diera cuenta.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Egreso"
TO nexo_app;

-- "OrdenPago" es un documento legal: se emite, se consulta y se anula.
--
-- Sin DELETE, y a propósito. Anular es un UPDATE que deja la fila con su motivo;
-- borrarla dejaría un hueco en la serie de consecutivos. Que el permiso no exista
-- convierte "no se borra" en algo que la base de datos impide, no en una regla que
-- el código tiene que recordar.
GRANT SELECT, INSERT, UPDATE ON
  "OrdenPago"
TO nexo_app;

-- Y el DELETE se revoca **explícitamente**.
--
-- Sin esta línea el GRANT de arriba no sirve de nada: la migración inicial dejó un
-- `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES`, así
-- que toda tabla nueva nace con CRUD completo para nexo_app. Otorgar de menos no
-- quita lo ya concedido por defecto; hay que revocar.
REVOKE DELETE ON "OrdenPago" FROM nexo_app;

ALTER TABLE "Egreso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Egreso" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Egreso";
CREATE POLICY aislamiento_empresa ON "Egreso"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "OrdenPago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrdenPago" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "OrdenPago";
CREATE POLICY aislamiento_empresa ON "OrdenPago"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));
