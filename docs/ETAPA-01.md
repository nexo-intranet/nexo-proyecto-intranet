# Etapa 1 — Cimientos · Esquema y API

> Esquema aprobado. Contexto y convenciones: `docs/ARQUITECTURA.md`.
> Requisitos de seguridad que esta etapa debe cumplir: `docs/SEGURIDAD.md` §8.

**Alcance:** monorepo, esquema núcleo, aislamiento por `empresaId` en tres capas
(guard, Prisma y RLS de PostgreSQL), selector de empresa, autenticación con 2FA,
RBAC, audit log, layout con barra lateral, sistema de diseño con tokens, tabla base
reutilizable y generador de PDF base.

**Fuera de alcance:** cualquier entidad de negocio (operaciones, egresos, facturas,
empleados, clientes). Solo se definen aquí las piezas que todas ellas van a usar.

---

## 1. Esquema Prisma completo de la Etapa 1

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

// Desde Prisma 7 las URLs no van en el esquema:
//   migraciones → DIRECT_URL (rol nexo_owner), en prisma.config.ts
//   runtime     → DATABASE_URL (rol nexo_app), en el driver adapter de PrismaService
datasource db {
  provider = "postgresql"
}

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

enum ModuloSistema {
  OPERACIONES
  EGRESOS
  EMPLEADOS
  CONTABILIDAD
  CUMPLIMIENTO
  CLIENTES
  ADMINISTRACION
}

enum NombreRol {
  ADMINISTRADOR
  EQUIPO_INTERNO
}

enum TipoContribuyente {
  GRAN_CONTRIBUYENTE
  PERSONA_JURIDICA
  PERSONA_NATURAL
  REGIMEN_SIMPLE
  NO_RESPONSABLE_IVA
}

// TODO [CONFIRMAR] La lista definitiva depende de cómo el cliente clasifica a sus
// administradas para el calendario tributario (renta, ICA, exógena).

enum TipoDocumento {
  CC
  CE
  NIT
  PASAPORTE
  PPT
}

enum Moneda {
  COP
  USD
  USDT
}

enum TipoConsecutivo {
  ORDEN_PAGO
  FACTURA
  RECIBO_NOMINA
}

enum AccionAudit {
  CREAR
  ACTUALIZAR
  ANULAR
  ELIMINAR // soft delete
  INGRESAR
  SALIR
  INGRESO_FALLIDO
  EXPORTAR // exportación masiva — obligatorio por Ley 1581
  CAMBIAR_EMPRESA
  LLAMADA_EXTERNA
}

// ─────────────────────────────────────────────────────────────
// Empresa administrada — raíz de todo el aislamiento
// ─────────────────────────────────────────────────────────────

