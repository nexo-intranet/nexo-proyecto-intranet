# Brief de construcción — Intranet Nexo Administración Integral

Eres el desarrollador senior a cargo de este proyecto. Lee el brief completo antes de escribir código, y sigue el orden de construcción de la sección final.

---

## 1. Contexto

**Nexo Administración Integral** (Medellín, Colombia) presta servicios administrativos, contables y de cumplimiento normativo a empresas, con especialización en el sector cripto y fintech.

Hoy toda su operación vive en Excel y WhatsApp: registran operaciones a mano, preparan dispersiones en hojas de cálculo, generan cartas laborales manualmente y buscan transacciones por hash abriendo archivos.

**Objetivo:** una intranet web que reemplace ese flujo.

La aplicación tiene **dos superficies bien separadas**:

- **Intranet privada** — la mayor parte del sistema. Sin registro público; los usuarios los crea un administrador.
- **Formulario público de trámites** — una sola página accesible sin cuenta, donde terceros radican solicitudes de firma y notarización (módulo 08). Es la única parte expuesta a internet abierto y debe tratarse como tal.

---

## 2. Decisiones confirmadas por el cliente

Estas ya están resueltas. Constrúyelas así.

| #   | Tema                       | Decisión                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ¿De quién son los datos?   | **Ambos.** El sistema maneja la información de Nexo _y_ la de las empresas que Nexo administra. `EmpresaAdministrada` es entidad raíz y **toda** consulta se filtra por ella. Nexo es la primera fila de esa tabla.                                                                                                                                         |
| 2   | Facturación electrónica    | **Se integra con proveedor externo, no se construye.** El cliente ya trabaja con Siigo, Facturatech y Dataico. Arrancar con **Siigo** (documentación pública) detrás de la interfaz `InvoicingProvider`, con los otros dos como implementaciones futuras del mismo contrato.                                                                                |
| 3   | Calendario tributario      | Tabla cargable por año desde el panel admin. Obligaciones a cubrir: **renta, retenciones, industria y comercio (ICA), exógena.** ICA es municipal, no DIAN — la tabla necesita campo `municipio`.                                                                                                                                                           |
| 4   | Reportes UIAF              | El cliente quiere todos, en el formato oficial de cargue a SIREL. **El formato depende del sector del sujeto obligado y aún no está confirmado.** Construir el motor de reportes con exportación a Excel/PDF ahora, y dejar la generación del archivo SIREL detrás de la interfaz `UiafReportFormatter` con un `TODO [CONFIRMAR]`.                          |
| 5   | Nómina                     | **Versión documental confirmada.** Los devengados y deducciones se ingresan manualmente, el sistema totaliza y genera el PDF con consecutivo. **No** se calcula seguridad social, prestaciones ni retención. Aísla el cálculo detrás de `PayrollCalculator` para poder sustituirlo más adelante — el cliente quiere agregar fórmulas en una fase posterior. |
| 6   | Políticas y consentimiento | El cliente hoy usa un formulario aparte para que la persona acepte la política de tratamiento de datos antes de una consulta. Eso entra al **módulo de Cumplimiento** con versionado de políticas y registro de aceptación (ver módulo 05).                                                                                                                 |
| 7   | Trámites de firmas         | El cliente opera hoy con un Google Form para recibir solicitudes de firma digital, autenticación y notarización. Se reemplaza por el **módulo 08**, que incluye un formulario público. Ver la sección 6b.                                                                                                                                                   |

---

## 2b. Integración de facturación electrónica (Siigo)

Datos verificados de la API:

