# Etapa 4 — Clientes · Esquema y API

> **Construida (2026-08-22),** con las tres recomendaciones. El calendario tributario
> queda anotado para la Etapa 6.
> Contexto: `docs/ARQUITECTURA.md` §4 · Seguridad vinculante: `docs/SEGURIDAD.md`

El brief pide tres cosas de este módulo (§6, módulo 06):

1. Portafolio con cédula o NIT
2. Historial de operaciones por cliente
3. El calendario tributario del cliente, **consultando el módulo de Contabilidad**

Conviene decirlo de entrada: **de las tres, una ya está construida, otra es pequeña
y la tercera no se puede hacer todavía.**

---

## 1. Qué existe ya

La Etapa 2 adelantó `Cliente` en versión mínima, porque una operación cuelga de un
cliente y sin eso no se podía registrar ninguna. Lo que quedó funcionando:

| Ya está                                                        | Dónde                            |
| -------------------------------------------------------------- | -------------------------------- |
| Crear, listar, ver y desactivar clientes                       | `apps/api/src/modules/clientes/` |
| Documento cifrado con HMAC indexable y últimos cuatro en claro | `Cliente`                        |
| Búsqueda por documento **sin descifrar**, comparando el HMAC   | `GET /clientes?documento=`       |
| Tabla y formulario                                             | `/clientes`                      |

Lo que falta es menos de lo que parece:

| Falta                                                                                   | Tamaño        |
| --------------------------------------------------------------------------------------- | ------------- |
| Buscar por documento desde la interfaz (el API ya lo soporta, la pantalla no lo expone) | pequeño       |
| Editar un cliente (el API ya lo soporta, la pantalla no)                                | pequeño       |
| Historial de operaciones por cliente                                                    | mediano       |
| Calendario tributario                                                                   | **bloqueado** |

---

## 2. Las tres decisiones

### 2.1 Lo que le falta a `Cliente` para que la Etapa 6 no tenga que migrar

Esta es la decisión que importa, y no es sobre esta etapa sino sobre la siguiente.

El calendario tributario necesita **tres datos** para saber qué fechas le
corresponden a alguien (decisión 3 del brief): el último dígito del NIT, el tipo de
contribuyente y —solo para ICA— el municipio.

`Cliente` tiene el primero y el tercero. **No tiene `tipoContribuyente`.**

Sin ese campo, la Etapa 6 va a llegar al calendario tributario y descubrir que le
falta un dato en una tabla que para entonces ya tendrá datos reales. Agregarlo ahora
cuesta una migración de una columna; agregarlo después cuesta una migración y una
campaña de completar el dato a mano, cliente por cliente.

> **Recomiendo** agregar ahora, mientras la tabla está casi vacía:
>
> - `tipoContribuyente` — el enum que ya existe para `EmpresaAdministrada`
> - `direccion` y `codigoDaneMunicipio` — el ICA es municipal y el código DANE es lo
>   que lo identifica sin ambigüedad; «Medellín» escrito a mano no sirve para cruzar
>   con una tabla
> - `nombreContacto` — el brief escribe `contacto...` con puntos suspensivos en su
>   modelo (§5); una persona de contacto es lo mínimo que eso significa
>
> Todos opcionales, para no romper los clientes ya registrados.

### 2.2 El calendario tributario está bloqueado

El brief dice que el calendario del cliente **se muestra en Clientes pero se
consulta en Contabilidad, sin duplicar la lógica**. Es la decisión correcta. El
problema es de orden: Contabilidad es la Etapa 6, y ahí es donde vive la tabla
`CalendarioTributario` que un administrador carga una vez al año.

Hoy no hay nada que consultar. Tres salidas:

|       | Qué hacer                                                                 | En contra                                                              |
| ----- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A** | Dejar `GET /clientes/:id/calendario` fuera, y que la Etapa 6 lo agregue   | La etapa 4 queda incompleta frente al brief                            |
| **B** | Construir la tabla `CalendarioTributario` ahora, adelantada de la etapa 6 | Adelanta media etapa 6 sin su interfaz de carga; nadie podría llenarla |
| **C** | Dejar la ruta creada devolviendo una lista vacía con un aviso             | Una pantalla que siempre dice «no hay datos» sin explicar por qué      |

> **Recomiendo A**, y dejarlo escrito en el criterio de terminado de la Etapa 6 en
> vez de aquí. Adelantar la tabla sin su pantalla de carga (opción B) deja un cajón
> vacío que nadie puede llenar, y una ruta que siempre responde vacío (opción C)
> enseña a ignorar esa sección de la pantalla.
>
> Lo que sí queda ahora es el **espacio** en la pantalla del cliente, con una línea
> que diga en qué etapa llega — igual que hacen hoy los módulos pendientes.

