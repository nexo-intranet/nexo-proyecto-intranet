# Etapa 7 — Cumplimiento · Esquema y API

> **Propuesta. Pendiente de confirmar antes de escribir código** (regla de `CLAUDE.md`).
> Deriva del brief §05 y de `docs/SEGURIDAD.md` §5.

---

## 1. Qué es esta etapa, en una frase

Es donde el proyecto deja de reemplazar hojas de cálculo y empieza a reemplazar
**evidencia legal**. Una aceptación de política mal guardada no es un error de datos:
es un consentimiento que no se puede probar ante la Superintendencia de Industria y
Comercio.

Por eso las reglas de aquí son más duras que las del resto del sistema, y una de
ellas —`VersionPolitica` inmutable— ya está escrita en las reglas no negociables del
proyecto desde la etapa 1.

---

## 2. La decisión que va primero: partirla en dos

### 7a · Políticas, aceptaciones y registro de cumplimiento

Es el corazón de la etapa y no depende de nadie externo. Incluye lo que hoy la
clienta hace con un formulario suelto: que una persona acepte la política de
tratamiento de datos antes de que se consulte su información.

### 7b · Reportes UIAF

Tiene el mismo problema que la 6b con Siigo, pero **más leve**: el formato exacto del
archivo de cargue a SIREL depende del sector del sujeto obligado y el brief lo deja
marcado como `TODO [CONFIRMAR]`.

La diferencia con Siigo es que aquí no hay que esperar a nadie para construir casi
todo: la periodicidad, los avisos de vencimiento, la agregación de operaciones y la
exportación a Excel y PDF no dependen del formato. Lo único que espera es el
`UiafReportFormatter` que arma el archivo plano.

**Propuesta:** hacer 7a y 7b completas en esta etapa, con el formateador de SIREL
detrás de una interfaz y una implementación provisional que documenta lo que asume.
El envío es manual de todos modos —no hay API pública de la UIAF—, así que un formato
que haya que ajustar después se corrige en un archivo, no en el módulo.

---

## 3. Las decisiones de la 7a

### 3.1 Una política se publica, no se guarda

`Politica` es el contenedor —«Política de tratamiento de datos de Nexo»— y
`VersionPolitica` es el texto. Cambiar el texto **no edita nada**: crea una versión
nueva y la anterior queda en el historial.

Una versión tiene dos estados: borrador y publicada. En borrador se edita libremente;
al publicarla se congela y a partir de ahí el registro es de solo lectura, con
`REVOKE UPDATE` en la base como respaldo de la regla —igual que el audit log—.

La razón está en `SEGURIDAD.md` §5 y vale repetirla: si el texto se pudiera editar,
las aceptaciones ya firmadas quedarían apuntando a un texto que la persona nunca vio.
El consentimiento dejaría de ser verificable, que es exactamente lo único que un
consentimiento tiene que ser.

**Consecuencia práctica:** publicar es una acción con confirmación explícita, como
anular una orden de pago. No es un botón de guardar.

### 3.2 Qué significa que una aceptación esté «vigente»

Esta es la pregunta que decide el comportamiento de todo el módulo, y el brief no la
responde. Propongo:

> Una aceptación está vigente si apunta a la **versión publicada hoy** de la política
> de tratamiento de datos de esa empresa, y no ha sido revocada.

Es decir: **publicar una versión nueva invalida las aceptaciones anteriores** para
efectos de consultar a esa persona de nuevo. No las borra —siguen siendo evidencia de
lo que se aceptó en su momento, y esa evidencia hay que conservarla— pero dejan de
autorizar consultas nuevas.

La alternativa sería que una aceptación de 2024 siguiera habilitando consultas bajo
una política de 2026 que la persona nunca leyó. Eso es cómodo y es justo lo que la
ley no permite.

**Efecto secundario que hay que tener claro:** publicar una versión nueva obliga a
volver a pedir aceptación a todo el mundo. Por eso la publicación avisa cuántas
aceptaciones vigentes va a invalidar **antes** de confirmarse, igual que la
importación del calendario muestra qué reemplaza.

### 3.3 Revocación: algo que el brief no pide y la ley sí da

La Ley 1581 le da al titular el derecho a revocar su autorización. El brief no lo
menciona, probablemente porque el formulario que usan hoy tampoco lo contempla.