- Documentación: `developers.siigo.com/docs/siigoapi` y `siigoapi.docs.apiary.io`
- Base URL: `https://api.siigo.com/v1`
- Autenticación: `POST` de credenciales que devuelve un **token con vigencia de 24 horas**. Cachearlo y renovarlo antes de que expire, no pedir uno por request.
- Header **`Partner-Id` obligatorio** en cada request. Alfanumérico, 3–100 caracteres, sin espacios ni caracteres especiales, en camelCase. Usar el mismo para todas las empresas conectadas.
- Recursos disponibles: facturas de venta, notas crédito, recibos de caja, clientes (terceros), productos.
- Creación de facturas por lotes: requiere `notification_url` obligatoria — hay que exponer un webhook para recibir el estado de cada factura.
- Desde abril de 2025, por la Resolución 165 de 2023 y el anexo técnico 1.8, una factura es **de contado o a crédito, nunca ambas**. El modelo de datos debe reflejarlo.

Requisitos operativos, no técnicos: las credenciales las genera el cliente desde su cuenta de Siigo Nube (Configuración → Alianzas e integraciones → Credenciales de integración). El acceso de pruebas se solicita al soporte de Siigo.

**Reglas de la integración:**

- Interfaz `InvoicingProvider` con métodos `crearFactura`, `anularFactura`, `consultarEstado`, `sincronizarTercero`. Siigo es la primera implementación; Facturatech y Dataico entran después sin tocar el resto del sistema.
- Cada `EmpresaAdministrada` guarda su propio proveedor y credenciales cifradas. Distintas empresas pueden usar distintos proveedores.
- La intranet guarda el registro local de cada factura con el `id` externo devuelto por el proveedor. Si el proveedor no responde, la factura queda en estado `pendienteEnvio` y se reintenta con backoff — nunca se pierde ni se duplica.
- Cada llamada al proveedor queda en el audit log con request, respuesta y estado.

---

## 3. Stack

- **Backend:** NestJS + TypeScript, Prisma ORM
- **Base de datos:** PostgreSQL
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind
- **Componentes:** shadcn/ui
- **Tablas:** TanStack Table
- **Formularios:** React Hook Form + Zod (el mismo esquema Zod valida en cliente y servidor)
- **Estado servidor:** TanStack Query
- **Auth:** JWT con access + refresh token, cookies httpOnly. TOTP (2FA) obligatorio para todos los usuarios.
- **PDFs:** generación server-side
- **Deploy:** backend en Railway, frontend en Vercel

Monorepo con `apps/api`, `apps/web` y `packages/shared` para tipos y esquemas Zod compartidos.

---

## 4. Reglas técnicas no negociables

Estas aplican a todo el sistema. Si alguna se rompe en algún módulo, es un bug.

1. **Dinero jamás en `float`.** `Decimal` en Prisma (`@db.Decimal(18,2)`), `decimal.js` en TypeScript. Cripto: `@db.Decimal(36,18)`.
2. **Multi-moneda desde el inicio.** Toda transacción guarda `monto`, `moneda` (COP/USD/USDT) y, si aplica, `tasaCambio` y `montoCOP` congelados al momento de la operación. Nunca recalcular con la tasa de hoy.
3. **Los documentos legales no se borran ni se editan.** Facturas, órdenes de pago y recibos de nómina llevan consecutivo único e inmutable. Corregir = anular y emitir uno nuevo, dejando ambos en el historial.
4. **Soft delete en todo**, con `deletedAt`. Nada se elimina físicamente.
5. **Audit log append-only.** Cada mutación registra usuario, acción, entidad, `valorAnterior`, `valorNuevo`, IP y timestamp. La tabla no acepta UPDATE ni DELETE.
6. **RBAC a nivel de módulo**, verificado en el backend. Ocultar un botón en el frontend no es control de acceso.
7. **Aislamiento por empresa.** Toda entidad de negocio cuelga de `empresaId`. Ninguna consulta se escribe sin ese filtro — impleméntalo en el repositorio o con middleware de Prisma, no confiando en que cada endpoint se acuerde. Una fuga de datos entre empresas administradas es el peor error posible en este sistema.
8. **Datos personales (Ley 1581 / habeas data).** Cédulas y datos de empleados van cifrados en reposo. La exportación masiva de datos personales queda registrada en el audit log.
9. **Credenciales de terceros cifradas.** Las llaves de Siigo/Facturatech/Dataico de cada empresa se guardan cifradas, nunca en texto plano ni en el frontend.
10. **Todo en español.** UI, mensajes de error, nombres de campos visibles. El código y los identificadores en inglés.
11. **Zona horaria:** `America/Bogota`. Guardar en UTC, mostrar en hora local.
12. **La superficie pública es hostil por defecto.** El formulario de trámites vive en rutas separadas, no comparte sesión con la intranet y no expone ningún dato del sistema. Lleva rate limiting por IP, protección anti-bot, y validación estricta de tipo y tamaño de archivo. Nunca devuelve información sobre solicitudes existentes salvo por código de seguimiento.
13. **Archivos subidos.** Solo PDF, JPG y PNG. Límite por archivo y por solicitud. Se guardan en almacenamiento privado con URLs firmadas de vida corta — nunca públicas ni adivinables. Se sirven siempre a través del backend, que verifica permisos.
14. **Consentimiento verificable.** Toda aceptación de política guarda qué versión se aceptó, cuándo, desde qué IP y por quién. Las políticas se versionan: publicar una nueva versión no invalida ni modifica las aceptaciones anteriores.
15. **Tests** en la lógica de dinero, dispersión, consecutivos, permisos y aislamiento por empresa. El resto puede ir sin test.

