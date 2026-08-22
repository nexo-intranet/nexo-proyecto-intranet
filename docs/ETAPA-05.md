# Etapa 5 — Empleados · Esquema y API

> **Construida (2026-08-22),** con las tres decisiones tal como se recomendaron.
> Contexto: `docs/ARQUITECTURA.md` §4 · Seguridad vinculante: `docs/SEGURIDAD.md`

El brief pide tres documentos y una ficha (§6, módulo 03):

1. Ficha del empleado con los datos necesarios para generar documentos
2. **Recibo de nómina** por período — devengados y deducciones ingresados, totalizados
3. **Carta laboral** desde plantilla, y **certificado de ingresos y retenciones**

Los tres salen en PDF con la identidad de la **empresa administrada**, no la de Nexo.

**La clienta confirmó** (2026-08-22) lo que ya decía la decisión 5 del brief: por
ahora se ponen los valores a mano, y las fórmulas vienen después. Esa respuesta
resuelve más de lo que parece — se explica en la decisión 1.

Esta etapa reusa el patrón que estrenó Egresos: **registro operativo → documento
legal con consecutivo**. Es la segunda de las tres veces que aparece; la tercera es
facturación.

---

## 1. Los conceptos no son una lista fija

Yo iba a preguntar cuáles conceptos de devengados y deducciones usan. La respuesta
—«solo poner los valores»— dice que **no hay un catálogo cerrado**: quien liquida
escribe el concepto y el valor.

Eso descarta el diseño obvio, que era una columna por concepto (`salarioBase`,
`auxilioTransporte`, `salud`, `pension`…). Ese esquema se rompe el día que alguien
necesita una fila que no previmos, y obliga a una migración por cada concepto nuevo.

> **Recomiendo** una tabla hija `ConceptoNomina` con `tipo` (devengado o deducción),
> `concepto` como texto, `valor` y `orden`. El recibo tiene tantas filas como haga
> falta.
>
> **Tabla y no un campo JSON**, aunque el brief los escriba como `devengados[]`. Con
> filas de verdad se puede responder «cuánto se pagó de auxilio de transporte en el
> año» sin abrir cada recibo. Con JSON, esa pregunta —que va a llegar en
> Contabilidad— obliga a recorrer todo.
>
> La interfaz sugiere los conceptos habituales en un desplegable **editable**: se
> escribe rápido lo de siempre sin cerrarle la puerta a lo excepcional.

---

## 2. La calculadora que todavía no calcula

El brief pide aislar el cálculo tras `PayrollCalculator` porque la clienta quiere
fórmulas en una fase posterior. Hoy esa calculadora solo suma.

Es tentador saltarse la interfaz —«ya la haremos cuando haya fórmulas»— y es
justamente lo que la haría cara después: para entonces el código de totalizar
estaría repartido entre el servicio, el controlador y el PDF.

> **Recomiendo** crear `CalculadoraNomina` desde ahora, con una sola implementación
> —`TotalizadorManual`— que suma devengados, resta deducciones y devuelve el neto.
> Vive en `packages/shared`, igual que `calcularGanancia` y `calcularReparto`, para
> que el formulario muestre el neto en vivo con **el mismo código** que después
> persiste el servidor.
>
> Cuando lleguen las fórmulas, se agrega otra implementación y nada más cambia.

---

## 3. No todos los documentos son iguales

Los tres PDF del módulo se parecen, pero **no son la misma clase de cosa**, y
tratarlos igual sería un error.

|                             | Qué es                                   | ¿Consecutivo?                                | ¿Snapshot? |
| --------------------------- | ---------------------------------------- | -------------------------------------------- | ---------- |
| **Recibo de nómina**        | Registro de un pago que ocurrió          | **Sí** (`RECIBO_NOMINA`, ya está en el enum) | **Sí**     |
| **Carta laboral**           | Certificación de un estado **actual**    | No                                           | No         |
| **Certificado de ingresos** | Resumen de lo que ya está en los recibos | No                                           | No         |

El recibo documenta un hecho del pasado: lo que se pagó en marzo se pagó en marzo, y
el documento tiene que decir lo mismo dentro de tres años. Va con consecutivo y con
contenido congelado, igual que la orden de pago.

Una carta laboral dice «esta persona trabaja aquí, en este cargo, desde esta fecha».
Si la piden otra vez en junio, la respuesta correcta es la de junio, no una copia de
la de marzo. **Congelarla sería el error**, no la garantía.

> **Recomiendo** que la carta y el certificado se generen al vuelo y solo se registre
> **que se emitieron**, con quién la pidió y cuándo — eso sí interesa para el audit
> log y para responder «¿cuándo le dimos la última carta a esta persona?».

---

## 4. Esquema Prisma

