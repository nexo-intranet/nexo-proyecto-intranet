# Etapa 3 — Egresos · Esquema y API

> **Propuesta. Pendiente de confirmar antes de escribir código.**
> Contexto: `docs/ARQUITECTURA.md` §4 · Seguridad vinculante: `docs/SEGURIDAD.md`

El brief pide poco de este módulo (§3, módulo 02): registrar pagos por intangibles,
que cada uno emita una orden de pago en PDF con consecutivo, y poder anular con
motivo.

Pero es la etapa que **estrena el patrón más importante que queda por construir**:
_registro operativo → documento legal con consecutivo_. Ese mismo patrón lo reusan
después los recibos de nómina (etapa 5) y las facturas de venta (etapa 6). Lo que se
decida aquí se hereda dos veces, así que conviene decidirlo bien una sola vez.

`ConsecutivoService` y `PdfService` llevan desde la Etapa 1 construidos y probados
esperando exactamente esto. Esta etapa los conecta.

**Alcance:** egresos con beneficiario y moneda, emisión automática de la orden de
pago, descarga del PDF, anulación con confirmación escrita, y reemisión.

---

## 1. Las cuatro decisiones

Ninguna es de detalle. Las cuatro cambian el esquema, y tres de ellas se heredan a
nómina y facturación.

### 1.1 El PDF: ¿se guardan los bytes o se guarda lo que decía?

La regla 3 del brief es que un documento legal no se edita ni se borra. Pero eso
deja abierta una pregunta que hay que responder antes de emitir el primero: **¿qué
es exactamente lo inmutable, el archivo o su contenido?**

Si la orden se genera al vuelo cada vez que alguien la descarga, y mañana cambia la
dirección de la empresa, el logo o una línea de la plantilla, la orden `OP-000042`
descargada hoy y la descargada el año entrante **no dicen lo mismo**. Eso rompe la
regla sin que nadie lo note.

Hay tres salidas:

|       | Qué se guarda                                           | A favor                                                                       | En contra                                                                   |
| ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A** | El PDF en Cloudflare R2                                 | Idéntico al byte, para siempre. Es lo que dice el brief §5 (`pdfUrl`)         | Exige montar R2 ahora; el archivo se puede perder y no se puede reconstruir |
| **B** | Un `snapshot` JSON de lo que se imprimió, y se regenera | Sin infraestructura nueva; siempre reconstruible; ocupa poco y es consultable | Los bytes pueden cambiar si cambia la plantilla, aunque el contenido no     |
| **C** | Las dos: snapshot ahora, archivo cuando R2 exista       | Lo mejor de ambas                                                             | Más trabajo, y hay que decidir cuál manda si difieren                       |

> **Recomiendo B**, con el `sha256` del PDF emitido guardado al lado.
>
> Lo que un contador o un revisor necesita probar es **qué decía** la orden, no qué
> bytes tenía. El snapshot lo garantiza: el documento se congela con el nombre, el
> NIT y la dirección que tenía la empresa el día que se emitió, aunque hoy sean
> otros. Y el hash deja constancia del archivo exacto, por si alguna vez hace falta.
>
> R2 se monta en la Etapa 6, que es cuando aparecen los soportes adjuntos y hay que
> montarlo de todos modos. Ahí se puede archivar el PDF además del snapshot, sin
> migrar nada: la columna ya estará.

### 1.2 El beneficiario: ¿texto libre o catálogo?

Un egreso se le paga a alguien. Ese alguien tiene nombre, documento y cuenta
bancaria — **exactamente la forma de `Destinatario`**, que ya existe desde la Etapa 2
con el documento y la cuenta cifrados.

La tentación es reusarlo. El problema es que un destinatario de dispersión es un
socio que recibe parte de una ganancia, y el beneficiario de un egreso es un
proveedor al que se le paga una licencia. Meterlos en la misma tabla mezcla dos
catálogos que la gente mantiene por separado.

