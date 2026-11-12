# Paginator

Verificación de paginación e imposición de revistas en el navegador, con una réplica 3D del ejemplar para hojearlo antes de
enviarlo a imprenta. Los archivos se procesan en el equipo del usuario y nunca se suben a un servidor.

## Requisitos

- [Bun](https://bun.sh) 1.3 o superior

## Puesta en marcha

```bash
bun install
cp .env.example .env
bun run dev
```

La aplicación queda en `http://127.0.0.1:4321`. Sin variables de entorno funciona completa, salvo las cuentas.

| Comando | Descripción |
|---|---|
| `bun run dev` | Servidor de desarrollo |
| `bun run build` | Compila el sitio estático en `dist/` |
| `bun run preview` | Sirve `dist/` |
| `bun test` | Pruebas unitarias |
| `bun run check` | Comprobación de tipos |
| `bun run fixtures` | Regenera los archivos de prueba de `fixtures/` |

## Rutas

| Ruta | Contenido |
|---|---|
| `/` | Landing |
| `/app` | Aplicación (`/app?ejemplo=1` abre la revista de ejemplo) |
| `/revistas` | Revistas guardadas en la cuenta |
| `/auth/callback` | Retorno del inicio de sesión |
| `/privacidad`, `/condiciones` | Páginas legales |
| `/lab/*` | Bancos de prueba de cada módulo |

## Variables de entorno

| Variable | Uso |
|---|---|
| `PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | Clave pública (`anon` o `publishable`) |
| `PUBLIC_SITE_URL` | Dominio público, para la URL canónica y Open Graph |
| `PUBLIC_CONTACT_EMAIL` | Correo de contacto de las páginas legales |
| `PUBLIC_PAGINATOR_CLOUD` | `mock` activa un backend simulado en `localStorage` para desarrollo |

Todas se incrustan en el build. Ninguna debe contener secretos.

## Cuentas con Supabase

Inicio de sesión con Google y revistas guardadas. Se almacena la configuración, el orden de páginas, el nombre, tamaño y
huella SHA-256 de cada archivo y un resumen de la verificación; nunca los archivos.

1. Aplicar la migración de `supabase/migrations/` (editor SQL o `bunx supabase db push --remote`).
2. Crear un cliente OAuth de Google de tipo «Aplicación web» con la URI de redirección
   `https://<ref>.supabase.co/auth/v1/callback` y activarlo en **Authentication → Sign In / Providers → Google**.
3. En **Authentication → URL Configuration**, definir la *Site URL* y añadir `<origen>/auth/callback**` a *Redirect URLs*
   para cada origen (desarrollo y producción).
4. Rellenar `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`.

## Despliegue

`netlify.toml` contiene la configuración para Netlify. Las variables de entorno se definen en el panel del sitio y se leen
durante el build.

## Estructura

```
src/
├─ pages/          Rutas
├─ layouts/        Documento base
├─ styles/         Tokens de diseño y estilos base
├─ lib/
│  ├─ imposition/  Imposición, segmentación de pliegos, geometría de corte y validación
│  ├─ ingest/      Lectura de PDF e imágenes y rasterizado
│  ├─ viewer/      Motor 3D (Three.js)
│  ├─ store/       Estado de la aplicación (Zustand)
│  ├─ cloud/       Sesión y revistas guardadas (Supabase)
│  └─ demo/        Revista de ejemplo
└─ components/     Interfaz (React y Astro)
supabase/          Configuración y migraciones de la base de datos
fixtures/          Archivos de prueba
scripts/           Recursos de pdf.js y generación de fixtures
```

## Limitaciones

- No exporta el PDF impuesto para plancha.
- Los pliegos son de cuatro páginas (dos por cara).
- El color se muestra en sRGB; no hay gestión de color CMYK.
- La detección de folios usa la capa de texto del PDF; en imágenes, el número del nombre de archivo.
