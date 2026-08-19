# Etapa 2 — Operaciones · Esquema y API

> **Propuesta para revisión. No se ha escrito código.**
> Contexto: `docs/ARQUITECTURA.md` §4 · Seguridad vinculante: `docs/SEGURIDAD.md`

Es el módulo que resuelve el dolor principal del brief: hoy buscan una transacción
por hash abriendo archivos de Excel, y preparan las dispersiones a mano en hojas
de cálculo.

**Alcance:** registro de operaciones con hash, ganancia calculada, buscador por
hash conectado a ⌘K, dispersión con reglas configurables y conciliación de destinos.

---

## 1. Las tres decisiones que hay que tomar antes

Estas cambian el esquema, así que conviene resolverlas ahora y no a mitad de camino.

### 1.1 Qué es económicamente una operación

El brief (§5) define `valorCompra`, `valorVenta`, `monedaCompra`, `monedaVenta` y
un `tasaCambio`. Pero **no hay campo para la cantidad de cripto**, y sin ella no se
puede reconstruir la operación: saber que se compró por 40 millones y se vendió por
42 no dice cuántos USDT se movieron, que es justo lo que ata el registro al `hash`
de la cadena.

**Propuesta:** separar _el activo que se movió_ de _la plata que entró y salió_.

```
cantidad        1.000,000000000000000000   ← lo que se movió, 18 decimales
monedaActivo    USDT

valorCompra     40.000.000,00   monedaCompra  COP    tasaCompra  40.000,00
valorVenta      42.000.000,00   monedaVenta   COP    tasaVenta   42.000,00

gananciaCOP     2.000.000,00    ← calculada y persistida al guardar
```

Dos tasas y no una, porque **la tasa de compra y la de venta son distintas: en esa
diferencia está el negocio**. Con un solo `tasaCambio` no se puede calcular la
ganancia cuando compra y venta están en monedas diferentes.

Si compra y venta son ambas en COP, las tasas quedan en null y la ganancia es la
resta directa. El esquema soporta los dos casos.

> **Pregunta 1.** ¿Es así como lo piensan? Si en la práctica siempre compran y
> venden en pesos y la cantidad de cripto no la registran, el modelo se simplifica
> bastante y prefiero saberlo ahora.

### 1.2 El hash, ¿es único?

Es lo que se pega en el buscador, así que si dos operaciones comparten hash el
resultado es ambiguo justo en la función más usada del sistema.

**Propuesta:** `@@unique([empresaId, hash])`, con `hash` opcional —una operación se
puede registrar antes de tener el hash confirmado— y validado contra el formato de
la red correspondiente.

> **Pregunta 2.** ¿Puede una misma transacción de la cadena corresponder a varias
> operaciones? Pasa cuando una transferencia agrupa varios clientes. Si es así, el
> hash no puede ser único y el buscador devuelve una lista en vez de un registro.

### 1.3 ¿Una operación se puede editar?

El brief prohíbe editar y borrar **documentos legales** (facturas, órdenes de pago,
nómina). Una operación no está en esa lista.

**Propuesta:** editable mientras esté en `REGISTRADA`, con todo el historial en el
audit log; una vez `CONCILIADA` solo se anula, con motivo. Anular nunca borra.

> **Pregunta 3.** ¿Están de acuerdo, o prefieren que una operación sea inmutable
> desde que se guarda?

---

## 2. Esquema Prisma

### 2.1 Cliente — adelanto mínimo de la Etapa 4

`Operacion` cuelga de un cliente y Clientes es la Etapa 4. En vez de guardar un
nombre suelto que después habría que migrar, se crea ahora el modelo con lo
mínimo, y la Etapa 4 le agrega portafolio, contacto y calendario tributario.

