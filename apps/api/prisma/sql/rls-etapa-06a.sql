-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security de las tablas de la Etapa 6a.
--
-- Dos tablas nuevas con empresaId —"Gasto" y "SolicitudDocumento"— y dos políticas.
--
-- **"CalendarioTributario" e "ImportacionCalendario" van sin RLS, a propósito.**
-- Las fechas de la DIAN son las mismas para todo el mundo: no cuelgan de ninguna
-- empresa y no tienen `empresaId` que filtrar. Ponerles una política obligaría a
-- inventar un dueño que no existe, y duplicar el calendario por empresa sería
-- guardar catorce copias idénticas de la misma tabla oficial.
--
-- Que sean las únicas tablas de negocio sin RLS es justo la razón por la que queda
-- escrito aquí y comprobado en `rls.spec.ts`: para que se lea como una decisión y
-- no como un olvido.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Gasto",
  "SolicitudDocumento"
TO nexo_app;

-- El calendario lo carga un administrador y lo consulta todo el mundo. La escritura
-- la acota el permiso de módulo en el backend, no la RLS, porque no hay empresa
-- contra la cual acotarla.
GRANT SELECT, INSERT, UPDATE ON
  "CalendarioTributario",
  "ImportacionCalendario"
TO nexo_app;

-- Sin DELETE: una importación no se borra, se marca como no vigente. Perder el
-- calendario de un año pasado dejaría sin explicación las fechas que se usaron
-- entonces.
REVOKE DELETE ON "CalendarioTributario", "ImportacionCalendario" FROM nexo_app;

ALTER TABLE "Gasto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Gasto" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "Gasto";
CREATE POLICY aislamiento_empresa ON "Gasto"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

ALTER TABLE "SolicitudDocumento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SolicitudDocumento" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON "SolicitudDocumento";
CREATE POLICY aislamiento_empresa ON "SolicitudDocumento"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

-- Solo una importación vigente por año. Un índice parcial lo garantiza en la base
-- en vez de dejarlo a que el servicio se acuerde.
DROP INDEX IF EXISTS importacion_vigente_por_anio;
CREATE UNIQUE INDEX importacion_vigente_por_anio
  ON "ImportacionCalendario" ("anio")
  WHERE "vigente";
