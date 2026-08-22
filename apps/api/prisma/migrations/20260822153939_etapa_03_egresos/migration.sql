-- CreateEnum
CREATE TYPE "TipoIntangible" AS ENUM ('LICENCIA_SOFTWARE', 'SERVICIO_DIGITAL', 'DERECHOS', 'SUSCRIPCION', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoEgreso" AS ENUM ('REGISTRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoOrdenPago" AS ENUM ('VIGENTE', 'ANULADA');

-- CreateTable
CREATE TABLE "Egreso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "tipoIntangible" "TipoIntangible" NOT NULL,
    "descripcion" TEXT,
    "beneficiario" TEXT NOT NULL,
    "destinatarioId" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "tasaCambio" DECIMAL(18,6),
    "montoCOP" DECIMAL(18,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoEgreso" NOT NULL DEFAULT 'REGISTRADO',
    "motivoAnulacion" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Egreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenPago" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "egresoId" TEXT NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoOrdenPago" NOT NULL DEFAULT 'VIGENTE',
    "contenido" JSONB NOT NULL,
    "hashArchivo" TEXT,
    "claveArchivo" TEXT,
    "emitidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaPorId" TEXT NOT NULL,
    "motivoAnulacion" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "reemplazaAId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Egreso_empresaId_fecha_idx" ON "Egreso"("empresaId", "fecha" DESC);

-- CreateIndex
CREATE INDEX "Egreso_empresaId_estado_idx" ON "Egreso"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "Egreso_destinatarioId_idx" ON "Egreso"("destinatarioId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenPago_reemplazaAId_key" ON "OrdenPago"("reemplazaAId");

-- CreateIndex
CREATE INDEX "OrdenPago_empresaId_estado_idx" ON "OrdenPago"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "OrdenPago_empresaId_numero_idx" ON "OrdenPago"("empresaId", "numero" DESC);

-- CreateIndex
CREATE INDEX "OrdenPago_egresoId_idx" ON "OrdenPago"("egresoId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenPago_empresaId_consecutivo_key" ON "OrdenPago"("empresaId", "consecutivo");

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Destinatario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPago" ADD CONSTRAINT "OrdenPago_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPago" ADD CONSTRAINT "OrdenPago_egresoId_fkey" FOREIGN KEY ("egresoId") REFERENCES "Egreso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPago" ADD CONSTRAINT "OrdenPago_emitidaPorId_fkey" FOREIGN KEY ("emitidaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPago" ADD CONSTRAINT "OrdenPago_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPago" ADD CONSTRAINT "OrdenPago_reemplazaAId_fkey" FOREIGN KEY ("reemplazaAId") REFERENCES "OrdenPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- [rls-etapa-03.sql]
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