> **Recomiendo el punto medio:** `beneficiario` como texto obligatorio —siempre—, más
> un `destinatarioId` **opcional** que enlaza al catálogo cuando el beneficiario ya
> está ahí.
>
> El texto es un snapshot, igual que en las dispersiones: si mañana corrigen el
> nombre en el catálogo, la orden de pago emitida sigue diciendo a quién se le pagó.
> Y el enlace opcional permite, más adelante, listar todo lo pagado a un tercero sin
> obligar hoy a llenar un catálogo antes de registrar el primer egreso.
>
> **Ojo:** la Etapa 6 (gastos operativos) va a hacerse esta misma pregunta. Si el
> cliente quiere un catálogo único de terceros —proveedores, socios, beneficiarios—
> es mejor decidirlo ahora que migrar dos tablas después.

### 1.3 Editar un egreso ya documentado

Un egreso es un registro operativo, no un documento legal: en principio se puede
corregir. Pero en cuanto emite su orden de pago, corregirlo dejaría al documento
diciendo una cosa y al registro otra.

> **Recomiendo:** un egreso con orden vigente **no se edita en silencio**. Editarlo
> anula la orden vigente —con motivo— y emite una nueva con consecutivo nuevo, en la
> misma transacción. Las dos quedan en el historial.
>
> Es exactamente lo que manda la regla 3 del brief («corregir = anular y emitir uno
> nuevo, dejando ambos en el historial»), y hace que la corrección sea un acto
> visible en vez de una edición silenciosa.

### 1.4 Qué es un «intangible»

El brief dice «licencias, servicios digitales, derechos» y ahí se detiene. Eso es
una lista de ejemplos, no una taxonomía.

> **Propongo** arrancar con `LICENCIA_SOFTWARE`, `SERVICIO_DIGITAL`, `DERECHOS`,
> `SUSCRIPCION` y `OTRO`, y dejar `TODO [CONFIRMAR]` en el esquema.
>
> `OTRO` no es pereza: es lo que evita que alguien clasifique mal un egreso con tal
> de poder guardarlo. Si al cabo de unos meses la mitad cae en `OTRO`, la lista real
> del cliente se lee sola en los datos.

---

## 2. Esquema Prisma

### 2.1 Egreso

```prisma
/// Pago por un intangible: licencia, servicio digital, derechos.
/// Es un registro operativo — el documento legal es su OrdenPago.
model Egreso {
  id        String @id @default(cuid())
  empresaId String

  concepto       String
  tipoIntangible TipoIntangible
  descripcion    String?

  // ── A quién se le pagó ────────────────────────────────────────────────────
  /// Snapshot obligatorio. Si mañana corrigen el nombre en el catálogo, la orden
  /// ya emitida tiene que seguir diciendo a quién se le pagó realmente.
  beneficiario   String
  /// Enlace opcional al catálogo de la Etapa 2, cuando el beneficiario ya está.
  destinatarioId String?

  // ── La plata ──────────────────────────────────────────────────────────────
  // Regla 2 del brief: toda transacción guarda monto, moneda y —si aplica— la
  // tasa y el equivalente en pesos, congelados al momento del egreso.
  monto      Decimal  @db.Decimal(18, 2)
  moneda     Moneda
  tasaCambio Decimal? @db.Decimal(18, 6)
  /// Calculado y persistido al guardar, nunca derivado en cada lectura.
  montoCOP   Decimal  @db.Decimal(18, 2)

  fecha  DateTime
  estado EstadoEgreso @default(REGISTRADO)

  motivoAnulacion String?
  anuladoEn       DateTime?
  anuladoPorId    String?

  empresa      EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  destinatario Destinatario?       @relation(fields: [destinatarioId], references: [id])
  anuladoPor   Usuario?            @relation("egresoAnuladoPor", fields: [anuladoPorId], references: [id])
  ordenes      OrdenPago[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([empresaId, fecha(sort: Desc)])
  @@index([empresaId, estado])
  @@index([destinatarioId])
}

enum TipoIntangible {
  // TODO [CONFIRMAR] Lista de arranque. El brief solo da ejemplos.
  LICENCIA_SOFTWARE
  SERVICIO_DIGITAL
  DERECHOS
  SUSCRIPCION
  OTRO
}

enum EstadoEgreso {
  REGISTRADO // vigente, con su orden de pago emitida
  ANULADO // sin efecto, se conserva con su motivo
}
```

### 2.2 Orden de pago