---

## 5. Modelo de datos — entidades núcleo

Punto de partida, no exhaustivo:

```
EmpresaAdministrada  id, nombre, nit, digitoVerificacion, tipoContribuyente,
                     municipio, activa
ConfigFacturacion    id, empresaId, proveedor (siigo|facturatech|dataico),
                     credencialesCifradas, partnerId, activa
Usuario              id, nombre, email, passwordHash, totpSecret, activo
Rol                  id, nombre                       // Administrador | Equipo interno
PermisoModulo        usuarioId, modulo, puedeVer, puedeEditar

Cliente              id, empresaId, nombre, tipoDoc, numeroDoc,
                     ultimoDigitoNit, municipio, contacto...
Operacion            id, empresaId, clienteId, hash, valorCompra, valorVenta,
                     monedaCompra, monedaVenta, tasaCambio, ganancia (calculada),
                     estado, fechaOperacion
Dispersion           id, empresaId, operacionId, montoTotal, estado
DispersionDestino    id, dispersionId, destinatario, monto, porcentaje, estado

Egreso               id, empresaId, concepto, tipoIntangible, beneficiario,
                     monto, moneda, fecha
OrdenPago            id, empresaId, egresoId, consecutivo (único por empresa),
                     estado, pdfUrl, anuladaPor

Empleado             id, empresaId, nombre, tipoDoc, numeroDoc, cargo,
                     salarioBase, fechaIngreso
ReciboNomina         id, empresaId, empleadoId, periodo, devengados[],
                     deducciones[], neto, consecutivo, pdfUrl
DocumentoLaboral     id, empresaId, empleadoId, tipo (carta | certificadoIngresos),
                     periodo, pdfUrl

Factura              id, empresaId, clienteId, consecutivo, items[], subtotal,
                     iva, total, formaPago (contado|credito), estado,
                     proveedorExternoId, estadoEnvio, anuladaPor
Gasto                id, empresaId, categoria, monto, fecha, soporteUrl
CalendarioTributario id, anio, tipoObligacion (renta|retenciones|ica|exogena),
                     ultimoDigitoNit, tipoContribuyente, municipio, fechaLimite

RegistroCumplimiento id, empresaId, operacionId, tipoConsulta, resultado,
                     observaciones, realizadoPor
ReporteUiaf          id, empresaId, tipoReporte, periodo, estado,
                     archivoUrl, generadoPor

Politica             id, empresaId, tipo (tratamientoDatos|interna|otra),
                     nombre, activa
VersionPolitica      id, politicaId, version, contenido, vigenteDesde,
                     publicadaPor        // inmutable una vez publicada
AceptacionPolitica   id, versionPoliticaId, empresaId, nombreCompleto,
                     tipoDoc, numeroDoc, email, aceptadaEn, ip,
                     origen (consultaInterna|formularioPublico),
                     solicitudTramiteId?, registroCumplimientoId?

SolicitudTramite     id, empresaId, codigoSeguimiento (único),
                     tipoTramite (firmaDigital|autenticacion|notarizacion),
                     nombreCompleto, tipoDoc, numeroDoc, email, telefono,
                     observaciones, estado, asignadoA, radicadaEn
DocumentoTramite     id, solicitudId, nombreArchivo, tipoMime, tamano,
                     rutaAlmacenamiento, subidoEn
EventoTramite        id, solicitudId, estadoAnterior, estadoNuevo,
                     nota, usuarioId, createdAt   // append-only

AuditLog             id, usuarioId, empresaId, accion, entidad, entidadId,
                     valorAnterior, valorNuevo, ip, createdAt
```

