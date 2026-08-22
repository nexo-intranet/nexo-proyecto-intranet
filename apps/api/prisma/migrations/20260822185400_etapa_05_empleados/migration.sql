-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('INDEFINIDO', 'FIJO', 'OBRA_LABOR', 'PRESTACION_SERVICIOS', 'APRENDIZAJE');

-- CreateEnum
CREATE TYPE "TipoPeriodo" AS ENUM ('QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "TipoConcepto" AS ENUM ('DEVENGADO', 'DEDUCCION');

-- CreateEnum
CREATE TYPE "TipoDocumentoLaboral" AS ENUM ('CARTA_LABORAL', 'CERTIFICADO_INGRESOS');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('VIGENTE', 'ANULADO');

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoDoc" "TipoDocumento" NOT NULL,
    "numeroDocCifrado" TEXT NOT NULL,
    "numeroDocHash" TEXT NOT NULL,
    "numeroDocFinal" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "salarioBase" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'COP',
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "fechaRetiro" TIMESTAMP(3),
    "tipoContrato" "TipoContrato" NOT NULL DEFAULT 'INDEFINIDO',
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReciboNomina" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipoPeriodo" "TipoPeriodo" NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "totalDevengado" DECIMAL(18,2) NOT NULL,
    "totalDeducido" DECIMAL(18,2) NOT NULL,
    "neto" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'COP',
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VIGENTE',
    "contenido" JSONB NOT NULL,
    "hashArchivo" TEXT,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT NOT NULL,
    "motivoAnulacion" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "reemplazaAId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReciboNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptoNomina" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "reciboId" TEXT NOT NULL,
    "tipo" "TipoConcepto" NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "ConceptoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoLaboral" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoDocumentoLaboral" NOT NULL,
    "anio" INTEGER,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT NOT NULL,

    CONSTRAINT "DocumentoLaboral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Empleado_empresaId_activo_idx" ON "Empleado"("empresaId", "activo");

-- CreateIndex
CREATE INDEX "Empleado_empresaId_nombre_idx" ON "Empleado"("empresaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_empresaId_numeroDocHash_key" ON "Empleado"("empresaId", "numeroDocHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReciboNomina_reemplazaAId_key" ON "ReciboNomina"("reemplazaAId");

-- CreateIndex
CREATE INDEX "ReciboNomina_empresaId_estado_idx" ON "ReciboNomina"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "ReciboNomina_empresaId_numero_idx" ON "ReciboNomina"("empresaId", "numero" DESC);

-- CreateIndex
CREATE INDEX "ReciboNomina_empleadoId_periodoInicio_idx" ON "ReciboNomina"("empleadoId", "periodoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "ReciboNomina_empresaId_consecutivo_key" ON "ReciboNomina"("empresaId", "consecutivo");

-- CreateIndex
CREATE INDEX "ConceptoNomina_reciboId_orden_idx" ON "ConceptoNomina"("reciboId", "orden");

-- CreateIndex
CREATE INDEX "ConceptoNomina_empresaId_concepto_idx" ON "ConceptoNomina"("empresaId", "concepto");

-- CreateIndex
CREATE INDEX "DocumentoLaboral_empleadoId_emitidoEn_idx" ON "DocumentoLaboral"("empleadoId", "emitidoEn" DESC);

-- CreateIndex
CREATE INDEX "DocumentoLaboral_empresaId_tipo_idx" ON "DocumentoLaboral"("empresaId", "tipo");

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboNomina" ADD CONSTRAINT "ReciboNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboNomina" ADD CONSTRAINT "ReciboNomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboNomina" ADD CONSTRAINT "ReciboNomina_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboNomina" ADD CONSTRAINT "ReciboNomina_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReciboNomina" ADD CONSTRAINT "ReciboNomina_reemplazaAId_fkey" FOREIGN KEY ("reemplazaAId") REFERENCES "ReciboNomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNomina" ADD CONSTRAINT "ConceptoNomina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNomina" ADD CONSTRAINT "ConceptoNomina_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "ReciboNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoLaboral" ADD CONSTRAINT "DocumentoLaboral_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoLaboral" ADD CONSTRAINT "DocumentoLaboral_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoLaboral" ADD CONSTRAINT "DocumentoLaboral_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- [rls-etapa-05.sql]
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
