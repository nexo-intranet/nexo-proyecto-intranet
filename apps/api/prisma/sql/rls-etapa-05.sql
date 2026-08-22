-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security de las tablas de la Etapa 5.
--
-- Cuatro tablas nuevas con empresaId, cuatro políticas. Es el ítem del checklist de
-- docs/SEGURIDAD.md §7: toda tabla nueva con empresaId lleva su RLS en la misma
-- migración. Una tabla sin política es una fuga esperando a que alguien escriba la
-- consulta equivocada.
--
-- `current_setting('app.empresa_id', true)` devuelve NULL si nadie la fijó, y la
-- comparación con NULL no devuelve filas: el modo de falla es cerrado.
-- ─────────────────────────────────────────────────────────────────────────────

-- Permisos del rol de la aplicación, nombrando las tablas una por una.
--
-- Nunca `ON ALL TABLES IN SCHEMA public`: eso le devolvería a nexo_app el UPDATE y
-- el DELETE sobre "AuditLog" que la migración inicial le revocó.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Empleado",
  "ConceptoNomina",
  "DocumentoLaboral"
TO nexo_app;

-- "ReciboNomina" es un documento legal con consecutivo: se emite, se consulta y se
-- anula. Anular es un UPDATE que deja la fila con su motivo.
--
-- El REVOKE de abajo no es redundante: la migración inicial dejó un
-- `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES`, así
-- que toda tabla nueva nace con CRUD completo para nexo_app. Otorgar de menos no
-- quita lo ya concedido por defecto; hay que revocar. Es la misma lección de la
-- etapa 3, y por eso queda escrita también aquí.
GRANT SELECT, INSERT, UPDATE ON
  "ReciboNomina"
TO nexo_app;
REVOKE DELETE ON "ReciboNomina" FROM nexo_app;

-- Los conceptos sí admiten DELETE: son las líneas de un recibo, y corregir un
-- recibo significa anularlo y emitir uno nuevo con sus propias líneas. Las del
-- recibo anulado se conservan; el DELETE existe para deshacer una liquidación a
-- medias dentro de la misma transacción, no para borrar historia.

ALTER TABLE "Empleado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Empleado" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Empleado";
CREATE POLICY aislamiento_empresa ON "Empleado"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "ReciboNomina" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReciboNomina" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "ReciboNomina";
CREATE POLICY aislamiento_empresa ON "ReciboNomina"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "ConceptoNomina" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConceptoNomina" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "ConceptoNomina";
CREATE POLICY aislamiento_empresa ON "ConceptoNomina"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "DocumentoLaboral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentoLaboral" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "DocumentoLaboral";
CREATE POLICY aislamiento_empresa ON "DocumentoLaboral"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));
