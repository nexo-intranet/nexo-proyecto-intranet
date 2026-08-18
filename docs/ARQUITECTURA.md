# Arquitectura y plan de construcción — Intranet Nexo

> Esquema aprobado por el cliente. Complementos:
> `docs/ETAPA-01.md` (esquema Prisma y rutas completas de la etapa 1) ·
> `docs/SEGURIDAD.md` (**vinculante en todas las etapas**: RLS, secretos, superficie
> pública, sesión, datos personales).

---

## 1. Estructura del monorepo

Gestor: **pnpm workspaces + Turborepo**. Node 20 LTS, TypeScript 5.x en modo `strict`.

```
nexo-intranet/
├─ apps/
│  ├─ api/                    NestJS + Prisma  → Railway
│  └─ web/                    Next.js App Router → Vercel
├─ packages/
│  ├─ shared/                 esquemas Zod, tipos, enums, utilidades de dinero
│  └─ tsconfig/               configuración TS base compartida
├─ docs/
│  ├─ BRIEF.md
│  ├─ ARQUITECTURA.md         (este archivo)
│  └─ ETAPA-01.md
├─ docker-compose.yml         PostgreSQL local
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

### 1.1 `apps/api` — NestJS

```
apps/api/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  │  └─ .../migration.sql        incluye SQL manual: triggers append-only del audit log
│  └─ seed.ts                     empresa Nexo + rol admin + usuario semilla
└─ src/
   ├─ main.ts
   ├─ app.module.ts
   │
   ├─ core/                       infraestructura transversal (una sola implementación)
   │  ├─ prisma/
   │  │  ├─ prisma.service.ts
   │  │  ├─ extensions/aislamiento-empresa.ts   ← inyecta empresaId en TODA consulta
   │  │  ├─ extensions/soft-delete.ts
   │  │  └─ extensions/audit.ts
   │  ├─ context/
   │  │  └─ contexto-peticion.service.ts        AsyncLocalStorage: usuarioId, empresaId, ip
   │  ├─ crypto/
   │  │  └─ cifrado.service.ts                  AES-256-GCM (credenciales, TOTP, cédulas)
   │  ├─ audit/
   │  │  └─ audit.service.ts                    escritura append-only
   │  ├─ consecutivos/
   │  │  └─ consecutivo.service.ts              contador transaccional por empresa+tipo
   │  └─ pdf/
   │     ├─ pdf.service.ts
   │     └─ plantillas/                         layout base con identidad de la empresa
   │
   ├─ common/
   │  ├─ decorators/     @UsuarioActual  @Permiso(modulo, nivel)  @Publico
   │  ├─ guards/         JwtAuthGuard · EmpresaGuard · PermisoGuard
   │  ├─ interceptors/   AuditInterceptor · RespuestaInterceptor
   │  ├─ filters/        FiltroExcepciones (mensajes en español)
   │  ├─ pipes/          ZodValidationPipe (usa los esquemas de packages/shared)
   │  └─ dinero/         helpers Decimal
   │
   ├─ modules/                    un directorio por módulo de negocio
   │  ├─ auth/
   │  ├─ usuarios/
   │  ├─ empresas/
   │  ├─ audit-log/
   │  ├─ operaciones/             (etapa 2)
   │  ├─ egresos/                 (etapa 3)
   │  ├─ clientes/                (etapa 4)
   │  ├─ empleados/               (etapa 5)
   │  ├─ contabilidad/            (etapa 6)
   │  └─ cumplimiento/            (etapa 7)
   │
   └─ integrations/
      ├─ invoicing/
      │  ├─ invoicing-provider.interface.ts
      │  ├─ siigo/                 primera implementación
      │  ├─ facturatech/           stub
      │  └─ dataico/               stub
      └─ uiaf/
         └─ uiaf-report-formatter.interface.ts   TODO [CONFIRMAR] formato SIREL