`Operacion.ganancia` se calcula y persiste al guardar, no se deriva en cada lectura.

`municipio` en `CalendarioTributario` solo aplica a ICA; para renta, retenciones y exógena va nulo.

`VersionPolitica` es inmutable una vez publicada. Cambiar una política significa crear una versión nueva, nunca editar la anterior — de lo contrario las aceptaciones ya registradas quedarían apuntando a un texto que la persona nunca vio.

---

## 6. Módulos

Ocho módulos. Todos comparten la barra lateral, el sistema de permisos y el audit log.

### 01 · Operaciones

- Registro con hash de transacción, valor de compra, valor de venta, cliente y fecha
- Ganancia calculada automáticamente
- **Buscador por hash como función central** — pegar un hash y ver toda la operación al instante. Este es el dolor principal que hoy resuelven abriendo Excel.
- Dispersión: se ingresa el monto total y el sistema reparte entre destinos según reglas configuradas (monto fijo o porcentaje). Debe validar que la suma cuadre con el total antes de permitir guardar.
- Conciliación: marcar destinos como ejecutados y ver pendientes

### 02 · Egresos

- Registro de pagos por intangibles (licencias, servicios digitales, derechos)
- **Cada egreso genera automáticamente una orden de pago en PDF** con consecutivo único
- Historial de órdenes de pago, descargables
- Anulación con motivo — nunca borrado

### 03 · Empleados

- Ficha del empleado con los datos necesarios para generar documentos
- Recibo de nómina por período — devengados y deducciones ingresados, totalizados por el sistema (ver decisión 5)
- Carta laboral generada desde plantilla
- Certificado de ingresos y retenciones
- Los tres documentos salen en PDF con la identidad de la empresa administrada, no la de Nexo

### 04 · Contabilidad

- **Facturación electrónica vía proveedor externo** (sección 2b). El usuario crea la factura en la intranet, el sistema la envía al proveedor configurado para esa empresa y guarda el estado devuelto. La factura debe marcarse como de contado o a crédito, nunca ambas.
- Reintento automático de facturas en estado `pendienteEnvio`, y vista de las que fallaron con el motivo
- Conciliación entre facturado, pagado y registrado
- Gastos operativos con soporte adjunto
- Proyecciones tributarias a partir de la información registrada
- **Calendario tributario:** al consultar una cédula o NIT, muestra las fechas de presentación que le corresponden según el último dígito, el tipo de contribuyente y —para ICA— el municipio. Cubre renta, retenciones, ICA y exógena. Los datos salen de la tabla `CalendarioTributario`, que un administrador carga una vez al año.
- Alertas de vencimientos próximos según el calendario cargado
- Solicitud de documentos: flujo con estados (solicitado → recibido → vencido)

### 05 · Cumplimiento