Propongo agregar `revocadaEn` y `motivoRevocacion` a `AceptacionPolitica`. Es un campo
y una ruta; no tenerlo significaría atender esas solicitudes por fuera del sistema, y
entonces el sistema estaría mostrando como vigente algo que ya no lo está.

**Esto es una adición sobre el brief y lo marco como tal.** Si prefieres dejarlo para
después, se puede, pero la columna conviene crearla ahora: agregarla después es una
migración sobre una tabla que ya tiene evidencia legal dentro.

### 3.4 El registro de cumplimiento no deja registrar sin aceptación

Es la regla del brief §05, y se valida en el backend:

> Antes de crear un `RegistroCumplimiento` sobre una persona, tiene que existir una
> aceptación vigente suya. Si no la hay, el API responde con un error que **dice cuál
> es el siguiente paso**, no un 403 seco.

El frontend usa ese error para ofrecer capturar la aceptación en el momento: se
muestra el texto de la versión vigente, la persona diligencia sus datos y acepta, y
recién entonces se puede registrar la consulta.

### 3.5 Datos personales de gente que no es usuaria ni cliente

`AceptacionPolitica` guarda el documento de identidad de personas que no están en
ninguna otra tabla. Se trata igual que en `Cliente`, sin excepciones:

- `numeroDocCifrado` — AES-256-GCM;
- `numeroDocHash` — HMAC determinista, lo único indexado, que es lo que permite
  «buscar por documento» sin descifrar la tabla;
- `numeroDocFinal` — los últimos cuatro, para mostrar sin descifrar.

La **IP** también es dato personal, pero es la evidencia de la aceptación y sin ella
el consentimiento pierde valor probatorio. Se guarda. Lo que propongo es no exponerla
en listados: aparece solo al abrir una aceptación concreta, y esa lectura queda en el
audit log.

---

## 4. Las decisiones de la 7b

### 4.1 La periodicidad es un cálculo, no una tabla

Los reportes de ausencia son trimestrales y vencen dentro de los primeros diez días
del mes siguiente al trimestre. Eso es una regla fija, no un dato que alguien cargue:
se calcula, igual que el vencimiento de una solicitud de documento.

Lo que sí se guarda es qué reportes **se generaron**. Un trimestre sin fila es un
trimestre sin reporte, y eso es precisamente lo que hay que poder ver.

### 4.2 El formato de SIREL, detrás de una interfaz

```ts
export interface UiafReportFormatter {
  readonly nombre: string;
  formatear(reporte: DatosReporteUiaf): Promise<Buffer>;
}
```

Igual que `CalculadoraNomina` y `AlmacenArchivos`. La implementación de hoy documenta
en su cabecera qué asume del formato y qué falta confirmar. Cuando llegue la
especificación del sector, se escribe otra clase y se cambia una línea.

---

## 5. Esquema Prisma propuesto