```prisma
/// El documento legal. No se edita ni se borra: se anula y se reemite.
model OrdenPago {
  id        String @id @default(cuid())
  empresaId String
  egresoId  String

  /// Lo que se imprime: «OP-000042». Único por empresa, para siempre.
  consecutivo String
  /// El número suelto, para ordenar sin parsear el texto.
  numero      Int

  estado EstadoOrdenPago @default(VIGENTE)

  /// **Lo que decía el documento el día que se emitió.**
  ///
  /// Congela el emisor (nombre, NIT, dirección, municipio), el beneficiario, el
  /// concepto y los montos. El PDF se regenera desde aquí, así que cambiar hoy la
  /// dirección de la empresa no altera una orden emitida el año pasado.
  ///
  /// Ver decisión 1.1: esto es lo inmutable, no los bytes del archivo.
  contenido Json

  /// sha256 del PDF que se emitió. Deja constancia del archivo exacto.
  hashArchivo  String?
  /// Clave en R2. Nula hasta la Etapa 6, que es cuando se monta el bucket.
  claveArchivo String?

  emitidaEn    DateTime @default(now())
  emitidaPorId String

  motivoAnulacion String?
  anuladaEn       DateTime?
  anuladaPorId    String?
  /// Si esta orden reemplaza a una anulada, cuál. Encadena el historial.
  reemplazaAId    String?   @unique

  empresa        EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  egreso         Egreso              @relation(fields: [egresoId], references: [id])
  emitidaPor     Usuario             @relation("ordenEmitidaPor", fields: [emitidaPorId], references: [id])
  anuladaPor     Usuario?            @relation("ordenAnuladaPor", fields: [anuladaPorId], references: [id])
  reemplazaA     OrdenPago?          @relation("reemision", fields: [reemplazaAId], references: [id])
  reemplazadaPor OrdenPago?          @relation("reemision")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // Sin deletedAt: un documento legal no se borra ni suavemente.

  @@unique([empresaId, consecutivo])
  @@index([empresaId, estado])
  @@index([empresaId, numero(sort: Desc)])
  @@index([egresoId])
}

enum EstadoOrdenPago {
  VIGENTE
  ANULADA
}
```

**Tres cosas del esquema que no son obvias:**

- **`OrdenPago` no lleva `deletedAt`.** Todas las demás tablas del sistema sí (regla 4).
  Un documento legal no se borra ni suavemente: si pudiera desaparecer de las
  consultas, el consecutivo quedaría con un hueco que nadie sabe explicar.
- **`reemplazaAId` es `@unique`.** Una orden anulada se reemite una sola vez. Sin eso,
  dos reemisiones de la misma orden dejarían dos documentos vigentes por un mismo
  egreso.
- **Las dos tablas llevan `empresaId`**, así que las dos necesitan su política RLS en
  la misma migración. La prueba de catálogo de `rls.spec.ts` no las enumera: consulta
  `pg_class` y falla sola si falta alguna.

---

## 3. La emisión, paso a paso

Todo en una sola transacción. Si algo falla, no queda ni el egreso sin documento ni
un consecutivo quemado.

```
POST /egresos
  │
  ├─ 1. Valida el cuerpo y calcula montoCOP con la tasa recibida
  ├─ 2. Abre transacción
  │     ├─ crea el Egreso
  │     ├─ consecutivo.siguienteEn(tx, 'ORDEN_PAGO')   ← SELECT ... FOR UPDATE
  │     ├─ arma el snapshot con los datos de la empresa
  │     └─ crea la OrdenPago VIGENTE con ese snapshot
  ├─ 3. Registra en el audit log (dentro de la misma transacción)
  └─ 4. Responde con el egreso y su orden
```

El PDF **no se genera aquí**. Se genera cuando alguien lo pide, desde el snapshot.
Emitir el documento es asignarle el consecutivo y congelar su contenido; renderizarlo
es otra cosa, y hacerla en la transacción solo la haría más lenta y más frágil.

---

## 4. Rutas de la API

### 4.1 Egresos