### 2.3 Qué es el «portafolio»

El brief dice «portafolio con cédula o NIT» y no lo desarrolla. Lo leo como **el
libro de clientes**, buscable por documento: el portafolio _de_ clientes de la
empresa, no el portafolio _del_ cliente.

> **Propongo** construirlo con esa lectura, que es la que encaja con el resto del
> módulo y con lo que ya existe. Queda `TODO [CONFIRMAR]`.
>
> Si resulta que significa lo otro —qué activos o servicios tiene contratado cada
> cliente— eso es una entidad nueva y una conversación distinta, porque el brief no
> dice qué campos tendría.

---

## 3. Esquema Prisma — el delta

No hay tablas nuevas. Cinco columnas opcionales sobre `Cliente`:

```prisma
model Cliente {
  // … lo que ya existe …

  /// Con el último dígito del NIT y el municipio, es lo que determina las fechas
  /// del calendario tributario (etapa 6). Se pide ahora para no tener que
  /// completarlo cliente por cliente cuando esa etapa llegue.
  tipoContribuyente TipoContribuyente?

  direccion           String?
  /// El ICA es municipal. El código DANE identifica el municipio sin ambigüedad;
  /// «Medellín» escrito a mano no cruza con ninguna tabla.
  codigoDaneMunicipio String?
  nombreContacto      String?

  /// Activo o retirado del portafolio. Distinto de `deletedAt`: un cliente
  /// inactivo se sigue viendo en su historial de operaciones.
  activo Boolean @default(true)
}
```

`activo` va aparte de `deletedAt` a propósito. Hoy desactivar un cliente hace un
soft delete y desaparece de todas partes, incluido el historial de las operaciones
que ya tenía — que es justo lo que alguien quiere consultar cuando revisa un cliente
retirado.

---

## 4. Rutas de la API

| Método   | Ruta                        | Estado                                                         |
| -------- | --------------------------- | -------------------------------------------------------------- |
| `GET`    | `/clientes`                 | ya existe · se le agregan filtros por `tipo` y `activo`        |
| `POST`   | `/clientes`                 | ya existe                                                      |
| `GET`    | `/clientes/:id`             | ya existe                                                      |
| `PATCH`  | `/clientes/:id`             | ya existe · gana los campos nuevos                             |
| `DELETE` | `/clientes/:id`             | ya existe · pasa a desactivar, no a soft delete                |
| `GET`    | `/clientes/:id/operaciones` | **nueva** — historial paginado                                 |
| `GET`    | `/clientes/:id/resumen`     | **nueva** — cuántas operaciones, cuánta ganancia, desde cuándo |
| `GET`    | `/clientes/:id/calendario`  | **no se construye** (decisión 2.2)                             |

---

## 5. Pantallas

| Ruta                | Qué cambia                                                                       |
| ------------------- | -------------------------------------------------------------------------------- |
| `/clientes`         | Gana el buscador por documento y filtros por tipo y estado                       |
| `/clientes` → panel | Gana pestañas: **Datos · Operaciones**, y el espacio del calendario con su aviso |

El buscador por documento merece una nota: escribe una cédula completa y encuentra
al cliente **sin que el número se haya descifrado en ningún momento** — se compara
el HMAC. Vale la pena que la pantalla lo diga, porque es la clase de cosa que un
cliente pregunta en una auditoría.

---

## 6. Criterio de terminado

1. Buscar por cédula o NIT completo encuentra al cliente, y el número **no aparece
   completo en ninguna respuesta del API**.
2. El historial de operaciones de un cliente pagina en servidor y no trae las de
   otras empresas.
3. Desactivar un cliente lo saca del selector de operaciones nuevas, pero **su
   historial sigue consultable**.
4. Un cliente de otra empresa responde `404` aunque se fuerce el id en la URL.
5. Editar un cliente queda en el audit log con el valor anterior.

---

## 7. Una pregunta sobre el orden

Esta etapa es pequeña: cinco columnas, dos rutas y unas pantallas. La parte grande
—el calendario— depende de la Etapa 6.

Vale la pena preguntarse si conviene **hacerla ahora o fundirla con la Etapa 6**,
cuando el calendario exista y el módulo se pueda terminar de una sola vez en vez de
tocarlo dos veces.

A favor de hacerla ahora: las cinco columnas nuevas cuestan mucho menos con la tabla
casi vacía que dentro de tres etapas, y eso es cierto sin importar cuándo se haga el
resto. A favor de esperar: el módulo quedaría terminado de una pasada.

> **Recomiendo un punto medio:** hacer ahora las columnas y el historial —que es lo
> que se usa a diario y lo que se vuelve caro después— y dejar explícitamente
> anotado en la Etapa 6 que ahí se cierra el módulo con el calendario.
