# Brief de construcción — Intranet Nexo Administración Integral

Eres el desarrollador senior a cargo de este proyecto. Lee el brief completo antes de escribir código, y sigue el orden de construcción de la sección final.

---

## 1. Contexto

**Nexo Administración Integral** (Medellín, Colombia) presta servicios administrativos, contables y de cumplimiento normativo a empresas, con especialización en el sector cripto y fintech.

Hoy toda su operación vive en Excel y WhatsApp: registran operaciones a mano, preparan dispersiones en hojas de cálculo, generan cartas laborales manualmente y buscan transacciones por hash abriendo archivos.

**Objetivo:** una intranet web de uso interno que reemplace ese flujo. No es un SaaS multiempresa ni tiene registro público — los usuarios los crea un administrador.

---

## 2. Decisiones confirmadas por el cliente

Estas ya están resueltas. Constrúyelas así.

| #   | Tema                     | Decisión                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ¿De quién son los datos? | **Ambos.** El sistema maneja la información de Nexo _y_ la de las empresas que Nexo administra. `EmpresaAdministrada` es entidad raíz y **toda** consulta se filtra por ella. Nexo es la primera fila de esa tabla.                                                                                                                |
| 2   | Facturación electrónica  | **Se integra con proveedor externo, no se construye.** El cliente ya trabaja con Siigo, Facturatech y Dataico. Arrancar con **Siigo** (documentación pública) detrás de la interfaz `InvoicingProvider`, con los otros dos como implementaciones futuras del mismo contrato.                                                       |
| 3   | Calendario tributario    | Tabla cargable por año desde el panel admin. Obligaciones a cubrir: **renta, retenciones, industria y comercio (ICA), exógena.** ICA es municipal, no DIAN — la tabla necesita campo `municipio`.                                                                                                                                  |
| 4   | Reportes UIAF            | El cliente quiere todos, en el formato oficial de cargue a SIREL. **El formato depende del sector del sujeto obligado y aún no está confirmado.** Construir el motor de reportes con exportación a Excel/PDF ahora, y dejar la generación del archivo SIREL detrás de la interfaz `UiafReportFormatter` con un `TODO [CONFIRMAR]`. |
| 5   | Nómina                   | **Abierta — ver abajo.**                                                                                                                                                                                                                                                                                                           |

### Decisión pendiente: nómina

El cliente pidió que el sistema calcule la nómina completa. Eso implica seguridad social, parafiscales, prestaciones, retención en la fuente por UVT, y transmisión de nómina electrónica a la DIAN — un producto en sí mismo, con exposición legal si un cálculo falla, y con parámetros que cambian cada año (SMMLV, UVT, auxilio de transporte).

**Implementa por ahora la versión documental:** los valores de devengados y deducciones se ingresan, el sistema los totaliza y genera el PDF con consecutivo. Aísla el cálculo detrás de `PayrollCalculator` para poder sustituirlo. Deja `TODO [CONFIRMAR]` con la pregunta de si se construye el motor de cálculo o se integra con un proveedor de nómina electrónica.

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
12. **Tests** en la lógica de dinero, dispersión, consecutivos y permisos. El resto puede ir sin test.

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
AuditLog             id, usuarioId, empresaId, accion, entidad, entidadId,
                     valorAnterior, valorNuevo, ip, createdAt
```

`Operacion.ganancia` se calcula y persiste al guardar, no se deriva en cada lectura.

`municipio` en `CalendarioTributario` solo aplica a ICA; para renta, retenciones y exógena va nulo.

---

## 6. Módulos

Siete módulos. Todos comparten la barra lateral, el sistema de permisos y el audit log.

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
- Recibo de nómina por período — devengados y deducciones ingresados, totalizados por el sistema (ver decisión pendiente de nómina)
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
- Exportación a Excel y PDF desde cualquier módulo

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
│ Admin    │  └──────────────────────────────────┘  │
│          │                                        │
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

No construyas los siete módulos en paralelo. Sigue este orden y entrega cada etapa funcionando antes de pasar a la siguiente.

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

**Etapa 7 — Cumplimiento**

**Etapa 8 — Administración General completa** (métricas, visor de audit log, carga del calendario)

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