- Consultas de verificación previas a aprobar una operación
- Registro de cumplimiento, separado del registro operativo
- **Políticas internas por empresa.** Nexo maneja sus propias políticas y también las de las empresas que administra. Cada política se crea, se versiona y se publica; las versiones anteriores quedan en el historial y nunca se editan.
- **Registro de aceptación de la política de tratamiento de datos.** Reemplaza el formulario suelto que usan hoy. Antes de dejar registrar una consulta, el sistema exige que exista una aceptación vigente de la persona consultada. Si no la hay, ofrece capturarla en el momento: se muestra el texto de la versión vigente, la persona diligencia sus datos y acepta, y queda guardado qué versión aceptó, cuándo y desde qué IP.
- Consulta de aceptaciones: buscar por documento y ver qué políticas aceptó, en qué versión y en qué fecha. Exportable como soporte.
- Motor de reportes UIAF con exportación a Excel y PDF
- Generación del archivo de cargue a SIREL detrás de la interfaz `UiafReportFormatter` — **el formato exacto depende del sector del sujeto obligado y aún no está confirmado.** Deja `TODO [CONFIRMAR]`.
- El envío a SIREL es manual: el sistema genera el archivo, una persona lo carga. No existe API pública de envío.
- Control de periodicidad: los reportes de ausencia son trimestrales y vencen dentro de los primeros 10 días del mes siguiente al trimestre. El sistema debe avisar antes de esa fecha.
- **No incluir validación de cédulas por Tusdatos ni ningún proveedor KYC externo.** Está fuera de alcance en esta etapa.

### 06 · Clientes

- Portafolio con cédula o NIT
- Historial de operaciones por cliente
- El calendario tributario del cliente se muestra aquí, pero consultando el módulo de Contabilidad — sin duplicar la lógica

### 07 · Administración General

- Gestión de usuarios y activación de 2FA
- Permisos por módulo, configurables por usuario
- Panel de métricas con indicadores por módulo
- Visor de audit log con filtros por usuario, fecha y entidad
- Carga del calendario tributario del año
- Gestión de políticas y sus versiones
- Exportación a Excel y PDF desde cualquier módulo

### 08 · Trámites de Firmas

Reemplaza el Google Form que usan hoy para recibir solicitudes de firma digital, autenticación y notarización.

**Importante sobre el alcance:** Nexo hace el trámite de la firma en una plataforma externa. Este módulo **no firma ni notariza nada** — es la bandeja de entrada y el seguimiento del trámite. No construyas motor de firma ni integres proveedor de firma electrónica.

Bandeja interna:

- Lista de solicitudes recibidas con filtros por estado, tipo de trámite y fecha
- Detalle de la solicitud con los datos del solicitante y sus documentos adjuntos
- Máquina de estados: `recibida → en revisión → documentos incompletos → en trámite → finalizada → entregada`, más `rechazada`. Cada cambio de estado queda en `EventoTramite` con nota y usuario.
- Asignación de la solicitud a un miembro del equipo
- Notificación por correo al solicitante en cada cambio de estado relevante
- Descarga de los documentos adjuntos, siempre a través del backend con URL firmada
- Un solicitante que no exista como cliente puede promoverse a `Cliente` desde aquí, sin volver a digitar los datos

---

## 6b. Formulario público de trámites

Página pública, sin cuenta, en ruta separada de la intranet (por ejemplo `/tramites/nuevo`). Es la única superficie del sistema expuesta a internet abierto.

**Qué pide:**

- Tipo de trámite: firma digital, autenticación o notarización
- Datos del solicitante: nombre completo, tipo y número de documento, correo, teléfono
- Descripción de lo que necesita
- Carga de los documentos (PDF, JPG, PNG)
- **Aceptación obligatoria de la política de tratamiento de datos**, mostrando el texto de la versión vigente. Sin aceptación no se envía. Queda registrada en `AceptacionPolitica` igual que en el módulo de Cumplimiento.

**Al enviar:**

- Se genera un `codigoSeguimiento` corto y no adivinable
- Se muestra ese código en pantalla y se envía por correo al solicitante
- Llega la notificación al equipo de Nexo
- La solicitud aparece en la bandeja del módulo 08 en estado `recibida`