| Método  | Ruta                  | Qué hace                                                                                                             |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/egresos`            | Lista paginada. Filtros: `estado`, `tipoIntangible`, `moneda`, rango de fechas, búsqueda por concepto o beneficiario |
| `GET`   | `/egresos/:id`        | Detalle con su historial de órdenes                                                                                  |
| `POST`  | `/egresos`            | Crea el egreso **y emite su orden de pago**                                                                          |
| `PATCH` | `/egresos/:id`        | Corrige. Anula la orden vigente y emite una nueva (decisión 1.3). Exige `motivo`                                     |
| `POST`  | `/egresos/:id/anular` | Anula el egreso y su orden vigente                                                                                   |
| `GET`   | `/egresos/resumen`    | Totales del período por moneda y por tipo, para la portada                                                           |

No hay `DELETE`. Igual que en Operaciones, el endpoint que falta es parte del diseño.

### 4.2 Órdenes de pago

| Método | Ruta                         | Qué hace                                                      |
| ------ | ---------------------------- | ------------------------------------------------------------- |
| `GET`  | `/ordenes-pago`              | Historial. Filtros: `estado`, rango, búsqueda por consecutivo |
| `GET`  | `/ordenes-pago/:id`          | Detalle, incluido el snapshot                                 |
| `GET`  | `/ordenes-pago/:id/pdf`      | Genera y descarga el PDF desde el snapshot                    |
| `POST` | `/ordenes-pago/:id/anular`   | Anula solo el documento, dejando el egreso vigente            |
| `POST` | `/ordenes-pago/:id/reemitir` | Emite una nueva por el mismo egreso, encadenada a la anulada  |

`POST /ordenes-pago` no existe: una orden nace de un egreso, nunca suelta.

### 4.3 La confirmación escrita

`anulacionEsquema` ya está en `@nexo/shared` desde la Etapa 1, con `motivo` y
`confirmacionConsecutivo`, y hasta hoy no lo usaba nadie. Esta etapa es su primer
uso real: para anular hay que **escribir el consecutivo a mano**.

No es fricción por deporte. Es lo que separa «me equivoqué de fila» de «quise anular
este documento», y el brief lo pide explícitamente en la sección de interfaz.

El servidor compara contra el consecutivo real y responde `DATOS_INVALIDOS` si no
coincide: la confirmación se valida en el backend, no solo en el formulario.

---

## 5. Pantallas

| Ruta               | Qué muestra                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `/egresos`         | Tabla densa con filtros en pastilla por estado y tipo. Detalle en panel lateral |
| `/egresos` → panel | El egreso, su orden vigente, el historial de anuladas, y descarga del PDF       |
| `/egresos/ordenes` | Historial de órdenes de pago, buscable por consecutivo, todas descargables      |

La subnavegación de Egresos repite el patrón que ya tiene Operaciones: **Egresos ·
Órdenes de pago**.

El formulario de egreso lleva **el equivalente en pesos en vivo** cuando la moneda no
es COP, con el mismo `convertir` de `@nexo/shared` que usa el servidor — igual que la
ganancia en Operaciones. Quien registra un egreso en dólares necesita ver cuánto es
en pesos antes de guardar, no después.

---

## 6. Criterio de terminado

Verificable, no opinable:

1. Crear un egreso emite su orden con consecutivo, y **veinte creaciones
   simultáneas no repiten ningún número** (la prueba ya existe para consecutivos;
   se extiende a este flujo).
2. El PDF descargado trae la identidad de la **empresa administrada**, no la de Nexo.
3. Cambiar la dirección de la empresa **no altera** una orden emitida antes.
4. Anular sin escribir el consecutivo correcto responde `400`, no anula nada.
5. Una orden anulada se puede reemitir **una sola vez**; el segundo intento responde
   `409`.
6. Un egreso de otra empresa responde `404` aunque se fuerce el id en la URL.
7. Las dos tablas nuevas aparecen con RLS habilitada, forzada y con política — lo
   comprueba la prueba de catálogo, sin enumerarlas.
8. El audit log registra creación, anulación y reemisión con su motivo.

---

## 7. Lo que esta etapa **no** incluye

Para que quede dicho antes de empezar:

- **Soportes adjuntos** (la factura del proveedor). Necesitan R2, que se monta en la
  Etapa 6. Si el cliente los quiere ya, hay que subir R2 a esta etapa.
- **Retenciones y aprobaciones.** El brief no las pide para egresos. Si un egreso
  grande necesita visto bueno de alguien antes de emitirse, eso es un flujo de
  aprobación y no está en el alcance.
- **Pago efectivo.** El sistema registra el egreso y emite su orden; no marca si el
  giro salió del banco. Operaciones sí concilia giros, egresos no — si hace falta,
  vale la pena decirlo ahora.
