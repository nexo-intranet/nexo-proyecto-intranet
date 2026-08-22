# Etapa 6 — Contabilidad · Esquema y API

> **Propuesta. Pendiente de confirmar antes de escribir código.**
> Contexto: `docs/ARQUITECTURA.md` §4 · Seguridad vinculante: `docs/SEGURIDAD.md`

El brief pide siete cosas de este módulo (§6, módulo 04):

1. Facturación electrónica vía proveedor externo (Siigo)
2. Reintento de facturas en `pendienteEnvio` y vista de las fallidas
3. Conciliación entre facturado, pagado y registrado
4. Gastos operativos **con soporte adjunto**
5. Proyecciones tributarias
6. **Calendario tributario** por último dígito, tipo de contribuyente y municipio
7. Solicitud de documentos con estados

Es, con diferencia, la etapa más grande del proyecto: **siete entidades, diez rutas,
un webhook público y una integración con un tercero.** Las cinco anteriores juntas no
suman tanto.

---

## 1. La decisión que va primero: partirla en tres

Construir esto de un tirón significa semanas sin nada entregable, y con la parte más
frágil —un proveedor externo del que dependemos— en el medio.

> **Recomiendo partirla en tres entregas**, cada una funcionando por su cuenta:

### 6a · Gastos y calendario tributario

Sin dependencias externas. Trae `Gasto`, `CalendarioTributario`,
`SolicitudDocumento` y **el almacenamiento de archivos**, que hace falta para los
soportes y que vengo aplazando desde la Etapa 3.

Es la que más desbloquea: cierra el módulo de Clientes —el calendario que dejamos
pendiente en la Etapa 4— y llena el panel de obligaciones de la portada.

### 6b · Facturación electrónica

`Factura`, `FacturaItem`, `ConfigFacturacion`, `LogIntegracion`, la interfaz
`InvoicingProvider` con Siigo detrás, el reintento y el webhook.

**Depende de que el cliente consiga credenciales**, y eso no lo controlamos
nosotros. Ver §2.

### 6c · Conciliación y proyecciones

Cruzar lo facturado con lo pagado y lo registrado, y proyectar impuestos. Necesita
que 6a y 6b ya tengan datos: hacerla antes sería cruzar tablas vacías.

---

## 2. Lo que hay que pedir **hoy**, no cuando lleguemos

La 6b no arranca sin credenciales de Siigo, y conseguirlas no es instantáneo:

- Las genera el cliente desde su cuenta de Siigo Nube:
  **Configuración → Alianzas e integraciones → Credenciales de integración**
- El acceso de **pruebas** se solicita al soporte de Siigo, y ahí hay una espera que
  no depende de nosotros
- Hace falta también un `Partner-Id`: alfanumérico, 3–100 caracteres, camelCase, sin
  espacios. Es de Nexo como integrador, no de cada empresa

> **Esto es lo más urgente de todo el documento.** Si la solicitud se hace cuando
> terminemos la 6a, la 6b va a quedar esperando; si se hace ahora, para entonces ya
> estará lista.

---

## 3. Las decisiones de la 6a

### 3.1 El almacenamiento de archivos, por fin

Los soportes de gastos son el primer sitio donde hay que guardar un archivo que
sube un usuario. La arquitectura ya lo decidió (§3.6): **Cloudflare R2, bucket
privado, URLs firmadas de vida corta**, y las variables ya están en la
configuración.

Lo que falta decidir es cómo se sirve:

> **Recomiendo** que el backend **nunca** entregue la URL firmada al navegador, sino
> que sirva el archivo él mismo, igual que hace hoy con los PDF. Una URL firmada,
> aunque dure cinco minutos, es un enlace que se puede pegar en un chat y que
> funciona sin sesión. Sirviendo por el backend, cada descarga vuelve a verificar
> permiso y empresa, y queda en el audit log.
>
> La firma se usa solo para la **subida** directa a R2, donde sí compensa: un
> archivo de 10 MB no tiene por qué pasar por el servidor de la aplicación.

Y las reglas del brief §4.13, que no son negociables: solo PDF, JPG y PNG,
**verificados por los magic bytes y no por la extensión**, con límite de tamaño y
nombre generado por el servidor.

### 3.2 El calendario tributario: qué se guarda y qué se calcula

La tabla la carga un administrador una vez al año desde un Excel. Cada fila dice:
para el año X, la obligación Y, el último dígito Z, el tipo de contribuyente W y
—solo en ICA— el municipio M, la fecha límite es F.

> **Recomiendo** guardar **solo las fechas**, nunca «a quién le toca». Quién queda
> cubierto por una fila se resuelve al consultar, cruzando con los datos del cliente.
>
> Guardar la asignación sería duplicar: si mañana un cliente cambia de tipo de
> contribuyente, todas sus fechas cambian, y una tabla de asignaciones quedaría
> mintiendo hasta que alguien la regenere.
>
> El `codigoDaneMunicipio` que agregamos en la Etapa 4 es lo que hace posible el
> cruce del ICA sin ambigüedad.

**El cruce vive en Contabilidad y Clientes lo consulta**, como pide el brief. Un
solo lugar donde está escrita la regla.

### 3.3 La importación del Excel

Cargar un archivo que define fechas legales para todo un año merece más cuidado que
un `INSERT`:

> **Recomiendo** que la importación sea en dos pasos: subir → **previsualizar** qué
> se va a crear, modificar y descartar → confirmar. Y que reemplazar el calendario de
> un año no borre el anterior, sino que lo versione.
>
> Si alguien sube el archivo equivocado, el error se ve antes de aplicarlo, y si se
> aplica, se puede volver atrás.

---

## 4. Las decisiones de la 6b

### 4.1 Qué pasa cuando el proveedor no responde

Es la pregunta central de toda integración, y el brief ya la contesta a medias:
estado `pendienteEnvio`, reintento con backoff, **ni pérdida ni duplicado**.

Lo que falta es cómo se garantiza el «ni duplicado»:

> **Recomiendo** una **clave de idempotencia por factura**, generada al crearla y
> enviada en cada intento. Si un reintento sale después de que el proveedor ya
> registró la factura —porque la respuesta se perdió, no la petición—, el proveedor
> reconoce la clave y no crea una segunda.
>
> Sin eso, un timeout de red se convierte en dos facturas con dos consecutivos ante
> la DIAN, y eso no se arregla con un `DELETE`.

### 4.2 El webhook es superficie pública

`POST /webhooks/siigo` es la **segunda ruta sin sesión** de todo el sistema, después
del formulario de trámites de la Etapa 9. Vale la pena decirlo en voz alta.

> **Recomiendo** tratarla con las reglas del §12 del brief: firma verificada antes de
> leer el cuerpo, límite de tasa por IP, y **nunca** confiar en lo que trae para
> decidir sobre qué empresa se escribe — la empresa se resuelve por el `id` externo
> que nosotros guardamos, no por lo que diga el mensaje.

### 4.3 Contado o crédito, nunca ambas

La Resolución 165 de 2023 lo exige desde abril de 2025. Es un `enum`, no dos
booleanos: dos booleanos permiten representar «ambas» y «ninguna», que son estados
que no existen.

---

## 5. Esquema Prisma — la 6a

```prisma
model Gasto {
  id        String @id @default(cuid())
  empresaId String

  categoria  CategoriaGasto
  concepto   String
  proveedor  String?
  monto      Decimal        @db.Decimal(18, 2)
  moneda     Moneda         @default(COP)
  tasaCambio Decimal?       @db.Decimal(18, 6)
  montoCOP   Decimal        @db.Decimal(18, 2)
  fecha      DateTime
  deducible  Boolean        @default(true)

  /// Clave en R2. El archivo se sirve por el backend, nunca por enlace directo.
  soporteClave  String?
  soporteNombre String?
  soporteTipo   String?

  // … empresa, createdAt, updatedAt, deletedAt, índices
}

/// Las fechas del año. **No dice a quién le toca**: eso se resuelve al consultar.
model CalendarioTributario {
  id   String @id @default(cuid())
  anio Int

  tipoObligacion      TipoObligacion // RENTA | RETENCIONES | ICA | EXOGENA
  ultimoDigito        Int
  tipoContribuyente   TipoContribuyente?
  /// Solo para ICA, que es municipal. Nulo en las demás.
  codigoDaneMunicipio String?

  fechaLimite   DateTime
  /// Qué importación la creó. Permite volver atrás sin borrar la anterior.
  importacionId String

  @@index([anio, tipoObligacion, ultimoDigito])
}

model SolicitudDocumento {
  id        String @id @default(cuid())
  empresaId String
  clienteId String

  documento   String
  descripcion String?
  estado      EstadoSolicitud // SOLICITADO | RECIBIDO | VENCIDO
  fechaLimite DateTime

  archivoClave  String?
  archivoNombre String?
  recibidoEn    DateTime?

  // … empresa, cliente, createdAt, updatedAt, deletedAt
}
```

`CalendarioTributario` **no lleva `empresaId`**, y es la única tabla de negocio así:
las fechas de la DIAN son las mismas para todo el mundo. Por eso tampoco lleva RLS —
y por eso hay que decirlo aquí, porque la prueba de catálogo va a preguntarlo.

El esquema de la 6b va en su propio documento cuando lleguemos, para no cerrar hoy
decisiones sobre un API que todavía no hemos visto responder.

---

## 6. Criterio de terminado — 6a

1. Un gasto con soporte se sube, se descarga y **el archivo nunca es alcanzable sin
   sesión**.
2. Un archivo con extensión `.pdf` pero contenido de otra cosa se rechaza.
3. Consultar el calendario de un cliente devuelve sus fechas según su último dígito,
   su tipo de contribuyente y —para ICA— su municipio.
4. Cargar el Excel de un año muestra qué va a cambiar **antes** de aplicarlo.
5. La ficha del cliente muestra su calendario, consultando a Contabilidad y sin
   duplicar la regla.
6. Un gasto de otra empresa responde `404` aunque se fuerce el id.
7. Las tablas nuevas con `empresaId` aparecen con RLS; `CalendarioTributario`
   aparece **deliberadamente sin ella**, y la prueba lo dice.

---

## 7. Lo que esta etapa **no** incluye

- **Proyecciones tributarias**: van en la 6c, cuando haya datos que proyectar.
- **Conciliación bancaria automática**: el brief pide conciliar «facturado, pagado y
  registrado», no leer extractos del banco. Importar extractos es otra conversación.
- **Nómina electrónica ante la DIAN**: sigue abierta desde la Etapa 5.