```

Cada módulo de negocio sigue la misma forma:

```
modules/<modulo>/
├─ <modulo>.module.ts
├─ <modulo>.controller.ts     solo HTTP: validación Zod, permisos, forma de respuesta
├─ <modulo>.service.ts        reglas de negocio
├─ <modulo>.repository.ts     único punto que toca Prisma para este módulo
└─ dto/                       reexporta los esquemas Zod de packages/shared
```

**Regla:** ningún servicio llama a `PrismaService` directamente. Todo pasa por el
repositorio del módulo, que extiende una clase base con el filtro de `empresaId`.

### 1.2 `apps/web` — Next.js

```
apps/web/src/
├─ app/
│  ├─ (publico)/
│  │  ├─ ingresar/                login
│  │  └─ verificar/               segundo factor
│  ├─ (app)/
│  │  ├─ layout.tsx               barra lateral + barra superior + ⌘K
│  │  ├─ page.tsx                 tablero de inicio
│  │  ├─ operaciones/
│  │  ├─ egresos/
│  │  ├─ empleados/
│  │  ├─ contabilidad/
│  │  ├─ cumplimiento/
│  │  ├─ clientes/
│  │  └─ administracion/
│  │     ├─ usuarios/ · empresas/ · auditoria/ · calendario/
│  └─ api/auth/[...]/route.ts     handlers que manejan la cookie httpOnly
│
├─ components/
│  ├─ ui/                         shadcn/ui (generado, sin editar a mano salvo tokens)
│  ├─ layout/                     BarraLateral · BarraSuperior · SelectorEmpresa · PaletaComandos
│  ├─ tabla/                      TablaDatos (TanStack) + barra de filtros + exportación
│  └─ patrones/                   EstadoVacio · Esqueleto · PanelLateral · ConfirmacionEscrita · Moneda
│
├─ lib/
│  ├─ api/                        cliente fetch tipado + hooks TanStack Query
│  ├─ auth/                       sesión, permisos, guardas de cliente
│  ├─ empresa/                    empresa activa (cookie + contexto React)
│  └─ formato/                    dinero, fechas America/Bogota, documentos
│
└─ styles/globals.css             tokens del brief como variables CSS
```

### 1.3 `packages/shared`

Frontera de tipos entre `api` y `web`. **Un solo esquema Zod valida en ambos lados.**

```
packages/shared/src/
├─ esquemas/        zod por entidad: crearOperacion, actualizarUsuario, ...
├─ tipos/           tipos derivados (z.infer) + RespuestaPaginada<T>
├─ enums/           ModuloSistema, Moneda, EstadoOperacion, ... (espejo de Prisma)
├─ constantes/      MODULOS con etiqueta en español, permisos, límites
└─ dinero/          wrappers de decimal.js, serialización Decimal ↔ string
```

**El dinero viaja como `string` en JSON**, nunca como `number`. Se convierte a
`Decimal` al entrar y al salir. Un `number` en una ruta de dinero es un bug.

---

## 2. Convenciones

### 2.1 Idioma en el código

El brief pide identificadores en inglés (regla 4.10) pero define el modelo de datos
en español (sección 5). Propuesta de resolución:

| Capa                                           | Idioma      | Ejemplo                                  |
| ---------------------------------------------- | ----------- | ---------------------------------------- |
| Modelos y campos Prisma, entidades de dominio  | **Español** | `EmpresaAdministrada.digitoVerificacion` |
| Rutas de la API                                | **Español** | `GET /operaciones/:id/dispersiones`      |
| Clases, servicios, guards, utilidades técnicas | **Inglés**  | `AuditInterceptor`, `InvoicingProvider`  |
| Texto visible al usuario                       | **Español** | siempre                                  |

Razón: el dominio es normativo colombiano y no traduce sin perder precisión
(NIT, dígito de verificación, exógena, dispersión, ICA). El andamiaje técnico sí.
**Confirmar antes de la primera migración** — renombrar después cuesta.

### 2.2 Contrato de la API

- Prefijo `/api/v1`.
- Colección: `{ "datos": [...], "total": n, "pagina": 1, "porPagina": 50 }`
- Error: `{ "error": { "codigo": "EMPRESA_NO_AUTORIZADA", "mensaje": "…en español", "detalles": {} } }`
- Paginación y orden **siempre en servidor**: `?pagina=&porPagina=&orden=campo&dir=asc`
- La empresa activa viaja en el header **`X-Empresa-Id`**, nunca en la URL ni en el body.
  El `EmpresaGuard` valida que el usuario tenga acceso a ella antes de que el
  controlador se ejecute. Ver §3.1.
- Fechas ISO-8601 en UTC. El formateo a `America/Bogota` es responsabilidad del cliente.

### 2.3 Pruebas

Obligatorias (regla 4.10 del brief): dinero, dispersión, consecutivos y permisos.

- `apps/api`: Jest. Unitarias en servicios de dinero/consecutivos; **e2e de aislamiento
  por empresa** (el test que importa: usuario A forzando el id de la empresa B).
- `packages/shared`: Vitest sobre los esquemas Zod y los helpers de Decimal.

---

## 3. Mecanismos transversales (se construyen en la Etapa 1, se usan siempre)

### 3.1 Aislamiento por empresa — tres capas independientes

La fuga entre empresas es el peor error posible del sistema, así que no depende de
un solo control. Cada capa asume que las otras dos fallaron:

1. **`EmpresaGuard` (borde HTTP).** Lee `X-Empresa-Id`, verifica contra
   `UsuarioEmpresa` que el usuario tenga acceso, y publica `empresaId` en el
   `AsyncLocalStorage` de la petición. Sin acceso → `403 EMPRESA_NO_AUTORIZADA`.
   El administrador tiene acceso a todas, pero igual debe elegir una activa.
2. **Extensión de Prisma (borde de datos).** Para todo modelo que tenga el campo
   `empresaId`, inyecta `where.empresaId` en `findMany/findFirst/findUnique/update/
