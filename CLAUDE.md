# Nexo Intranet — Contexto del proyecto

Este proyecto tiene un brief completo en `docs/BRIEF.md`.
Léelo por completo antes de trabajar en cualquier módulo o tarea.

Documentos derivados, ya aprobados por el cliente:

- `docs/ARQUITECTURA.md` — estructura del monorepo, convenciones y las 8 etapas
- `docs/ETAPA-01.md` — esquema Prisma y rutas de la etapa en curso
- `docs/SEGURIDAD.md` — **vinculante en todas las etapas**: RLS, manejo de secretos,
  superficie pública de la API, sesión y datos personales. Su §7 tiene el checklist
  obligatorio de cada PR.

## Resumen rápido

Intranet interna para Nexo Administración Integral (Medellín, Colombia).
Multiempresa: maneja datos de Nexo y de las empresas que administra.
Siete módulos: Operaciones, Egresos, Empleados, Contabilidad,
Cumplimiento, Clientes, Administración General.

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
- Interfaz blanca estilo fintech — dorado solo como acento, sin modo oscuro
- Todo el texto de la UI en español

## Antes de escribir código en cualquier módulo nuevo

Propón el esquema Prisma y las rutas de la API. Espera confirmación
antes de implementar. Los cambios de esquema a mitad de camino son
el mayor costo de este proyecto.
