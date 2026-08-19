-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security de las tablas de la Etapa 2.
--
-- Siete tablas nuevas con empresaId, siete políticas. Es el ítem del checklist de
-- docs/SEGURIDAD.md §7: toda tabla nueva con empresaId lleva su RLS en la misma
-- migración, no en una posterior. Una tabla sin política es una fuga esperando
-- a que alguien escriba la consulta equivocada.
--
-- `current_setting('app.empresa_id', true)` devuelve NULL si nadie la fijó, y la
-- comparación con NULL no devuelve filas: el modo de falla es cerrado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Permisos del rol de la aplicación sobre las tablas nuevas.
--
-- Se nombran una por una a propósito. Un `GRANT ... ON ALL TABLES IN SCHEMA public`
-- parece más cómodo, pero le devolvería a nexo_app el UPDATE y el DELETE sobre
-- "AuditLog" que la migración inicial le revocó, y el audit log dejaría de ser
-- append-only sin que nadie se diera cuenta. Un permiso amplio deshace en silencio
-- una restricción estrecha.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Cliente",
  "Operacion",
  "Destinatario",
  "ReglaDispersion",
  "ReglaDispersionDestino",
  "Dispersion",
  "DispersionDestino"
TO nexo_app;

ALTER TABLE "Cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cliente" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Cliente";
CREATE POLICY aislamiento_empresa ON "Cliente"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "Operacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Operacion" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Operacion";
CREATE POLICY aislamiento_empresa ON "Operacion"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "Destinatario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Destinatario" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Destinatario";
CREATE POLICY aislamiento_empresa ON "Destinatario"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "ReglaDispersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReglaDispersion" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "ReglaDispersion";
CREATE POLICY aislamiento_empresa ON "ReglaDispersion"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "ReglaDispersionDestino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReglaDispersionDestino" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "ReglaDispersionDestino";
CREATE POLICY aislamiento_empresa ON "ReglaDispersionDestino"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "Dispersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dispersion" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Dispersion";
CREATE POLICY aislamiento_empresa ON "Dispersion"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "DispersionDestino" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DispersionDestino" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "DispersionDestino";
CREATE POLICY aislamiento_empresa ON "DispersionDestino"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));