**Consulta de estado:** página pública donde el solicitante ingresa su código y ve **solo** el estado de su trámite. Nada más: ni sus documentos, ni notas internas, ni datos de otras solicitudes.

**Seguridad, no opcional:**

- Rate limiting por IP en el envío del formulario
- Protección anti-bot
- Validación de tipo y tamaño de archivo en el servidor, no solo en el navegador
- Los archivos van a almacenamiento privado; jamás una URL pública
- Esta ruta no comparte sesión ni cookies con la intranet
- El código de seguimiento no revela información si se prueba al azar — respuesta genérica ante código inválido

---

## 7. Dirección de interfaz

Esto se usa ocho horas al día. La prioridad es velocidad de operación y densidad de información, no impacto visual.

**Dirección definida: interfaz blanca, limpia, estilo fintech.** Referencias de producto: Mercury, Ramp, Brex, Stripe Dashboard. Mucho blanco, bordes finos en vez de sombras, jerarquía construida con espaciado y peso tipográfico, no con cajas de colores.

La identidad negro y dorado de Nexo vive en la landing pública, el logo y los PDF generados. Dentro de la aplicación el dorado aparece **solo como acento**: elemento activo en la barra lateral, foco de campos, botón primario, fila seleccionada. Nada de fondos negros ni paneles oscuros. **No implementes modo oscuro.**

**Tokens**

```
--bg            #FFFFFF   fondo de la aplicación
--surface       #FFFFFF   tarjetas y paneles
--surface-alt   #FAFAF9   encabezados de tabla, filas alternas, barra lateral
--border        #E7E5E4   bordes y divisores — hairline, 1px
--text          #1C1917   texto principal
--text-muted    #78716C   etiquetas, texto secundario, encabezados de columna
--gold          #C4922A   acento de marca, activo, foco, botón primario
--gold-soft     #FDF6E7   fila seleccionada, fondo de estado activo
--success       #15803D
--warning       #B45309
--danger        #B91C1C
```

Radios contenidos (`4px` a `6px`). Sin sombras salvo en elementos flotantes reales (dropdown, panel lateral, modal), y ahí muy suaves.

**Tipografía**

- Interfaz: **Inter** (o system stack). Aquí la neutralidad es correcta: la fuente no debe competir con los datos.
- Cifras, hashes y montos: **JetBrains Mono** con `font-variant-numeric: tabular-nums`, para que las columnas de dinero se alineen.
- Cormorant Garamond queda reservado para los **documentos PDF generados** — ahí sí aporta, y es donde el cliente ve la marca.

**Layout**

```
┌──────────┬────────────────────────────────────────┐
│          │  [empresa ▾]      buscar ⌘K    [user] │
│  NEXO    ├────────────────────────────────────────┤
│          │  Operaciones                    [+ Nueva]│
│ Operac.  │  ┌──────────────────────────────────┐  │
│ Egresos  │  │ filtros · rango · estado         │  │
│ Emplead. │  ├──────────────────────────────────┤  │
│ Contab.  │  │ tabla densa, ordenable,          │  │
│ Cumplim. │  │ paginada en servidor             │  │
│ Clientes │  │                                  │  │
│ Trámites │  └──────────────────────────────────┘  │
│ Admin    │                                        │
│          │                                        │
└──────────┴────────────────────────────────────────┘
```