```prisma
enum TipoCliente {
  PERSONA_NATURAL
  PERSONA_JURIDICA
}

model Cliente {
  id        String @id @default(cuid())
  empresaId String

  nombre  String
  tipo    TipoCliente
  tipoDoc TipoDocumento

  /// Cifrado con AES-256-GCM: es un dato personal (Ley 1581, docs/SEGURIDAD.md §5).
  numeroDocCifrado String
  /// HMAC determinista del documento. Es lo único indexable: permite buscar sin
  /// descifrar y sin exponer el número en claro en un índice.
  numeroDocHash    String
  /// Últimos cuatro dígitos, para mostrar «•••• 4821» sin descifrar en cada fila.
  numeroDocFinal   String

  /// Último dígito del NIT: define las fechas del calendario tributario (Etapa 6).
  ultimoDigitoNit Int?
  municipio       String?

  empresa     EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  operaciones Operacion[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([empresaId, numeroDocHash])
  @@index([empresaId, nombre])
}
```

### 2.2 Operación

```prisma
enum EstadoOperacion {
  BORRADOR // se está capturando; no cuenta para reportes
  REGISTRADA // completa y vigente
  CONCILIADA // su dispersión quedó ejecutada por completo
  ANULADA // sin efecto, se conserva con su motivo
}

enum RedBlockchain {
  BITCOIN
  ETHEREUM
  TRON
  BSC
  POLYGON
  SOLANA
  OTRA
}

model Operacion {
  id        String @id @default(cuid())
  empresaId String
  clienteId String

  /// Hash de la transacción en la cadena. Es el buscador central del sistema.
  hash String?
  red  RedBlockchain?

  // ── El activo que se movió ──────────────────────────────────────────────
  cantidad     Decimal @db.Decimal(36, 18)
  monedaActivo Moneda

  // ── La plata que entró y salió ──────────────────────────────────────────
  valorCompra  Decimal  @db.Decimal(18, 2)
  monedaCompra Moneda
  tasaCompra   Decimal? @db.Decimal(18, 6)

  valorVenta  Decimal  @db.Decimal(18, 2)
  monedaVenta Moneda
  tasaVenta   Decimal? @db.Decimal(18, 6)

  /// Calculada y persistida al guardar, nunca derivada en cada lectura (brief §5).
  /// Las tasas quedan congeladas: recalcular con la tasa de hoy cambiaría el
  /// resultado de una operación del año pasado.
  gananciaCOP Decimal @db.Decimal(18, 2)

  estado         EstadoOperacion @default(REGISTRADA)
  fechaOperacion DateTime
  observaciones  String?

  motivoAnulacion String?
  anuladaEn       DateTime?
  anuladaPorId    String?

  empresa    EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  cliente    Cliente             @relation(fields: [clienteId], references: [id])
  dispersion Dispersion?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  /// El buscador por hash es la función más usada: el índice es lo que hace que
  /// responda al instante en vez de recorrer la tabla.
  @@unique([empresaId, hash])
  @@index([empresaId, fechaOperacion(sort: Desc)])
  @@index([empresaId, estado])
  @@index([clienteId])
}
```

### 2.3 Dispersión

El brief: _«se ingresa el monto total y el sistema reparte entre destinos según
reglas configuradas (monto fijo o porcentaje). Debe validar que la suma cuadre con
el total antes de permitir guardar»_.

