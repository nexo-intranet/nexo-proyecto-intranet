-- ─────────────────────────────────────────────────────────────────────────────
-- Garantías que viven en la base de datos, no en el código de la aplicación.
--
-- Este archivo se anexa a la migración inicial generada por Prisma:
--   pnpm --filter @nexo/api exec prisma migrate dev --create-only --name inicial
--   pnpm --filter @nexo/api db:sql   (agrega este SQL al final de la migración)
--   pnpm --filter @nexo/api exec prisma migrate dev
--
-- Se versiona aparte para poder revisarlo y reusarlo: cada tabla nueva con
-- empresaId repite el bloque de RLS del final.
-- Ver docs/SEGURIDAD.md §1.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. El audit log es append-only ───────────────────────────────────────────
-- No basta con no escribir el UPDATE en el código: la base lo rechaza.

CREATE OR REPLACE FUNCTION audit_log_inmutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es append-only: no se permite %', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_modificar ON "AuditLog";
CREATE TRIGGER audit_log_no_modificar
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();

-- ── 2. Una sola empresa puede ser Nexo ───────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS empresa_nexo_unica
  ON "EmpresaAdministrada" ("esNexo") WHERE "esNexo" = true;

-- ── 3. Permisos del rol de aplicación ────────────────────────────────────────
-- nexo_app no es dueño de ninguna tabla y no tiene BYPASSRLS: por eso las
-- políticas de abajo aplican de verdad en runtime.

GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexo_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexo_app;

REVOKE UPDATE, DELETE ON "AuditLog" FROM nexo_app;

-- ── 4. Row Level Security ────────────────────────────────────────────────────
-- current_setting('app.empresa_id', true) devuelve NULL si nadie la fijó, y la
-- comparación con NULL no devuelve filas: el modo de falla es cerrado.
-- La variable la fija la extensión de Prisma con SET LOCAL, por transacción.

ALTER TABLE "Consecutivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consecutivo" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_empresa ON "Consecutivo";
CREATE POLICY aislamiento_empresa ON "Consecutivo"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

-- El audit log se lee por empresa, pero se inserta siempre: registra también los
-- eventos anteriores a elegir empresa (ingreso, ingreso fallido, salida).
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditoria_lectura ON "AuditLog";
CREATE POLICY auditoria_lectura ON "AuditLog" FOR SELECT
  USING ("empresaId" = current_setting('app.empresa_id', true));

DROP POLICY IF EXISTS auditoria_insercion ON "AuditLog";
CREATE POLICY auditoria_insercion ON "AuditLog" FOR INSERT
  WITH CHECK (true);

-- ── Plantilla para cada tabla futura con empresaId ───────────────────────────
--
-- ALTER TABLE "NombreTabla" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "NombreTabla" FORCE  ROW LEVEL SECURITY;
-- CREATE POLICY aislamiento_empresa ON "NombreTabla"
--   USING      ("empresaId" = current_setting('app.empresa_id', true))
--   WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));