- Barra lateral fija, colapsable, con los módulos que el usuario tiene permitidos. Los que no tiene, no aparecen.
- Selector de empresa administrada en la barra superior (decisión #1).
- **Command palette (⌘K)** con búsqueda global. Pegar un hash ahí debe llevar directo a la operación. Es la función que más van a usar.
- Detalles en panel lateral deslizante, no en página nueva — así no se pierde el contexto de la tabla.
- Tablas: paginación y ordenamiento en servidor, columnas configurables, selección múltiple para acciones en lote, exportación de lo filtrado.
- Formularios largos en pasos, con guardado de borrador.

**Detalles que hacen que se sienta profesional**

- Estados vacíos que dicen qué hacer, con el botón de la acción — no ilustraciones decorativas
- Skeleton loaders, nunca spinners a pantalla completa
- Actualización optimista con reversión si el servidor falla
- Toast con opción de deshacer en acciones reversibles
- Confirmación escrita (escribir el consecutivo) para anular documentos legales
- Atajos de teclado en las acciones frecuentes, visibles en un modal de ayuda
- Foco visible en todo elemento interactivo, navegable con teclado
- Todo responsive hasta tablet; en móvil las tablas pasan a tarjetas

**Lo que no quiero**

- Fondos oscuros o paneles negros en cualquier parte de la aplicación
- Modo oscuro
- Dorado usado como fondo de secciones grandes — es acento, no relleno
- Tarjetas con sombras grandes y bordes muy redondeados por defecto de Tailwind
- Gráficas decorativas que no responden una pregunta concreta
- Animaciones de entrada en tablas y listas
- Iconos genéricos donde un texto claro comunica mejor

---

## 8. Orden de construcción

No construyas los ocho módulos en paralelo. Sigue este orden y entrega cada etapa funcionando antes de pasar a la siguiente.

**Etapa 1 — Cimientos**
Monorepo, Prisma con el esquema núcleo, **aislamiento por `empresaId` a nivel de repositorio**, selector de empresa en la barra superior, autenticación con 2FA, RBAC, audit log, layout con barra lateral, sistema de diseño con los tokens, tabla base reutilizable, generador de PDF base.
_Terminada cuando:_ un admin puede crear dos empresas y un usuario, ese usuario entra con 2FA, cambia entre empresas, ve solo sus módulos, **no puede ver datos de una empresa a la que no tiene acceso ni forzando el id en la URL**, y toda acción queda en el audit log.

**Etapa 2 — Operaciones**
Es el módulo que resuelve el dolor principal. Incluye el buscador por hash y la dispersión.

**Etapa 3 — Egresos**
Valida el patrón de "registro genera documento con consecutivo", que después se reusa en nómina y facturación.

**Etapa 4 — Clientes**

**Etapa 5 — Empleados**

**Etapa 6 — Contabilidad** (incluye calendario tributario)

**Etapa 7 — Cumplimiento** (incluye políticas versionadas y registro de aceptación)

**Etapa 8 — Trámites de Firmas: bandeja interna**
Máquina de estados, adjuntos y notificaciones, con solicitudes creadas a mano desde la intranet. Sin formulario público todavía.

**Etapa 9 — Formulario público de trámites**
Va de última a propósito: es la única superficie expuesta y conviene construirla cuando el manejo de archivos, políticas y estados ya esté probado por dentro. Incluye rate limiting, anti-bot, consulta por código de seguimiento y revisión de seguridad antes de publicar.

**Etapa 10 — Administración General completa** (métricas, visor de audit log, carga del calendario, gestión de políticas)

---

## 9. Criterios de terminado

Cada módulo se considera listo cuando:

- Los montos usan `Decimal` de punta a punta, sin `float` en ninguna capa
- Los permisos se validan en el backend, no solo en la UI
- Toda mutación queda en el audit log
- Los documentos legales tienen consecutivo único y se anulan, no se borran
- Existen los estados de carga, vacío y error, y dicen qué hacer
- Funciona con teclado y el foco es visible
- Los textos están en español, en tono directo y sin jerga técnica

---

## 10. Cómo trabajar

Antes de escribir código: propón el esquema Prisma del módulo y las rutas de la API, y espera confirmación. Los cambios de esquema a mitad de camino son el mayor costo de este proyecto.

Cuando encuentres una ambigüedad, no la resuelvas en silencio: implementa la opción más conservadora, déjala aislada y marca `TODO [CONFIRMAR]` con la pregunta concreta.