model EmpresaAdministrada {
  id                  String            @id @default(cuid())
  nombre              String
  nombreComercial     String?
  nit                 String            @unique
  digitoVerificacion  Int
  tipoContribuyente   TipoContribuyente
  municipio           String // sede principal — define ICA
  codigoDaneMunicipio String?
  direccion           String?
  telefono            String?
  email               String?
  logoUrl             String? // identidad en los PDF generados
  esNexo              Boolean           @default(false) // primera fila; solo una en true
  activa              Boolean           @default(true)

  usuarios     UsuarioEmpresa[]
  consecutivos Consecutivo[]
  auditLogs    AuditLog[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([activa, deletedAt])
}

// ─────────────────────────────────────────────────────────────
// Identidad y acceso
// ─────────────────────────────────────────────────────────────

model Rol {
  id          String    @id @default(cuid())
  nombre      NombreRol @unique
  descripcion String?
  usuarios    Usuario[]
}

model Usuario {
  id           String @id @default(cuid())
  nombre       String
  email        String @unique
  passwordHash String

  totpSecretCifrado String? // AES-256-GCM; null hasta activar 2FA
  totpActivado      Boolean @default(false)

  rolId  String
  rol    Rol     @relation(fields: [rolId], references: [id])
  activo Boolean @default(true)

  debeCambiarPassword Boolean   @default(true)
  ultimoAcceso        DateTime?
  intentosFallidos    Int       @default(0)
  bloqueadoHasta      DateTime?

  empresas        UsuarioEmpresa[]
  permisos        PermisoModulo[]
  sesiones        SesionRefresh[]
  codigosRespaldo CodigoRespaldo[]
  auditLogs       AuditLog[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([email, deletedAt])
}

/// Qué empresas puede ver un usuario. El rol ADMINISTRADOR accede a todas
/// sin necesidad de filas aquí (se resuelve en el guard).
model UsuarioEmpresa {
  id        String @id @default(cuid())
  usuarioId String
  empresaId String

  usuario Usuario             @relation(fields: [usuarioId], references: [id])
  empresa EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  createdAt DateTime @default(now())

  @@unique([usuarioId, empresaId])
  @@index([empresaId])
}

/// Permiso por módulo. Global al usuario, no por empresa.
/// TODO [CONFIRMAR] ¿debe variar por empresa? (ver ARQUITECTURA §5.2)
model PermisoModulo {
  id          String        @id @default(cuid())
  usuarioId   String
  modulo      ModuloSistema
  puedeVer    Boolean       @default(false)
  puedeEditar Boolean       @default(false)

  usuario Usuario @relation(fields: [usuarioId], references: [id])

  @@unique([usuarioId, modulo])
}

/// Refresh tokens con rotación y detección de reuso.
model SesionRefresh {
  id        String @id @default(cuid())
  usuarioId String
  tokenHash String @unique // SHA-256 del token, nunca el token
  familiaId String // rotación: reuso de un token revocado mata la familia

  expiraEn   DateTime
  revocadaEn DateTime?
  ip         String?
  userAgent  String?

  usuario Usuario @relation(fields: [usuarioId], references: [id])

  createdAt DateTime @default(now())

  @@index([usuarioId, revocadaEn])
  @@index([familiaId])
}

/// Códigos de un solo uso para recuperar el acceso si se pierde el TOTP.
model CodigoRespaldo {
  id         String    @id @default(cuid())
  usuarioId  String
  codigoHash String
  usadoEn    DateTime?

  usuario Usuario @relation(fields: [usuarioId], references: [id])

  createdAt DateTime @default(now())

  @@index([usuarioId, usadoEn])
}

// ─────────────────────────────────────────────────────────────
// Consecutivos de documentos legales
// ─────────────────────────────────────────────────────────────

model Consecutivo {
  id          String          @id @default(cuid())
  empresaId   String
  tipo        TipoConsecutivo
  prefijo     String          @default("")
  ultimoValor Int             @default(0)

  empresa EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  updatedAt DateTime @updatedAt

  @@unique([empresaId, tipo])
}

// ─────────────────────────────────────────────────────────────
// Audit log — append-only, garantizado en la base de datos
// ─────────────────────────────────────────────────────────────

model AuditLog {
  id        BigInt      @id @default(autoincrement())
  usuarioId String?
  empresaId String?
  accion    AccionAudit
  entidad   String
  entidadId String?

  valorAnterior Json?
  valorNuevo    Json?

  ip        String?
  userAgent String?
  ruta      String?
  createdAt DateTime @default(now())

  usuario Usuario?             @relation(fields: [usuarioId], references: [id])
  empresa EmpresaAdministrada? @relation(fields: [empresaId], references: [id])

  @@index([empresaId, createdAt])
  @@index([usuarioId, createdAt])
  @@index([entidad, entidadId])
  @@index([createdAt])
}
```

### SQL adicional en la migración inicial

```sql
-- El audit log no acepta UPDATE ni DELETE, ni siquiera desde la aplicación.
CREATE OR REPLACE FUNCTION audit_log_inmutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es append-only: no se permite % ', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_modificar
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();

REVOKE UPDATE, DELETE ON "AuditLog" FROM CURRENT_USER;

-- Una sola empresa puede ser Nexo.
CREATE UNIQUE INDEX empresa_nexo_unica
  ON "EmpresaAdministrada" ("esNexo") WHERE "esNexo" = true;

-- ── Rol de aplicación sin privilegios de dueño ───────────────────────────────
GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app;
REVOKE UPDATE, DELETE ON "AuditLog" FROM nexo_app;

-- ── Row Level Security en las tablas con empresaId ───────────────────────────
ALTER TABLE "Consecutivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consecutivo" FORCE  ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON "Consecutivo"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));

-- El audit log se lee por empresa, pero se inserta siempre (incluye eventos
-- previos a elegir empresa: ingreso, ingreso fallido, salida).
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE  ROW LEVEL SECURITY;
CREATE POLICY auditoria_lectura ON "AuditLog" FOR SELECT
  USING ("empresaId" = current_setting('app.empresa_id', true));
