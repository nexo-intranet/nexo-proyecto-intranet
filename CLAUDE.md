# Nexo Intranet — Contexto del proyecto

Este proyecto tiene un brief completo en `docs/BRIEF.md`.
Léelo por completo antes de trabajar en cualquier módulo o tarea.

Documentos derivados, ya aprobados por el cliente:

- `docs/ARQUITECTURA.md` — estructura del monorepo, convenciones y las 10 etapas
- `docs/ETAPA-01.md` — cimientos: esquema núcleo, auth, RBAC, audit log (terminada)
- `docs/ETAPA-02.md` — operaciones, clientes y dispersión (terminada)
- `docs/ETAPA-03.md` — egresos y órdenes de pago (terminada)
- `docs/ETAPA-04.md` — clientes (terminada, salvo el calendario tributario → etapa 6)
- `docs/ETAPA-05.md` — empleados y nómina documental (terminada)
- `docs/ETAPA-06.md` — contabilidad: propuesta partida en 6a/6b/6c, **pendiente de confirmar**
- `docs/SEGURIDAD.md` — **vinculante en todas las etapas**: RLS, manejo de secretos,
  superficie pública de la API, sesión y datos personales. Su §7 tiene el checklist
  obligatorio de cada PR.

## Resumen rápido

Intranet para Nexo Administración Integral (Medellín, Colombia).
Multiempresa: maneja datos de Nexo y de las empresas que administra.
Ocho módulos: Operaciones, Egresos, Empleados, Contabilidad,
Cumplimiento, Clientes, Administración General y Trámites de Firmas.

**Dos superficies separadas.** Casi todo es intranet privada sin registro público.
La excepción es el formulario público de trámites (etapa 9), única parte expuesta a
internet abierto: rutas aparte bajo `/publico`, sin compartir sesión ni cookies con
la intranet. Ver `docs/SEGURIDAD.md` §9.

## Stack

NestJS + Prisma + PostgreSQL (backend) · Next.js + Tailwind + shadcn/ui (frontend)
Monorepo: apps/api, apps/web, packages/shared

## Reglas no negociables (ver sección 4 del brief para el detalle completo)

- Dinero siempre en Decimal, nunca float — y en JSON viaja como string
- Toda entidad de negocio lleva empresaId — sin excepción, sin fugas entre empresas.
  Tres capas: guard HTTP, extensión de Prisma y Row Level Security en PostgreSQL.
  Toda tabla nueva con empresaId necesita su política RLS en la misma migración.
- Ningún secreto en el repositorio ni en el navegador. Solo NEXT_PUBLIC_APP_URL es
  pública; el frontend nunca llama a un proveedor externo
- Documentos legales (facturas, órdenes de pago, nómina) nunca se editan ni se borran — se anulan y se reemiten
- Todo cambio queda en el audit log, que es append-only
- RBAC se valida en el backend, no solo se oculta en el frontend
- Dos familias de color: **azul** para lo accionable, **dorado** para la marca (sutil,
  nunca sobre algo que se pulse). Modo oscuro con tres estados: claro, oscuro y
  seguir al sistema
- Todo el texto de la UI en español
- Archivos subidos: solo PDF/JPG/PNG verificados por magic bytes, bucket privado,
  servidos siempre por el backend con URL firmada — nunca por enlace directo
- Las políticas se versionan y `VersionPolitica` es inmutable una vez publicada:
  editarla dejaría las aceptaciones firmadas apuntando a un texto que nadie vio

## Antes de escribir código en cualquier módulo nuevo

Propón el esquema Prisma y las rutas de la API. Espera confirmación
antes de implementar. Los cambios de esquema a mitad de camino son
el mayor costo de este proyecto.
