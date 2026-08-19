-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PERSONA_NATURAL', 'PERSONA_JURIDICA');

-- CreateEnum
CREATE TYPE "EstadoOperacion" AS ENUM ('BORRADOR', 'REGISTRADA', 'CONCILIADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "RedBlockchain" AS ENUM ('BITCOIN', 'ETHEREUM', 'TRON', 'BSC', 'POLYGON', 'SOLANA', 'OTRA');

-- CreateEnum
CREATE TYPE "TipoReparto" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- CreateEnum
CREATE TYPE "EstadoDispersion" AS ENUM ('PENDIENTE', 'PARCIAL', 'EJECUTADA');

-- CreateEnum
CREATE TYPE "EstadoDestino" AS ENUM ('PENDIENTE', 'EJECUTADO', 'DEVUELTO');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL,
    "tipoDoc" "TipoDocumento" NOT NULL,
    "numeroDocCifrado" TEXT NOT NULL,
    "numeroDocHash" TEXT NOT NULL,
    "numeroDocFinal" TEXT NOT NULL,
    "ultimoDigitoNit" INTEGER,
    "municipio" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "hash" TEXT,
    "red" "RedBlockchain",
    "cantidad" DECIMAL(36,18),
    "monedaActivo" "Moneda",
    "valorCompra" DECIMAL(18,2) NOT NULL,
    "monedaCompra" "Moneda" NOT NULL,
    "tasaCompra" DECIMAL(18,6),
    "valorVenta" DECIMAL(18,2) NOT NULL,
    "monedaVenta" "Moneda" NOT NULL,
    "tasaVenta" DECIMAL(18,6),
    "gananciaCOP" DECIMAL(18,2) NOT NULL,
    "estado" "EstadoOperacion" NOT NULL DEFAULT 'REGISTRADA',
    "fechaOperacion" TIMESTAMP(3) NOT NULL,
    "observaciones" TEXT,
    "motivoAnulacion" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destinatario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoDoc" "TipoDocumento" NOT NULL,
    "numeroDocCifrado" TEXT NOT NULL,
    "numeroDocHash" TEXT NOT NULL,
    "numeroDocFinal" TEXT NOT NULL,
    "banco" TEXT,
    "tipoCuenta" TEXT,
    "cuentaCifrada" TEXT,
    "cuentaFinal" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Destinatario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaDispersion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoReparto" "TipoReparto" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReglaDispersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaDispersionDestino" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "reglaId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "porcentaje" DECIMAL(7,4),
    "montoFijo" DECIMAL(18,2),
    "orden" INTEGER NOT NULL,

    CONSTRAINT "ReglaDispersionDestino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispersion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "montoTotal" DECIMAL(18,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'COP',
    "estado" "EstadoDispersion" NOT NULL DEFAULT 'PENDIENTE',
    "reglaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dispersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispersionDestino" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "dispersionId" TEXT NOT NULL,
    "destinatarioId" TEXT,
    "nombreSnapshot" TEXT NOT NULL,
    "cuentaSnapshot" TEXT,
    "monto" DECIMAL(18,2) NOT NULL,
    "porcentaje" DECIMAL(7,4),
    "estado" "EstadoDestino" NOT NULL DEFAULT 'PENDIENTE',
    "ejecutadoEn" TIMESTAMP(3),
    "referenciaPago" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DispersionDestino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_empresaId_nombre_idx" ON "Cliente"("empresaId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_numeroDocHash_key" ON "Cliente"("empresaId", "numeroDocHash");

-- CreateIndex
CREATE INDEX "Operacion_empresaId_fechaOperacion_idx" ON "Operacion"("empresaId", "fechaOperacion" DESC);

-- CreateIndex
CREATE INDEX "Operacion_empresaId_estado_idx" ON "Operacion"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "Operacion_clienteId_idx" ON "Operacion"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Operacion_empresaId_hash_key" ON "Operacion"("empresaId", "hash");

-- CreateIndex
CREATE INDEX "Destinatario_empresaId_activo_idx" ON "Destinatario"("empresaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "Destinatario_empresaId_numeroDocHash_key" ON "Destinatario"("empresaId", "numeroDocHash");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaDispersion_empresaId_nombre_key" ON "ReglaDispersion"("empresaId", "nombre");

-- CreateIndex
CREATE INDEX "ReglaDispersionDestino_reglaId_orden_idx" ON "ReglaDispersionDestino"("reglaId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaDispersionDestino_reglaId_destinatarioId_key" ON "ReglaDispersionDestino"("reglaId", "destinatarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispersion_operacionId_key" ON "Dispersion"("operacionId");

-- CreateIndex
CREATE INDEX "Dispersion_empresaId_estado_idx" ON "Dispersion"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "DispersionDestino_empresaId_estado_idx" ON "DispersionDestino"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "DispersionDestino_dispersionId_idx" ON "DispersionDestino"("dispersionId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operacion" ADD CONSTRAINT "Operacion_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destinatario" ADD CONSTRAINT "Destinatario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaDispersion" ADD CONSTRAINT "ReglaDispersion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaDispersionDestino" ADD CONSTRAINT "ReglaDispersionDestino_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaDispersionDestino" ADD CONSTRAINT "ReglaDispersionDestino_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaDispersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaDispersionDestino" ADD CONSTRAINT "ReglaDispersionDestino_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Destinatario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispersion" ADD CONSTRAINT "Dispersion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispersion" ADD CONSTRAINT "Dispersion_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "Operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispersion" ADD CONSTRAINT "Dispersion_reglaId_fkey" FOREIGN KEY ("reglaId") REFERENCES "ReglaDispersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispersionDestino" ADD CONSTRAINT "DispersionDestino_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispersionDestino" ADD CONSTRAINT "DispersionDestino_dispersionId_fkey" FOREIGN KEY ("dispersionId") REFERENCES "Dispersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispersionDestino" ADD CONSTRAINT "DispersionDestino_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Destinatario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- [rls-etapa-02.sql]
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