CREATE POLICY auditoria_insercion ON "AuditLog" FOR INSERT
  WITH CHECK (true);
```

Toda tabla futura con `empresaId` repite el bloque de RLS. Es un ítem del checklist
de PR (`docs/SEGURIDAD.md` §7) y del criterio de terminado de cada etapa.

### Datos semilla (`prisma/seed.ts`)

1. Roles `ADMINISTRADOR` y `EQUIPO_INTERNO`.
2. `EmpresaAdministrada` "Nexo Administración Integral" con `esNexo = true`.
3. Un usuario administrador con contraseña temporal y `debeCambiarPassword = true`.
4. Fila de `Consecutivo` por tipo para Nexo.

---

## 2. Rutas de la API — Etapa 1

Prefijo `/api/v1`. Todas requieren sesión salvo las marcadas _(pública)_.
Las marcadas **[E]** exigen header `X-Empresa-Id` válido.

### 2.1 Autenticación

| Método | Ruta                              | Descripción                                                                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/ingresar` _(pública)_      | email + contraseña → `{ requiere2fa: true, tokenReto }`. Nunca entrega sesión en este paso.                 |
| `POST` | `/auth/2fa/verificar` _(pública)_ | `tokenReto` + código TOTP (o código de respaldo) → cookies httpOnly `acceso` (15 min) y `refresco` (7 días) |
| `POST` | `/auth/refrescar` _(pública)_     | rota el refresh token; reuso detectado revoca la familia completa                                           |
| `POST` | `/auth/salir`                     | revoca la sesión actual                                                                                     |
| `GET`  | `/auth/yo`                        | usuario, rol, permisos por módulo y empresas accesibles                                                     |
| `POST` | `/auth/2fa/iniciar`               | genera secreto y `otpauth://` para el QR (no activa)                                                        |
| `POST` | `/auth/2fa/confirmar`             | valida un código, activa 2FA y devuelve los 8 códigos de respaldo **una sola vez**                          |
| `POST` | `/auth/password/cambiar`          | contraseña actual + nueva; revoca las demás sesiones                                                        |

Reglas: bloqueo tras 5 intentos fallidos (15 min), `INGRESO_FALLIDO` al audit log,
límite de tasa por IP y por email en `/auth/ingresar` y `/auth/2fa/verificar`,
ventana TOTP ±1 y rechazo de código ya usado.

### 2.2 Empresas administradas

| Método   | Ruta                 | Permiso                                                                |
| -------- | -------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/empresas`          | cualquier usuario — devuelve **solo las accesibles**, para el selector |
| `POST`   | `/empresas`          | ADMINISTRACION editar                                                  |
| `GET`    | `/empresas/:id`      | acceso a esa empresa                                                   |
| `PATCH`  | `/empresas/:id`      | ADMINISTRACION editar                                                  |
| `DELETE` | `/empresas/:id`      | ADMINISTRACION editar — soft delete                                    |
| `POST`   | `/empresas/:id/logo` | ADMINISTRACION editar — identidad de los PDF                           |

### 2.3 Usuarios y permisos

| Método                     | Ruta                               | Descripción                                             |
| -------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `GET`                      | `/usuarios`                        | listado paginado                                        |
| `POST`                     | `/usuarios`                        | crea usuario; devuelve contraseña temporal una sola vez |
| `GET` / `PATCH` / `DELETE` | `/usuarios/:id`                    | detalle, edición, soft delete                           |
| `PUT`                      | `/usuarios/:id/permisos`           | reemplaza el conjunto completo de `PermisoModulo`       |
| `PUT`                      | `/usuarios/:id/empresas`           | reemplaza el conjunto de `UsuarioEmpresa`               |
| `POST`                     | `/usuarios/:id/reiniciar-2fa`      | desactiva TOTP para que lo vuelva a registrar           |
| `POST`                     | `/usuarios/:id/reiniciar-password` | nueva contraseña temporal, revoca sesiones              |
| `GET`                      | `/roles`                           | catálogo                                                |

Todas bajo permiso `ADMINISTRACION`. Un usuario no puede editar sus propios
permisos ni desactivarse a sí mismo. No puede quedar cero administradores activos.

### 2.4 Audit log

| Método | Ruta                 | Descripción                                                                        |
| ------ | -------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/auditoria` **[E]** | filtros: `usuarioId`, `entidad`, `entidadId`, `accion`, `desde`, `hasta`; paginado |
| `GET`  | `/auditoria/:id`     | detalle con `valorAnterior` / `valorNuevo`                                         |

