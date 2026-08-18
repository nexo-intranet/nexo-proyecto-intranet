# Seguridad — Intranet Nexo

> Documento vinculante. Todo lo de aquí aplica a **todas** las etapas, no solo a la
> primera. Si una regla se rompe en un módulo, es un bug bloqueante, igual que las
> reglas de la sección 4 del brief.
> Complementa: `docs/ARQUITECTURA.md` · `docs/ETAPA-01.md`

El sistema guarda datos financieros y personales de varias empresas distintas, bajo
Ley 1581 (habeas data) y obligaciones de reporte a la UIAF. Las dos fallas que no se
pueden permitir son **una fuga de datos entre empresas administradas** y **una
credencial de tercero expuesta**. Todo lo demás se ordena alrededor de eso.

---

## 1. Aislamiento por empresa — tres capas

Cada capa asume que las otras dos fallaron.

### Capa 1 · Guard HTTP

`EmpresaGuard` lee el header `X-Empresa-Id`, verifica contra `UsuarioEmpresa` (o el
rol `ADMINISTRADOR`) y publica la empresa en el `AsyncLocalStorage` de la petición.
Sin acceso → `403`. La empresa nunca se toma de la URL ni del body.

### Capa 2 · Extensión de Prisma

Inyecta `empresaId` en toda operación sobre modelos que tengan el campo. Si no hay
empresa en el contexto, **lanza excepción**; nunca consulta sin filtro.

### Capa 3 · Row Level Security en PostgreSQL

La base de datos rechaza la fila aunque la aplicación entera esté equivocada.

**Roles de base de datos separados.** La aplicación nunca se conecta como dueño:

```sql
-- nexo_owner  → dueño del esquema, solo lo usa Prisma Migrate
-- nexo_app    → rol de ejecución, sin BYPASSRLS, sin ser dueño de ninguna tabla
CREATE ROLE nexo_app LOGIN PASSWORD :'clave';
GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_app;

-- El audit log es append-only también a nivel de permisos
REVOKE UPDATE, DELETE ON "AuditLog" FROM nexo_app;
```

Prisma 7 separa las dos conexiones fuera del esquema, lo cual ayuda: `prisma.config.ts`
usa `DIRECT_URL` (rol `nexo_owner`) y es el **único** lugar del proyecto donde aparece
ese rol; el `PrismaClient` de la aplicación se construye con el driver adapter de
`pg` sobre `DATABASE_URL` (rol `nexo_app`). Un descuido no puede hacer que el runtime
termine conectado como dueño.

**Política por tabla.** Toda tabla con `empresaId` lleva:

```sql
ALTER TABLE "Operacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Operacion" FORCE ROW LEVEL SECURITY;

CREATE POLICY aislamiento_empresa ON "Operacion"
  USING      ("empresaId" = current_setting('app.empresa_id', true))
  WITH CHECK ("empresaId" = current_setting('app.empresa_id', true));
```

`current_setting('app.empresa_id', true)` devuelve `NULL` si nadie la fijó, y la
comparación con `NULL` no devuelve filas: **el modo de falla es cerrado**. El
`WITH CHECK` impide además insertar o mover una fila hacia otra empresa.

**Cómo se fija la variable.** Extensión de Prisma que envuelve cada operación en una
transacción y fija la variable con alcance transaccional:

```ts
// core/prisma/extensions/rls.ts
prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const empresaId = contexto.empresaIdOrThrow();
        const [, resultado] = await prismaBase.$transaction([
          prismaBase.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, true)`,
          query(args),
        ]);
        return resultado;
      },
    },
  },
});
```

`set_config(..., true)` es `SET LOCAL`: vive solo dentro de la transacción, así que
es seguro con pool de conexiones y con PgBouncer en modo transacción. Para operaciones
de varios pasos existe `ejecutarEnTransaccion(empresaId, fn)`, que fija la variable
una vez al abrir la transacción interactiva.

**Sin puerta trasera.** No existe un modo "omitir aislamiento". Un reporte que
necesite varias empresas itera sobre las empresas autorizadas del usuario, una
transacción por empresa. Es más lento y es a propósito.

**Tablas sin RLS** (no tienen `empresaId` y su acceso se controla por RBAC):
`Usuario`, `Rol`, `PermisoModulo`, `UsuarioEmpresa`, `SesionRefresh`,
`CodigoRespaldo`, `EmpresaAdministrada`, `CalendarioTributario`.
`AuditLog` sí lleva RLS de lectura por empresa, con `INSERT` siempre permitido.

**Prueba obligatoria (Etapa 1).** Un test que se conecta como `nexo_app`, fija
`app.empresa_id` en la empresa A e intenta leer y escribir filas de la empresa B por
SQL directo, sin pasar por la aplicación. Debe devolver cero filas y fallar la
escritura. Si ese test pasa, las tres capas están vivas.

---

## 2. Secretos y credenciales

### 2.1 Nada de secretos en el repositorio

- `.env` en `.gitignore` desde el primer commit. Se versiona `.env.example` con
  placeholders, nunca con valores reales.
- **gitleaks** en un hook de pre-commit y otra vez en CI. Un secreto detectado bloquea
  el commit y el merge.
- Si un secreto llega a entrar al historial: se rota primero y se limpia después.
  Rotar no es opcional aunque el commit se borre.
- Los secretos de producción viven en las variables de entorno de Railway y Vercel.
  Nunca en argumentos de build, nunca en el Dockerfile, nunca en un log.

### 2.2 Inventario de secretos

| Variable                 | Uso                             | Nota                            |
| ------------------------ | ------------------------------- | ------------------------------- |
| `DATABASE_URL`           | conexión de runtime             | rol `nexo_app`                  |
| `DIRECT_URL`             | migraciones                     | rol `nexo_owner`                |
| `JWT_ACCESS_SECRET`      | firma del token de acceso       | ≥32 bytes aleatorios            |
| `JWT_REFRESH_SECRET`     | firma del refresh               | distinto del anterior           |
| `ENCRYPTION_KEY`         | AES-256-GCM en reposo           | 32 bytes base64                 |
| `ENCRYPTION_KEY_VERSION` | rotación de clave               | se guarda junto al ciphertext   |
| `HMAC_DOC_KEY`           | HMAC de documentos de identidad | permite buscar sin descifrar    |
| `WEBHOOK_SIIGO_SECRET`   | verificación del webhook        | por empresa si Siigo lo permite |
| `S3_*`                   | almacenamiento de archivos      | bucket privado                  |

Las credenciales de Siigo/Facturatech/Dataico **no** son variables de entorno: son
por empresa, se guardan cifradas en `ConfigFacturacion.credencialesCifradas` y solo
se descifran en memoria, en el momento de la llamada.

### 2.3 Rotación

Todo ciphertext guarda `keyVersion`. Al rotar `ENCRYPTION_KEY` se sube la versión, se
descifra con la anterior y se recifra con la nueva en un job puntual. Rotar los
secretos JWT invalida las sesiones activas, lo cual es aceptable y esperado.

---

## 3. Nada de API en lugares públicos

### 3.1 El navegador nunca ve una credencial

- El frontend **jamás** llama a `api.siigo.com` ni a ningún proveedor externo.
  Toda integración vive en el backend. Si un día una llamada externa aparece en el
  código de `apps/web`, es un bug de seguridad, no una optimización.
- En Next.js, solo las variables con prefijo `NEXT_PUBLIC_` llegan al bundle. Lista
  cerrada y revisada: **`NEXT_PUBLIC_APP_URL` y nada más**. Cualquier otra
  `NEXT_PUBLIC_*` requiere justificación escrita en el PR.
- Regla mecánica: si un valor está en `packages/shared` o en `apps/web`, es público.
  Los secretos solo existen en `apps/web/src/app/api/**` (servidor) y en `apps/api`.

### 3.2 El navegador solo habla con un origen

Frontend en Vercel y backend en Railway son **sitios distintos**, lo que obligaría a
cookies `SameSite=None` y reabriría la puerta a CSRF. Dos salidas, en orden de
preferencia:

1. **Dominio propio con subdominios** — `app.nexo…` y `api.nexo…`. Cookies
   first-party con `SameSite=Lax`. Es la opción correcta.
   `TODO [CONFIRMAR]` ¿el cliente tiene dominio disponible para esto?
2. **Mientras tanto: proxy BFF en Next.js.** El navegador solo llama a
   `app/api/**` en Vercel; esos route handlers reenvían al backend con el token.
   La URL real de la API nunca sale al cliente.

En ambos casos el backend de Railway acepta CORS **solo** desde el origen exacto del
frontend, con `credentials: true`. Nunca `*`, nunca reflejo del header `Origin`.

### 3.3 Superficie pública de la API

Solo tres rutas son accesibles sin sesión, y cada una está acotada:

| Ruta                   | Protección                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /salud`           | sin datos de negocio; no revela versiones ni configuración                                                  |
| `POST /auth/*`         | límite de tasa por IP y por email, bloqueo tras 5 intentos                                                  |
| `POST /webhooks/siigo` | firma HMAC verificada, cuerpo crudo, idempotencia por id de evento, rechazo de eventos con más de 5 minutos |

Todo lo demás exige sesión válida **y** permiso de módulo **y** empresa activa
autorizada. No hay endpoints "internos" sin autenticar. Documentación OpenAPI:
deshabilitada en producción o detrás de sesión de administrador.

### 3.4 Cabeceras y transporte

- HTTPS obligatorio, HSTS con `max-age` de un año.
- `helmet` en la API. En Next.js: CSP sin `unsafe-eval`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy` restrictiva.
- La base de datos no expone puerto público; conexión con `sslmode=require`.

---

## 4. Sesión y autenticación

- Contraseñas con **argon2id** (nunca bcrypt por defecto ni SHA). Mínimo 12
  caracteres, comparadas contra una lista de contraseñas comunes.
- Tokens en cookies `httpOnly` + `Secure` + `SameSite=Lax`. **Nunca en
  `localStorage`** — ahí un XSS se lleva la sesión completa.
- Acceso de 15 minutos, refresco de 7 días con **rotación**: usar un refresh ya
  consumido revoca toda la familia de sesiones y queda en el audit log.
- **CSRF:** token de doble envío en cookie legible + header `X-CSRF-Token`, exigido en
  todo `POST/PATCH/PUT/DELETE`. Se valida antes que cualquier otra cosa.
- 2FA TOTP obligatorio para todos. Ventana ±1 intervalo, y un código usado no se
  vuelve a aceptar dentro de su ventana.
- Cambio de contraseña, reinicio de 2FA y desactivación de usuario revocan todas las
  sesiones activas de ese usuario, de inmediato.
- El backend **vuelve a verificar el permiso en cada petición**, leyendo de la base de
  datos y no del contenido del token. Quitar un permiso surte efecto ya, no en 15
  minutos.

---

## 5. Datos personales (Ley 1581 / habeas data)

- Documentos de identidad de empleados y clientes: cifrados con AES-256-GCM. Para
  poder buscarlos se guarda además un HMAC determinista (`numeroDocHash`), que es lo
  único indexado. El número en claro nunca se indexa.
- En la interfaz se muestran enmascarados por defecto (`•••• 4821`); revelarlos es una
  acción explícita y **queda en el audit log**.
- Toda exportación masiva se registra con acción `EXPORTAR`: quién, qué filtros, cuántos
  registros y a qué empresa pertenecían.
- **Logs y trazas nunca contienen** contraseñas, tokens, secretos TOTP, credenciales de
  proveedores, números de documento ni cuerpos completos de peticiones de autenticación.
  Se implementa una lista de campos redactados en el logger, y el filtro de excepciones
  no devuelve stack traces al cliente en producción.
- Los backups son diarios y cifrados, con retención definida y una prueba de
  restauración trimestral. Un backup sin restauración probada no es un backup.

---

## 6. Entrada y archivos

- Toda entrada se valida con el esquema Zod compartido **en el servidor**, no solo en
  el cliente. La validación del cliente es comodidad, no control.
- Prisma parametriza las consultas; cualquier `$queryRaw` usa plantillas con
  parámetros, jamás concatenación de strings.
- Subida de archivos: tamaño máximo, tipo verificado por _magic bytes_ y no por
  extensión, nombre generado por el servidor, bucket **privado** con URLs firmadas de
  5 minutos. Nada se sirve desde un bucket público.
- Los PDF generados también van a almacenamiento privado: una orden de pago o un
  recibo de nómina no debe ser accesible por URL adivinable.
- Escapado de fórmulas al exportar a Excel (`=`, `+`, `-`, `@` al inicio de celda) para
  evitar inyección CSV.

---

## 7. Dependencias y proceso

- Lockfile versionado; `pnpm audit` en CI, y un fallo de severidad alta bloquea el merge.
- Actualizaciones automatizadas (Dependabot o Renovate) revisadas semanalmente.
- Sin dependencias nuevas sin justificación en el PR: cada paquete es superficie de ataque.
- **Checklist obligatorio de PR:**
  - [ ] ¿Toda tabla nueva con `empresaId` tiene RLS habilitada y política creada?
  - [ ] ¿Los endpoints nuevos declaran `@Permiso(...)`?
  - [ ] ¿Alguna mutación quedó fuera del audit log?
  - [ ] ¿Se agregó alguna `NEXT_PUBLIC_*`?
  - [ ] ¿Algún secreto, token o documento de identidad puede terminar en un log?
  - [ ] ¿Hay `float` en algún camino de dinero?
- `/security-review` antes de cada merge a la rama principal.

---

## 8. Qué se hace en la Etapa 1

Estos puntos no se posponen; son parte de los cimientos:

1. Roles `nexo_owner` / `nexo_app` y `DATABASE_URL` con el rol sin privilegios.
2. RLS habilitada y forzada en `AuditLog` y en `Consecutivo` (las únicas tablas con
   `empresaId` de esta etapa), más la plantilla SQL que usará cada tabla futura.
3. Extensión de Prisma que fija `app.empresa_id` por transacción.
4. Test de aislamiento por SQL directo como `nexo_app` (§1).
5. `.gitignore`, `.env.example` y gitleaks en pre-commit y CI.
6. argon2id, cookies httpOnly, rotación de refresh con detección de reuso, CSRF,
   límite de tasa, helmet, CORS de origen exacto.
7. Cifrado AES-256-GCM con `keyVersion` y el HMAC de documentos, listos para las
   etapas que guardan datos personales.
8. Logger con redacción de campos sensibles y filtro de excepciones sin stack traces.

Lo que queda para cuando aparezca su etapa: firma del webhook de Siigo (Etapa 6) y
cifrado de documentos de identidad en uso real (Etapas 4 y 5) — la herramienta ya
existe desde la Etapa 1.