```prisma
model Empleado {
  id        String @id @default(cuid())
  empresaId String

  nombre  String
  tipoDoc TipoDocumento

  /// Cifrado, como en Cliente y Destinatario: es un dato personal (Ley 1581).
  numeroDocCifrado String
  numeroDocHash    String
  numeroDocFinal   String

  cargo        String
  salarioBase  Decimal   @db.Decimal(18, 2)
  moneda       Moneda    @default(COP)
  fechaIngreso DateTime
  fechaRetiro  DateTime?

  tipoContrato TipoContrato @default(INDEFINIDO)
  // Para la carta laboral y el certificado, que los imprimen.
  email        String?
  telefono     String?

  activo Boolean @default(true)

  empresa    EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  recibos    ReciboNomina[]
  documentos DocumentoLaboral[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([empresaId, numeroDocHash])
  @@index([empresaId, activo])
}

/// Documento legal. No se edita: se anula y se reemite, igual que la orden de pago.
model ReciboNomina {
  id         String @id @default(cuid())
  empresaId  String
  empleadoId String

  consecutivo String
  numero      Int

  tipoPeriodo   TipoPeriodo
  periodoInicio DateTime
  periodoFin    DateTime

  /// Totalizados por la calculadora y persistidos, nunca derivados en cada lectura.
  totalDevengado Decimal @db.Decimal(18, 2)
  totalDeducido  Decimal @db.Decimal(18, 2)
  neto           Decimal @db.Decimal(18, 2)
  moneda         Moneda  @default(COP)

  estado EstadoDocumento @default(VIGENTE)

  /// Lo que decía el documento al emitirse: emisor, empleado, cargo, conceptos.
  contenido   Json
  hashArchivo String?

  emitidoEn    DateTime @default(now())
  emitidoPorId String

  motivoAnulacion String?
  anuladoEn       DateTime?
  anuladoPorId    String?
  reemplazaAId    String?   @unique

  conceptos ConceptoNomina[]

  // Sin `deletedAt`: es un documento con consecutivo (excepción de la regla 4).
  @@unique([empresaId, consecutivo])
  /// Un empleado no puede tener dos recibos vigentes del mismo período. El índice
  /// no lo puede expresar solo —los anulados sí se repiten—, así que se valida en
  /// el servicio y se deja este índice para encontrarlos rápido.
  @@index([empleadoId, periodoInicio])
}

/// Una línea del recibo. Texto libre a propósito (decisión 1).
model ConceptoNomina {
  id        String @id @default(cuid())
  empresaId String
  reciboId  String

  tipo     TipoConcepto // DEVENGADO | DEDUCCION
  concepto String
  valor    Decimal      @db.Decimal(18, 2)
  orden    Int

  @@index([reciboId, orden])
  @@index([empresaId, concepto]) // para «cuánto se pagó de X en el año»
}

/// Carta laboral o certificado de ingresos. Se genera al vuelo; aquí solo queda
/// constancia de que se emitió, para poder responder «¿cuándo fue la última?».
model DocumentoLaboral {
  id         String @id @default(cuid())
  empresaId  String
  empleadoId String

  tipo         TipoDocumentoLaboral // CARTA_LABORAL | CERTIFICADO_INGRESOS
  /// Solo para el certificado: de qué año son los ingresos que resume.
  anio         Int?
  emitidoEn    DateTime             @default(now())
  emitidoPorId String

  @@index([empleadoId, emitidoEn(sort: Desc)])
}
```

Cuatro enums nuevos: `TipoContrato`, `TipoPeriodo` (quincenal, mensual),
`TipoConcepto`, `TipoDocumentoLaboral`. `EstadoDocumento` se reusa si ya existe;
si no, se crea uno compartido con la orden de pago.

**Tres tablas nuevas con `empresaId`** ⇒ tres políticas RLS en la misma migración, y
`ReciboNomina` sin `DELETE` para el rol de la aplicación, igual que `OrdenPago`.

---

## 5. Rutas de la API

| Método      | Ruta                            | Qué hace                                 |
| ----------- | ------------------------------- | ---------------------------------------- |
| `GET/POST`  | `/empleados`                    | Listado con filtros; alta                |
| `GET/PATCH` | `/empleados/:id`                | Ficha; corrección                        |
| `DELETE`    | `/empleados/:id`                | Retira (no borra), igual que en Clientes |
| `GET`       | `/empleados/:id/recibos`        | Sus recibos                              |
| `POST`      | `/empleados/:id/recibos`        | Liquida el período **y emite el recibo** |
| `POST`      | `/recibos-nomina/previsualizar` | Totaliza sin guardar                     |
| `GET`       | `/recibos-nomina`               | Historial, filtrable por período         |
| `GET`       | `/recibos-nomina/:id/pdf`       | Descarga                                 |
| `POST`      | `/recibos-nomina/:id/anular`    | Con motivo y consecutivo escrito         |
| `POST`      | `/recibos-nomina/:id/reemitir`  | Una sola vez                             |
| `POST`      | `/empleados/:id/documentos`     | Emite carta laboral o certificado        |
| `GET`       | `/documentos-laborales/:id/pdf` | Descarga                                 |

---

## 6. Criterio de terminado

1. Liquidar un período emite el recibo con consecutivo, y veinte liquidaciones
   simultáneas no repiten número.
2. El neto que muestra el formulario **es el mismo** que persiste el servidor.
3. Cambiar el cargo del empleado **no altera** un recibo ya emitido.
4. No se puede emitir dos recibos vigentes del mismo empleado y período.
5. La carta laboral emitida hoy dice el cargo de hoy, no el de la vez pasada.
6. Los tres PDF llevan la identidad de la empresa administrada.
7. Anular sin escribir el consecutivo correcto no anula nada.
8. Las tres tablas aparecen con RLS habilitada, forzada y con política.
9. El documento de identidad del empleado no sale completo en ninguna respuesta.

---

## 7. Lo que esta etapa **no** incluye

- **Cálculo de seguridad social, prestaciones y retención.** Decisión 5 del brief,
  reconfirmada por la clienta. Entra cuando exista la segunda implementación de
  `CalculadoraNomina`.
- **Nómina electrónica ante la DIAN.** Sigue abierto en `ARQUITECTURA.md` §4 como
  `TODO [CONFIRMAR]`: motor propio contra proveedor externo. No se decide aquí.
- **Vacaciones, incapacidades y novedades.** El brief no las pide. Hoy caben como
  conceptos del recibo; si hacen falta con su propio flujo, es otra conversación.
- **Plantilla editable de la carta laboral.** El brief dice «desde plantilla»; la
  primera versión trae una plantilla fija en código. Hacerla editable por el usuario
  es un módulo de plantillas, y eso es alcance de la Etapa 10.
