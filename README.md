# Nuvio

Monorepo inicial para la plataforma SaaS multi-tenant de reservas de peluquerías en Uruguay.

## Tecnologías

- Node.js 22 LTS y pnpm 9.
- React 18, Vite y Tailwind CSS para `apps/client` y `apps/admin`.
- Azure Functions v4 con el modelo de programación Node.js v4 en `apps/api`.
- TypeScript estricto, Zod, Vitest, ESLint y Prettier.

Se eligió Node.js 22 LTS porque es una versión LTS compatible con Azure Functions v4 y Vite 6. El repositorio fija pnpm 9.15.4 mediante Corepack para instalaciones reproducibles.

## Requisitos en Windows (PowerShell)

1. Instalar Node.js 22 LTS.
2. Instalar Azure Functions Core Tools v4 para ejecutar la API:

   ```powershell
   winget install Microsoft.Azure.FunctionsCoreTools
   ```

   Si `winget` no está disponible, usar el método de instalación oficial de Azure Functions Core Tools v4.
3. Desde la raíz del repositorio, instalar pnpm y las dependencias:

   ```powershell
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   pnpm install
   ```

   `corepack enable` requiere permisos de administrador cuando Node.js está instalado en `C:\Program Files`. Alternativa sin elevación:

   ```powershell
   npm install -g pnpm@9.15.4
   pnpm install
   ```

## Desarrollo local

La API no usa secretos en esta historia. Si Azure Functions Core Tools solicita la configuración local, copiar el archivo de ejemplo:

```powershell
Copy-Item apps/api/local.settings.example.json apps/api/local.settings.json
```

Ejecutar cada servicio en una consola independiente:

```powershell
pnpm dev:client
pnpm dev:admin
pnpm dev:api
```

- Cliente: Vite muestra la URL local en la terminal (habitualmente `http://localhost:5173`).
- Administración: Vite asigna el siguiente puerto libre (habitualmente `http://localhost:5174`).
- API: `GET http://localhost:7071/api/health` responde:

  ```json
  {
    "status": "ok",
    "service": "nuvio-api"
  }
  ```

## Verificación

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Estructura

```text
apps/
  client/     PWA para clientes
  admin/      PWA de administración
  api/        API Azure Functions
packages/
  shared/     Esquemas Zod y tipos compartidos
  database/   Paquete reservado para la futura capa de datos
infra/        Reservado para infraestructura futura
docs/         Arquitectura e historias de usuario
```

## Seguridad y alcance

- `.env` y `apps/api/local.settings.json` están excluidos de Git.
- No hay secretos, credenciales Azure, conexión de base de datos ni recursos aprovisionados.
- La autenticación con Microsoft Entra External ID queda preparada como trabajo futuro; no se implementa en US-050.
- El workflow de Pull Request en `.github/workflows/ci.yml` instala usando el lockfile y ejecuta lint, tipos, pruebas y compilación.