```prisma
enum TipoPolitica {
  TRATAMIENTO_DATOS
  INTERNA
  OTRA
}

enum EstadoVersionPolitica {
  BORRADOR
  PUBLICADA
}

model Politica {
  id        String @id @default(cuid())
  empresaId String

  tipo   TipoPolitica
  nombre String
  activa Boolean      @default(true)

  versiones VersionPolitica[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  empresa EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  // Una sola política de tratamiento de datos activa por empresa: si hubiera dos,
  // «la versión vigente» dejaría de tener un significado único.
  @@index([empresaId, tipo])
}

/// Inmutable una vez publicada (brief §4.14, SEGURIDAD.md §5).
/// La migración incluye `REVOKE UPDATE, DELETE` sobre las filas publicadas.
model VersionPolitica {
  id         String @id @default(cuid())
  empresaId  String
  politicaId String

  version   Int
  contenido String                @db.Text
  estado    EstadoVersionPolitica @default(BORRADOR)

  vigenteDesde DateTime?
  publicadaPor String?
  publicadaEn  DateTime?

  politica     Politica             @relation(fields: [politicaId], references: [id])
  publicador   Usuario?             @relation(fields: [publicadaPor], references: [id])
  aceptaciones AceptacionPolitica[]

  createdAt DateTime @default(now())

  @@unique([politicaId, version])
  @@index([empresaId, politicaId, estado])
}

enum OrigenAceptacion {
  CONSULTA_INTERNA
  FORMULARIO_PUBLICO // etapa 9
}

model AceptacionPolitica {
  id                String @id @default(cuid())
  empresaId         String
  versionPoliticaId String

  nombreCompleto   String
  tipoDoc          TipoDocumento
  /// Los tres campos del documento, igual que en Cliente (SEGURIDAD.md §5).
  numeroDocCifrado String
  numeroDocHash    String
  numeroDocFinal   String
  email            String?
  telefono         String?

  aceptadaEn DateTime         @default(now())
  /// Evidencia del consentimiento. No se muestra en listados.
  ip         String
  userAgent  String?
  origen     OrigenAceptacion

  /// Derecho de revocación (Ley 1581). Adición sobre el brief — ver §3.3.
  revocadaEn       DateTime?
  motivoRevocacion String?

  /// Se llenan cuando la aceptación nace de otro flujo.
  solicitudTramiteId     String?
  registroCumplimientoId String?

  version VersionPolitica     @relation(fields: [versionPoliticaId], references: [id])
  empresa EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  // Buscar «qué aceptó esta persona» sin descifrar nada.
  @@index([empresaId, numeroDocHash])
  @@index([empresaId, versionPoliticaId])
}

enum TipoConsultaCumplimiento {
  LISTAS_RESTRICTIVAS
  ORIGEN_FONDOS
  DEBIDA_DILIGENCIA
  OTRA
}

enum ResultadoCumplimiento {
  APROBADO
  RECHAZADO
  REQUIERE_REVISION
}

model RegistroCumplimiento {
  id          String  @id @default(cuid())
  empresaId   String
  operacionId String?

  /// A quién se consultó. Mismo tratamiento del documento.
  nombreCompleto   String
  tipoDoc          TipoDocumento
  numeroDocCifrado String
  numeroDocHash    String
  numeroDocFinal   String

  tipoConsulta  TipoConsultaCumplimiento
  resultado     ResultadoCumplimiento
  observaciones String?                  @db.Text

  /// La aceptación que autorizó esta consulta. Obligatoria: sin ella no se crea.
  aceptacionId String
  realizadoPor String

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  operacion Operacion?          @relation(fields: [operacionId], references: [id])
  usuario   Usuario             @relation(fields: [realizadoPor], references: [id])
  empresa   EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  @@index([empresaId, createdAt])
  @@index([empresaId, numeroDocHash])
  @@index([empresaId, operacionId])
}

enum TipoReporteUiaf {
  OPERACIONES_SOSPECHOSAS
  AUSENCIA_OPERACIONES
  TRANSACCIONES_EFECTIVO
}

enum EstadoReporteUiaf {
  BORRADOR
  GENERADO
  PRESENTADO
}

model ReporteUiaf {
  id        String @id @default(cuid())
  empresaId String

  tipoReporte TipoReporteUiaf
  anio        Int
  trimestre   Int
  estado      EstadoReporteUiaf @default(BORRADOR)

  /// El archivo de cargue. Se guarda con ArchivosService, bucket privado.
  archivoClave  String?
  archivoNombre String?
  /// Qué formateador lo produjo: el formato de SIREL está por confirmar y hay que
  /// poder saber cuál se usó para un archivo ya generado.
  formateador   String?

  generadoPor  String?
  generadoEn   DateTime?
  presentadoEn DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  usuario Usuario?            @relation(fields: [generadoPor], references: [id])
  empresa EmpresaAdministrada @relation(fields: [empresaId], references: [id])

  @@unique([empresaId, tipoReporte, anio, trimestre])
  @@index([empresaId, anio, trimestre])
}
```

Las cinco tablas llevan `empresaId` y **las cinco necesitan su política RLS en la
misma migración**, según la regla del proyecto.

---

## 6. Rutas propuestas

### Políticas

| Método | Ruta                               | Permiso                 |
| ------ | ---------------------------------- | ----------------------- |
| GET    | `/politicas`                       | CUMPLIMIENTO · ver      |
| GET    | `/politicas/:id`                   | CUMPLIMIENTO · ver      |
| POST   | `/politicas`                       | ADMINISTRACION · editar |
| GET    | `/politicas/:id/versiones`         | CUMPLIMIENTO · ver      |
| POST   | `/politicas/:id/versiones`         | ADMINISTRACION · editar |
| PATCH  | `/versiones-politica/:id`          | ADMINISTRACION · editar |
| GET    | `/versiones-politica/:id/publicar` | ADMINISTRACION · editar |
| POST   | `/versiones-politica/:id/publicar` | ADMINISTRACION · editar |