delete/count/aggregate` y `data.empresaId` en `create`. Si no hay empresa en el
   contexto, **lanza excepción**; no consulta sin filtro.
   Lista blanca explícita de modelos exentos: `Usuario`, `Rol`, `PermisoModulo`,
   `EmpresaAdministrada`, `SesionRefresh`, `CalendarioTributario`.
3. **Row Level Security en PostgreSQL (borde del motor).** La aplicación se conecta
   con un rol sin privilegios de dueño y sin `BYPASSRLS`; cada tabla con `empresaId`
   tiene política `USING`/`WITH CHECK` sobre `current_setting('app.empresa_id')`,
   que la extensión de Prisma fija por transacción. Si nadie la fija, la consulta
   devuelve cero filas: el modo de falla es cerrado.
   Detalle completo y SQL en `docs/SEGURIDAD.md` §1.

Consecuencia: aunque un endpoint nuevo olvide el filtro y la extensión falle, la
base de datos sigue negando la fila.

### 3.2 Audit log append-only

- `AuditInterceptor` captura toda mutación (`POST/PATCH/PUT/DELETE`) con usuario,
  empresa, acción, entidad, `valorAnterior`, `valorNuevo`, IP y user-agent.
- El `valorAnterior` lo aporta el servicio (lee antes de escribir); el interceptor
  no adivina.
- Inmutabilidad garantizada **en la base de datos**, no en el código: migración SQL
  con `REVOKE UPDATE, DELETE ON "AuditLog"` para el rol de la aplicación + trigger
  `BEFORE UPDATE OR DELETE` que lanza excepción.
- Campos con datos personales se registran enmascarados; la **exportación masiva**
  se audita como acción propia (`EXPORTAR`), por Ley 1581.

### 3.3 Consecutivos

Tabla `Consecutivo(empresaId, tipo, prefijo, ultimoValor)`. Se incrementa dentro de
la misma transacción que crea el documento, con bloqueo de fila
(`SELECT … FOR UPDATE`). Nunca se calcula con `count()`. Un consecutivo emitido no
se reutiliza aunque el documento se anule.

### 3.4 Cifrado en reposo

`CifradoService` con AES-256-GCM y clave desde variable de entorno (`ENCRYPTION_KEY`),
con `keyVersion` guardada junto al ciphertext para poder rotar. Se cifran:
`Usuario.totpSecret`, `ConfigFacturacion.credenciales`, y los documentos de identidad
de `Empleado` y `Cliente`.
Para los que hay que **buscar** (número de documento) se guarda además un HMAC
determinista `numeroDocHash` que sí es indexable.

### 3.5 Documentos legales

Facturas, órdenes de pago y recibos de nómina: creación y anulación, nunca `UPDATE`
de contenido ni borrado. `anuladaPor`, `motivoAnulacion`, `anuladaEn`. El PDF se
genera una vez y se guarda; no se regenera con datos nuevos.

### 3.6 Almacenamiento de archivos

PDFs y soportes en almacenamiento de objetos S3-compatible (**Cloudflare R2**), en
bucket **privado**, con URLs firmadas de 5 minutos y nombres de archivo generados
por el servidor. Nunca en el sistema de archivos del contenedor (Railway es
efímero) y nunca en un bucket público.

---

## 4. Mapa de las ocho etapas

Cada etapa se entrega funcionando antes de empezar la siguiente. Al iniciar cada
una se propone su esquema Prisma y sus rutas, y se espera confirmación (sección 10
del brief).

### Etapa 1 — Cimientos → detalle completo en `docs/ETAPA-01.md`

Monorepo, esquema núcleo, aislamiento por empresa, auth con 2FA, RBAC, audit log,
layout, sistema de diseño, tabla base, generador de PDF base.

### Etapa 2 — Operaciones

|               |                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entidades** | `Operacion`, `ReglaDispersion`, `Dispersion`, `DispersionDestino`, `Destinatario`                                                                                                                                                            |
| **Rutas**     | `GET/POST /operaciones` · `GET/PATCH /operaciones/:id` · **`GET /operaciones/buscar?hash=`** · `POST /operaciones/:id/dispersion` · `PATCH /dispersiones/:id/destinos/:destinoId/conciliar` · `GET /dispersiones`                            |
| **Núcleo**    | Ganancia calculada y persistida al guardar. Búsqueda por hash indexada y conectada a ⌘K. La suma de destinos debe cuadrar exactamente con el total antes de permitir guardar (validación en Zod compartido _y_ en el servicio, con Decimal). |
| **Tests**     | reparto por porcentaje con residuo, cuadre exacto, congelamiento de `tasaCambio`                                                                                                                                                             |

### Etapa 3 — Egresos

|               |                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entidades** | `Egreso`, `OrdenPago`                                                                                                                                                                                                       |
| **Rutas**     | `GET/POST /egresos` · `GET /egresos/:id` · `POST /egresos/:id/anular` · `GET /ordenes-pago` · `GET /ordenes-pago/:id/pdf` · `POST /ordenes-pago/:id/anular`                                                                 |
| **Núcleo**    | Cada egreso emite orden de pago con consecutivo. Valida el patrón "registro → documento con consecutivo" que reusan nómina y facturación. Anulación con motivo obligatorio y confirmación escrita del consecutivo en la UI. |

### Etapa 4 — Clientes

|               |                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entidades** | `Cliente` (con `numeroDocCifrado` + `numeroDocHash`)                                                                                                            |
| **Rutas**     | `GET/POST /clientes` · `GET/PATCH /clientes/:id` · `GET /clientes/:id/operaciones` · `GET /clientes/:id/calendario` (delega en Contabilidad, no duplica lógica) |

### Etapa 5 — Empleados

|               |                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entidades** | `Empleado`, `ReciboNomina`, `ConceptoNomina`, `DocumentoLaboral`, `PlantillaDocumento`                                                                                                                        |
| **Rutas**     | `GET/POST /empleados` · `GET/PATCH /empleados/:id` · `POST /empleados/:id/recibos` · `GET /recibos-nomina/:id/pdf` · `POST /empleados/:id/documentos` (carta laboral / certificado de ingresos)               |
| **Núcleo**    | Versión **documental** de nómina: devengados y deducciones se ingresan, el sistema totaliza. Cálculo aislado tras `PayrollCalculator`. Los PDF llevan la identidad de la empresa administrada, no la de Nexo. |
| **Abierto**   | `TODO [CONFIRMAR]` motor de cálculo propio vs. proveedor de nómina electrónica                                                                                                                                |

### Etapa 6 — Contabilidad

|               |                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Entidades** | `Factura`, `FacturaItem`, `ConfigFacturacion`, `Gasto`, `CalendarioTributario`, `SolicitudDocumento`, `LogIntegracion`                                                                                                                                                                                                                                       |
| **Rutas**     | `GET/POST /facturas` · `POST /facturas/:id/anular` · `POST /facturas/:id/reenviar` · `GET /facturas/fallidas` · `POST /webhooks/siigo` (público, firmado) · `GET/POST /gastos` · `GET /calendario?documento=&tipoContribuyente=&municipio=` · `GET /calendario/vencimientos` · `POST /admin/calendario/importar` (Excel) · `GET/POST /solicitudes-documento` |
| **Núcleo**    | `InvoicingProvider` con Siigo detrás. Token cacheado 24 h, header `Partner-Id`, credenciales cifradas por empresa. Factura de contado **o** a crédito, nunca ambas. Estado `pendienteEnvio` con reintento en backoff, sin pérdida ni duplicado (clave de idempotencia por factura). Cada llamada al proveedor al audit log con request y respuesta.          |

### Etapa 7 — Cumplimiento

|               |                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entidades** | `RegistroCumplimiento`, `ReporteUiaf`, `PeriodoReporte`                                                                                                                                                                                                                                                              |
| **Rutas**     | `GET/POST /cumplimiento/registros` · `GET/POST /uiaf/reportes` · `GET /uiaf/reportes/:id/exportar?formato=excel\|pdf` · `GET /uiaf/reportes/:id/sirel` · `GET /uiaf/periodos`                                                                                                                                        |
| **Núcleo**    | Motor de reportes con exportación Excel/PDF ahora. Archivo SIREL detrás de `UiafReportFormatter` con `TODO [CONFIRMAR]` (el formato depende del sector del sujeto obligado). Envío manual. Alertas de reportes de ausencia trimestrales, con aviso antes del día 10 del mes siguiente al trimestre. Sin KYC externo. |

### Etapa 8 — Administración General completa

|            |                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rutas**  | `GET /metricas/tablero` · `GET /metricas/:modulo` · visor de audit log con filtros · carga anual del calendario · `POST /exportar/:entidad` |
| **Núcleo** | Exportación a Excel/PDF desde cualquier módulo, respetando filtros activos y permisos, y registrada en el audit log.                        |

---

## 5. Decisiones confirmadas (2026-08-18)

1. **Idioma de los identificadores** (§2.1): dominio en español, técnico en inglés.
2. **Permisos de módulo globales por usuario**; el acceso a empresas se controla aparte
   con `UsuarioEmpresa`. Si más adelante alguien debe editar en una empresa y solo ver
   en otra, `PermisoModulo` gana `empresaId` y se migra.
3. **Almacenamiento de archivos:** Cloudflare R2, bucket privado, URLs firmadas.
4. **Superadministrador:** el rol `ADMINISTRADOR` accede a todas las empresas sin filas
   en `UsuarioEmpresa`, pero igual opera con una empresa activa seleccionada.
5. **Recuperación de 2FA:** 8 códigos de respaldo de un solo uso al activar, más
   reinicio por parte de un administrador, auditado. Sin envío por correo.
6. **Sin correo saliente en la Etapa 1.** La contraseña temporal se muestra una sola vez
   al administrador que crea el usuario.

Sigue abierto, del brief original: el motor de cálculo de nómina (Etapa 5) y el formato
del archivo SIREL (Etapa 7). Ambos aislados tras una interfaz, con `TODO [CONFIRMAR]`.
Nuevo, de `docs/SEGURIDAD.md` §3.2: **si el cliente tiene un dominio propio** para servir
`app.` y `api.` como subdominios; mientras tanto se usa el proxy BFF en Next.js.
