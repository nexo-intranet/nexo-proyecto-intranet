-- CreateEnum
CREATE TYPE "ModuloSistema" AS ENUM ('OPERACIONES', 'EGRESOS', 'EMPLEADOS', 'CONTABILIDAD', 'CUMPLIMIENTO', 'CLIENTES', 'ADMINISTRACION');

-- CreateEnum
CREATE TYPE "NombreRol" AS ENUM ('ADMINISTRADOR', 'EQUIPO_INTERNO');

-- CreateEnum
CREATE TYPE "TipoContribuyente" AS ENUM ('GRAN_CONTRIBUYENTE', 'PERSONA_JURIDICA', 'PERSONA_NATURAL', 'REGIMEN_SIMPLE', 'NO_RESPONSABLE_IVA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'PPT');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('COP', 'USD', 'USDT');

-- CreateEnum
CREATE TYPE "TipoConsecutivo" AS ENUM ('ORDEN_PAGO', 'FACTURA', 'RECIBO_NOMINA');

-- CreateEnum
CREATE TYPE "AccionAudit" AS ENUM ('CREAR', 'ACTUALIZAR', 'ANULAR', 'ELIMINAR', 'INGRESAR', 'SALIR', 'INGRESO_FALLIDO', 'EXPORTAR', 'CAMBIAR_EMPRESA', 'LLAMADA_EXTERNA');

-- CreateTable
CREATE TABLE "EmpresaAdministrada" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "nit" TEXT NOT NULL,
    "digitoVerificacion" INTEGER NOT NULL,
    "tipoContribuyente" "TipoContribuyente" NOT NULL,
    "municipio" TEXT NOT NULL,
    "codigoDaneMunicipio" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "esNexo" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmpresaAdministrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "nombre" "NombreRol" NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretCifrado" TEXT,
    "totpActivado" BOOLEAN NOT NULL DEFAULT false,
    "ultimoTotpUsado" TEXT,
    "ultimoTotpEn" TIMESTAMP(3),
    "rolId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioEmpresa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermisoModulo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "modulo" "ModuloSistema" NOT NULL,
    "puedeVer" BOOLEAN NOT NULL DEFAULT false,
    "puedeEditar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PermisoModulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionRefresh" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familiaId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadaEn" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoRespaldo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoRespaldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consecutivo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoConsecutivo" NOT NULL,
    "prefijo" TEXT NOT NULL DEFAULT '',
    "ultimoValor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "usuarioId" TEXT,
    "empresaId" TEXT,
    "accion" "AccionAudit" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "valorAnterior" JSONB,
    "valorNuevo" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "ruta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaAdministrada_nit_key" ON "EmpresaAdministrada"("nit");

-- CreateIndex
CREATE INDEX "EmpresaAdministrada_activa_deletedAt_idx" ON "EmpresaAdministrada"("activa", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_email_deletedAt_idx" ON "Usuario"("email", "deletedAt");

-- CreateIndex
CREATE INDEX "UsuarioEmpresa_empresaId_idx" ON "UsuarioEmpresa"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioEmpresa_usuarioId_empresaId_key" ON "UsuarioEmpresa"("usuarioId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoModulo_usuarioId_modulo_key" ON "PermisoModulo"("usuarioId", "modulo");

-- CreateIndex
CREATE UNIQUE INDEX "SesionRefresh_tokenHash_key" ON "SesionRefresh"("tokenHash");

-- CreateIndex
CREATE INDEX "SesionRefresh_usuarioId_revocadaEn_idx" ON "SesionRefresh"("usuarioId", "revocadaEn");

-- CreateIndex
CREATE INDEX "SesionRefresh_familiaId_idx" ON "SesionRefresh"("familiaId");

-- CreateIndex
CREATE INDEX "CodigoRespaldo_usuarioId_usadoEn_idx" ON "CodigoRespaldo"("usuarioId", "usadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Consecutivo_empresaId_tipo_key" ON "Consecutivo"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "AuditLog_empresaId_createdAt_idx" ON "AuditLog"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_createdAt_idx" ON "AuditLog"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioEmpresa" ADD CONSTRAINT "UsuarioEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoModulo" ADD CONSTRAINT "PermisoModulo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionRefresh" ADD CONSTRAINT "SesionRefresh_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodigoRespaldo" ADD CONSTRAINT "CodigoRespaldo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consecutivo" ADD CONSTRAINT "Consecutivo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaAdministrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- [seguridad.sql]
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