```prisma
enum TipoReparto {
  PORCENTAJE
  MONTO_FIJO
}

enum EstadoDispersion {
  PENDIENTE
  PARCIAL
  EJECUTADA
}

enum EstadoDestino {
  PENDIENTE
  EJECUTADO
  DEVUELTO
}

/// Catálogo de a quién se le dispersa. Existe para no volver a escribir la cuenta
/// bancaria en cada operación, que es donde se cometen los errores caros.
model Destinatario {
  id        String @id @default(cuid())
  empresaId String

  nombre  String
  tipoDoc TipoDocumento

  numeroDocCifrado String
  numeroDocHash    String
  numeroDocFinal   String

  banco         String?
  tipoCuenta    String?
  /// Cifrada: junto con el documento identifica a una persona (Ley 1581).
  cuentaCifrada String?
  cuentaFinal   String?

  activo Boolean @default(true)

  empresa  EmpresaAdministrada      @relation(fields: [empresaId], references: [id])
  reglas   ReglaDispersionDestino[]
  destinos DispersionDestino[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([empresaId, numeroDocHash])
  @@index([empresaId, activo])
}

/// Regla reutilizable: «esta operación se reparte 60/30/10 entre estos tres».
model ReglaDispersion {
  id        String @id @default(cuid())
  empresaId String

  nombre      String
  tipoReparto TipoReparto
  activa      Boolean     @default(true)

  empresa  EmpresaAdministrada      @relation(fields: [empresaId], references: [id])
  destinos ReglaDispersionDestino[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([empresaId, nombre])
}

model ReglaDispersionDestino {
  id             String @id @default(cuid())
  reglaId        String
  destinatarioId String

  /// Uno de los dos según el tipoReparto de la regla; el otro va nulo.
  porcentaje Decimal? @db.Decimal(7, 4)
  montoFijo  Decimal? @db.Decimal(18, 2)

  /// Orden de aplicación. También define quién absorbe el residuo del redondeo.
  orden Int

  regla        ReglaDispersion @relation(fields: [reglaId], references: [id])
  destinatario Destinatario    @relation(fields: [destinatarioId], references: [id])

  @@unique([reglaId, destinatarioId])
}

model Dispersion {
  id          String @id @default(cuid())
  empresaId   String
  operacionId String @unique

  montoTotal Decimal          @db.Decimal(18, 2)
  moneda     Moneda           @default(COP)
  estado     EstadoDispersion @default(PENDIENTE)

  /// Qué regla se usó. Null cuando el reparto se armó a mano.
  reglaId String?

  empresa   EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  operacion Operacion           @relation(fields: [operacionId], references: [id])
  destinos  DispersionDestino[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([empresaId, estado])
}

model DispersionDestino {
  id             String  @id @default(cuid())
  empresaId      String
  dispersionId   String
  destinatarioId String?

  /// Copia del nombre y la cuenta al momento de dispersar. Si mañana alguien
  /// corrige la cuenta en el catálogo, el histórico tiene que seguir diciendo a
  /// dónde se giró realmente.
  nombreSnapshot String
  cuentaSnapshot String?

  monto      Decimal  @db.Decimal(18, 2)
  porcentaje Decimal? @db.Decimal(7, 4)

  estado         EstadoDestino @default(PENDIENTE)
  ejecutadoEn    DateTime?
  referenciaPago String?
  observaciones  String?

  empresa      EmpresaAdministrada @relation(fields: [empresaId], references: [id])
  dispersion   Dispersion          @relation(fields: [dispersionId], references: [id])
  destinatario Destinatario?       @relation(fields: [destinatarioId], references: [id])

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([empresaId, estado])
  @@index([dispersionId])
}
```

**Cinco tablas nuevas con `empresaId`** → cinco bloques de RLS en la misma
migración, más `Cliente`. Es un ítem del checklist de `docs/SEGURIDAD.md` §7.

---

## 3. El reparto: la regla del residuo

Repartir 10.000.000 entre tres al 33,3333 % da 9.999.990. Faltan 10 pesos, y en un
sistema contable esa diferencia no puede quedar flotando.

**Propuesta:** se calcula cada destino redondeando hacia abajo a dos decimales, y
**el residuo completo se suma al destino de mayor `orden`**. Es determinista,
explicable a un contador y verificable: la suma de los destinos es siempre
exactamente igual al total.

La validación corre en tres lugares, como el dinero:

1. Esquema Zod compartido, para avisar en el formulario antes de enviar.
2. Servicio, con `Decimal`, antes de escribir.
3. Prueba automática con los casos feos: tres tercios, un centavo, montos fijos que
   no llegan al total, montos fijos que se pasan.

---

## 4. Rutas de la API

Todas exigen empresa activa y permiso del módulo `OPERACIONES`.

### 4.1 Operaciones

| Método    | Ruta                            | Permiso                                                 |
| --------- | ------------------------------- | ------------------------------------------------------- |
| `GET`     | `/operaciones`                  | ver — filtros: cliente, estado, rango de fechas, moneda |
| `POST`    | `/operaciones`                  | editar                                                  |
| `GET`     | `/operaciones/:id`              | ver                                                     |
| `PATCH`   | `/operaciones/:id`              | editar — solo en `BORRADOR` o `REGISTRADA`              |
| `POST`    | `/operaciones/:id/anular`       | editar — motivo obligatorio                             |
| **`GET`** | **`/operaciones/buscar?hash=`** | ver — **la función central**                            |
| `GET`     | `/operaciones/resumen`          | ver — totales del período para el tablero               |

