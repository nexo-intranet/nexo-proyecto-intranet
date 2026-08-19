# Intranet Nexo Administración Integral

Intranet interna para Nexo Administración Integral (Medellín, Colombia). Reemplaza la
operación en Excel y WhatsApp: operaciones cripto, dispersiones, egresos, nómina
documental, facturación electrónica, cumplimiento UIAF y calendario tributario.

Es un sistema **multiempresa**: maneja los datos de Nexo y los de cada empresa que
Nexo administra, con aislamiento estricto entre ellas.

## Documentación

| Documento                                    | Contenido                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [docs/BRIEF.md](docs/BRIEF.md)               | Brief del cliente. La fuente de verdad del alcance.                          |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Estructura del monorepo, convenciones y mapa de las 10 etapas.               |
| [docs/ETAPA-01.md](docs/ETAPA-01.md)         | Esquema Prisma, rutas de la API y criterio de terminado de la etapa actual.  |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md)       | **Vinculante.** RLS, secretos, superficie pública, sesión, datos personales. |

## Estructura

```
apps/api        NestJS + Prisma + PostgreSQL   → Railway
apps/web        Next.js + Tailwind + shadcn/ui → Vercel
packages/shared esquemas Zod, tipos y utilidades de dinero compartidas
```

## Requisitos

- **Node 20.11 o superior**
- **pnpm 9** — `corepack enable pnpm` (necesita terminal de administrador en Windows)
  o el instalador sin permisos: `iwr https://get.pnpm.io/install.ps1 -useb | iex`
- **PostgreSQL 16** — con Docker (`pnpm db:up`) o instalado localmente
- **gitleaks** — `winget install gitleaks`. Sin él, el hook de pre-commit no revisa
  secretos y solo advierte.

## Puesta en marcha

```powershell
pnpm install
cp .env.example .env          # y llenar los secretos
pnpm db:up                    # PostgreSQL local con el rol nexo_app ya creado
pnpm --filter @nexo/api exec prisma migrate dev
pnpm --filter @nexo/api exec prisma db seed
pnpm dev
```

Generar los secretos de `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Sin Docker

Con PostgreSQL instalado localmente, crear la base y el rol de aplicación a mano
antes de migrar:

```sql
CREATE DATABASE nexo;
CREATE ROLE nexo_app WITH LOGIN PASSWORD 'una_clave' NOBYPASSRLS NOSUPERUSER;
GRANT CONNECT ON DATABASE nexo TO nexo_app;
```

El rol `nexo_app` **no puede ser superusuario**: un superusuario ignora las políticas
de Row Level Security y el aislamiento entre empresas quedaría dependiendo solo del
código. Ver [docs/SEGURIDAD.md](docs/SEGURIDAD.md) §1.

## Comandos

| Comando                       | Qué hace                                               |
| ----------------------------- | ------------------------------------------------------ |
| `pnpm dev`                    | API y web en modo desarrollo                           |
| `pnpm build`                  | Compila todo el monorepo                               |
| `pnpm test`                   | Pruebas de dinero, dispersión, consecutivos y permisos |
| `pnpm typecheck`              | Verificación de tipos                                  |
| `pnpm db:up` / `pnpm db:down` | PostgreSQL local                                       |
| `pnpm db:reset`               | Borra el volumen y levanta la base desde cero          |

## Reglas que no se negocian

1. Dinero en `Decimal`, nunca `float`. En JSON viaja como string.
2. Toda entidad de negocio lleva `empresaId`, y toda consulta se filtra por él.
3. Los documentos legales no se editan ni se borran: se anulan y se reemiten.
4. El audit log es append-only, garantizado en la base de datos.
5. Los permisos se validan en el backend. Ocultar un botón no es control de acceso.
6. Ningún secreto en el repositorio, ninguna credencial en el navegador.
7. La interfaz es blanca, estilo fintech. El dorado es acento. No hay modo oscuro.
8. Todo el texto visible en español.