`PATCH` solo funciona en borrador; sobre una versión publicada responde `409`.

El `GET .../publicar` es la previsualización: **cuántas aceptaciones vigentes va a
invalidar** esta publicación. Mismo patrón que la previsualización del calendario.

### Aceptaciones

| Método | Ruta                        | Permiso               |
| ------ | --------------------------- | --------------------- |
| GET    | `/aceptaciones`             | CUMPLIMIENTO · ver    |
| GET    | `/aceptaciones/:id`         | CUMPLIMIENTO · ver    |
| GET    | `/aceptaciones/vigente`     | CUMPLIMIENTO · ver    |
| POST   | `/aceptaciones`             | CUMPLIMIENTO · editar |
| POST   | `/aceptaciones/:id/revocar` | CUMPLIMIENTO · editar |
| GET    | `/aceptaciones/exportar`    | CUMPLIMIENTO · ver    |

`GET /aceptaciones/vigente?tipoDoc=CC&numeroDoc=…` es la que consulta el frontend
antes de dejar registrar una consulta. Responde la aceptación o `null`, nunca un
error: «no hay» es una respuesta legítima, no un fallo.

### Registro de cumplimiento

| Método | Ruta                            | Permiso               |
| ------ | ------------------------------- | --------------------- |
| GET    | `/cumplimiento`                 | CUMPLIMIENTO · ver    |
| GET    | `/cumplimiento/:id`             | CUMPLIMIENTO · ver    |
| POST   | `/cumplimiento`                 | CUMPLIMIENTO · editar |
| GET    | `/operaciones/:id/cumplimiento` | OPERACIONES · ver     |

### Reportes UIAF

| Método | Ruta                   | Permiso               |
| ------ | ---------------------- | --------------------- |
| GET    | `/uiaf`                | CUMPLIMIENTO · ver    |
| GET    | `/uiaf/pendientes`     | CUMPLIMIENTO · ver    |
| POST   | `/uiaf`                | CUMPLIMIENTO · editar |
| GET    | `/uiaf/:id/archivo`    | CUMPLIMIENTO · ver    |
| POST   | `/uiaf/:id/presentado` | CUMPLIMIENTO · editar |

`/uiaf/pendientes` es el cálculo de los trimestres vencidos o por vencer: no lee una
tabla de plazos, los deduce.

---

## 7. Criterio de terminado

1. Una versión publicada **no se puede editar**, ni por el API ni con un `UPDATE`
   directo con el rol de la aplicación.
2. Publicar una versión nueva avisa cuántas aceptaciones va a invalidar **antes** de
   confirmarse.
3. Registrar una consulta de cumplimiento sin aceptación vigente responde con un
   error que dice qué falta, y el frontend ofrece capturarla ahí mismo.
4. Buscar por documento encuentra las aceptaciones **sin descifrar la tabla**.
5. Una aceptación revocada deja de contar como vigente pero sigue existiendo.
6. La IP no aparece en listados; verla queda en el audit log.
7. Los trimestres pendientes se calculan, no se cargan.
8. Las cinco tablas nuevas aparecen en el inventario de RLS.

---

## 8. Lo que esta etapa **no** incluye

- **Validación de cédulas por Tusdatos o cualquier proveedor KYC externo.** El brief
  lo excluye explícitamente.
- **Envío automático a SIREL.** No existe API pública: el sistema genera el archivo y
  una persona lo carga.
- **El formulario público** donde alguien acepta la política desde internet. Eso es la
  etapa 9, y por eso `OrigenAceptacion` ya contempla `FORMULARIO_PUBLICO` desde hoy:
  el campo cuesta nada ahora y evita una migración sobre datos legales después.

---

## 9. Preguntas abiertas

1. **La revocación (§3.3)** — ¿entra en esta etapa o se deja anotada?
2. **¿Publicar una versión nueva invalida las aceptaciones anteriores?** Es lo que
   propongo en §3.2 y es lo correcto legalmente, pero tiene un costo operativo real:
   obliga a volver a pedir aceptación. Conviene que la clienta lo sepa antes, no
   después de publicar.
3. **El sector del sujeto obligado**, para el formato de SIREL. No bloquea la etapa,
   pero conviene ir preguntándolo.
