-- CreateEnum
CREATE TYPE "CategoriaGasto" AS ENUM ('ARRIENDO', 'SERVICIOS_PUBLICOS', 'NOMINA_ADMINISTRATIVA', 'HONORARIOS', 'TRANSPORTE', 'PAPELERIA', 'TECNOLOGIA', 'IMPUESTOS', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoObligacion" AS ENUM ('RENTA', 'RETENCIONES', 'ICA', 'EXOGENA');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('SOLICITADO', 'RECIBIDO', 'VENCIDO');

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoria" "CategoriaGasto" NOT NULL,
    "concepto" TEXT NOT NULL,
    "proveedor" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'COP',
    "tasaCambio" DECIMAL(18,6),
    "montoCOP" DECIMAL(18,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "deducible" BOOLEAN NOT NULL DEFAULT true,
    "soporteClave" TEXT,
    "soporteNombre" TEXT,
    "soporteTipo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarioTributario" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "tipoObligacion" "TipoObligacion" NOT NULL,
    "ultimoDigito" INTEGER NOT NULL,
    "tipoContribuyente" "TipoContribuyente",
    "codigoDaneMunicipio" TEXT,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT,
    "importacionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarioTributario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionCalendario" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "filas" INTEGER NOT NULL,
    "nota" TEXT,
    "importadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPorId" TEXT NOT NULL,

    CONSTRAINT "ImportacionCalendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudDocumento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'SOLICITADO',
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "archivoClave" TEXT,
    "archivoNombre" TEXT,
    "archivoTipo" TEXT,
    "recibidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SolicitudDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gasto_empresaId_fecha_idx" ON "Gasto"("empresaId", "fecha" DESC);

-- CreateIndex
CREATE INDEX "Gasto_empresaId_categoria_idx" ON "Gasto"("empresaId", "categoria");

-- CreateIndex
CREATE INDEX "CalendarioTributario_anio_tipoObligacion_ultimoDigito_idx" ON "CalendarioTributario"("anio", "tipoObligacion", "ultimoDigito");

-- CreateIndex
CREATE INDEX "CalendarioTributario_importacionId_idx" ON "CalendarioTributario"("importacionId");

-- CreateIndex
CREATE INDEX "ImportacionCalendario_anio_vigente_idx" ON "ImportacionCalendario"("anio", "vigente");

-- CreateIndex
CREATE INDEX "SolicitudDocumento_empresaId_estado_idx" ON "SolicitudDocumento"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudDocumento_empresaId_fechaLimite_idx" ON "SolicitudDocumento"("empresaId", "fechaLimite");

-- CreateIndex
CREATE INDEX "SolicitudDocumento_clienteId_idx" ON "SolicitudDocumento"("clienteId");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarioTributario" ADD CONSTRAINT "CalendarioTributario_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionCalendario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionCalendario" ADD CONSTRAINT "ImportacionCalendario_importadoPorId_fkey" FOREIGN KEY ("importadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudDocumento" ADD CONSTRAINT "SolicitudDocumento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudDocumento" ADD CONSTRAINT "SolicitudDocumento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- [rls-etapa-06a.sql]
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