Solo lectura. Sin rutas de escritura ni de borrado — por diseño.

### 2.5 Utilidades

| Método | Ruta                          | Descripción                                                               |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| `GET`  | `/salud` _(pública)_          | estado del servicio y de la base de datos                                 |
| `GET`  | `/documentos/:id/pdf` **[E]** | descarga de PDF por URL firmada — contrato que reusan las etapas 3, 5 y 6 |

---

## 3. Frontend de la Etapa 1

**Pantallas**

1. `/ingresar` — correo y contraseña.
2. `/verificar` — código de 6 dígitos, con enlace a código de respaldo.
3. `/` — tablero mínimo: saludo, empresa activa, accesos a los módulos permitidos.
4. `/administracion/empresas` — listado + panel lateral de creación/edición.
5. `/administracion/usuarios` — listado + panel con permisos por módulo y empresas.
6. `/administracion/auditoria` — tabla con filtros.
7. `/perfil` — registro del 2FA (QR + códigos de respaldo) y cambio de contraseña.

**Piezas reutilizables que quedan listas aquí**

- `TablaDatos`: TanStack Table con orden y paginación en servidor, columnas
  configurables, selección múltiple, estado vacío con acción, skeletons, exportación.
- `PanelLateral` para detalles, `ConfirmacionEscrita` para anulaciones futuras.
- `SelectorEmpresa` en la barra superior: cambia el header `X-Empresa-Id`, invalida
  toda la caché de TanStack Query y registra `CAMBIAR_EMPRESA` en el audit log.
- `PaletaComandos` (⌘K): en esta etapa navega entre módulos y empresas. El hook de
  búsqueda queda abierto para que la Etapa 2 conecte la búsqueda por hash.
- Tokens del brief como variables CSS + `tailwind.config` (Inter para interfaz,
  JetBrains Mono con `tabular-nums` para cifras). Sin modo oscuro.
- `PdfService` con plantilla base: encabezado con logo y datos de la empresa
  administrada, tipografía Cormorant Garamond, pie con consecutivo. Se prueba con
  un documento de ejemplo.

---

## 4. Criterio de terminado (tomado del brief, verificable)

- [ ] Un administrador crea dos empresas y un usuario de equipo interno.
- [ ] Ese usuario ingresa con contraseña + TOTP y es forzado a cambiar la contraseña.
- [ ] Cambia entre empresas desde la barra superior y los datos cambian con ella.
- [ ] En la barra lateral **solo aparecen** los módulos con `puedeVer = true`.
- [ ] **Test e2e:** el usuario envía `X-Empresa-Id` de una empresa a la que no tiene
      acceso y recibe `403`; y un `GET /recurso/:id` de otra empresa devuelve `404`,
      no el registro.
- [ ] **Test unitario:** una consulta sin empresa en el contexto lanza excepción en
      lugar de devolver filas.
- [ ] **Test de RLS:** conectado como `nexo_app` y con `app.empresa_id` en la empresa A,
      un `SELECT` directo por SQL sobre filas de la empresa B devuelve cero filas, y el
      `INSERT` hacia la empresa B falla. Sin pasar por la aplicación.
- [ ] `gitleaks` corre en pre-commit y en CI, y `.env` no está en el repositorio.
- [ ] No existe ninguna `NEXT_PUBLIC_*` fuera de `NEXT_PUBLIC_APP_URL`.
- [ ] Las mutaciones sin `X-CSRF-Token` válido devuelven `403`.
- [ ] El logger redacta contraseñas, tokens y secretos TOTP; en producción no se
      devuelven stack traces al cliente.
- [ ] Toda mutación aparece en `/auditoria` con valor anterior y nuevo.
- [ ] `UPDATE`/`DELETE` directo sobre `AuditLog` falla en la base de datos.
- [ ] Dos peticiones concurrentes al servicio de consecutivos no producen duplicados.
- [ ] Toda la interfaz navegable con teclado y con foco visible.
- [ ] Ningún texto visible en inglés.