`GET /operaciones/buscar` acepta el hash completo o un prefijo de al menos 8
caracteres, y responde con la operación, su cliente y el estado de su dispersión en
una sola llamada: quien pega un hash quiere ver todo, no navegar tres pantallas.
Es lo que la paleta de comandos (⌘K) llama al detectar algo con forma de hash.

### 4.2 Dispersión

| Método  | Ruta                                             | Permiso                                              |
| ------- | ------------------------------------------------ | ---------------------------------------------------- |
| `GET`   | `/dispersiones`                                  | ver — filtro por estado, para la vista de pendientes |
| `POST`  | `/operaciones/:id/dispersion`                    | editar — arma el reparto, con regla o a mano         |
| `GET`   | `/dispersiones/:id`                              | ver                                                  |
| `PATCH` | `/dispersiones/:id`                              | editar — solo mientras esté `PENDIENTE`              |
| `POST`  | `/dispersiones/:id/destinos/:destinoId/ejecutar` | editar — con referencia de pago                      |
| `POST`  | `/dispersiones/:id/destinos/:destinoId/revertir` | editar — con motivo                                  |
| `POST`  | `/dispersiones/:id/previsualizar`                | ver — calcula el reparto sin guardarlo               |

`previsualizar` existe para que el formulario muestre el reparto y el cuadre **antes
de guardar**, con el mismo cálculo del servidor. Que el navegador haga su propia
cuenta es justo como aparecen las diferencias de un peso.

### 4.3 Destinatarios y reglas

| Método                     | Ruta                     | Permiso      |
| -------------------------- | ------------------------ | ------------ |
| `GET` / `POST`             | `/destinatarios`         | ver / editar |
| `GET` / `PATCH` / `DELETE` | `/destinatarios/:id`     | ver / editar |
| `GET` / `POST`             | `/reglas-dispersion`     | ver / editar |
| `GET` / `PATCH` / `DELETE` | `/reglas-dispersion/:id` | ver / editar |

### 4.4 Clientes (mínimo)

| Método          | Ruta                          | Permiso                 |
| --------------- | ----------------------------- | ----------------------- |
| `GET` / `POST`  | `/clientes`                   | módulo `CLIENTES`       |
| `GET` / `PATCH` | `/clientes/:id`               | módulo `CLIENTES`       |
| `GET`           | `/clientes/buscar?documento=` | por HMAC, sin descifrar |

---

## 5. Pantallas

1. **Operaciones** — tabla densa con hash en monoespaciada, cliente, valores,
   ganancia y estado. Filtros por rango, estado y cliente. Detalle en panel lateral.
2. **Nueva operación** — formulario con el cálculo de ganancia en vivo y la
   validación del hash contra el formato de la red.
3. **Dispersión** — dentro del detalle de la operación: elegir regla o armar a mano,
   ver el cuadre en tiempo real y no dejar guardar si no cuadra.
4. **Conciliación** — vista de destinos pendientes de todas las operaciones, con
   acción en lote para marcar ejecutados.
5. **⌘K con hash** — pegar un hash lleva directo a la operación.

---

## 6. Criterio de terminado

- [ ] Registrar una operación calcula y persiste la ganancia, con las tasas congeladas
- [ ] Pegar un hash en ⌘K abre la operación al instante
- [ ] Una dispersión no se guarda si la suma de destinos no es **exactamente** el total
- [ ] El residuo del reparto por porcentaje cae en un destino definido, nunca se pierde
- [ ] Marcar todos los destinos como ejecutados pasa la dispersión a `EJECUTADA`
- [ ] Anular una operación conserva el registro con su motivo
- [ ] Las cinco tablas nuevas tienen su política de RLS y la prueba que lo verifica
- [ ] Pruebas de dinero y reparto: tres tercios, un centavo, montos que no cuadran
- [ ] Ningún `float` en ninguna capa
