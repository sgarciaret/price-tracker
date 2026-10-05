# Price Tracker — Resumen de la aplicación

**Seguidor de precios**: aplicación local (en español) para comparar el precio de un mismo producto en varias tiendas online. Cada producto puede tener varias "páginas" (URLs de tiendas); la app consulta los precios, los guarda y muestra cuál es la mejor oferta.

---

## 1. Tecnologías

### Stack general
| Área | Tecnología | Versión |
|------|------------|---------|
| Lenguaje | TypeScript (en frontend y backend) | 5.7 |
| Gestor de paquetes | npm Workspaces (`server` + `web`) | — |
| Ejecución en dev | `concurrently` (levanta API y web a la vez) | 9.x |
| Ejecución de TS en Node | `tsx` (sin paso de compilación) | 4.x |

### Backend (`server/`)
| Tecnología | Uso |
|------------|-----|
| **Fastify 5** | Framework HTTP, con logger (pino) incluido |
| `@fastify/cors` | CORS restringido a `localhost`/`127.0.0.1` |
| `@fastify/static` | Sirve el frontend compilado (`web/dist`) en producción local |
| **`node:sqlite`** (`DatabaseSync`) | Base de datos SQLite embebida (requiere **Node 24+**), modo WAL |
| **Cheerio** | Parseo/consulta del HTML (jQuery-like) con XPath/CSS |
| **Playwright** (Chromium headless) | Fallback cuando la página necesita JavaScript o bloquea el `fetch` simple |
| **Zod** | Validación de bodies y params de la API (devuelve errores 400 legibles) |
| **p-limit** | Limita la concurrencia de scraping a **3 peticiones simultáneas** |
| `server/src/env.ts` / `auth.ts` | `.env` nativo (`process.loadEnvFile`, sin `dotenv`) y autenticación: credenciales `ADMIN_*`, sesiones en memoria y cookie httpOnly `pt_session` |

### Frontend (`web/`)
| Tecnología | Uso |
|------------|-----|
| **React 19** | UI en TypeScript (`strict: true`) |
| **React Router 7** | Rutas: `/` (lista) y `/products/:id` (detalle) |
| **Vite 6** | Dev server (puerto 5173) y build de producción |
| **Tailwind CSS 4** | Estilos vía plugin `@tailwindcss/vite` e `@import "tailwindcss"` |
| `fetch` nativo | Cliente de API (`web/src/api.ts`), sin librerías de datos |

---

## 2. Estructura del proyecto

```
price-tracker/
├── package.json          # workspaces: server, web; scripts dev/build/start
├── data/prices.db        # SQLite (se crea automáticamente)
├── server/src/
│   ├── index.ts          # arranque Fastify, carga del .env, CORS, estáticos, shutdown
│   ├── env.ts            # lectura de <raíz>/.env con process.loadEnvFile()
│   ├── auth.ts           # credenciales ADMIN_*, sesiones en memoria, parseo de cookies
│   ├── routes.ts         # API REST completa + hook de autenticación y /api/auth/*
│   ├── db.ts             # esquema SQLite + tipos
│   └── scraper/
│       ├── index.ts      # orquestación: fetch → fallback Playwright
│       ├── fetcher.ts    # descarga de la página (fetch / Chromium)
│       ├── extract.ts    # cascada de estrategias de extracción
│       ├── normalize.ts  # parseo de precios y monedas
│       ├── classify.ts   # detección de bloqueos/captcha
│       └── try.ts        # CLI para probar una URL
└── web/src/
    ├── main.tsx          # router + layout + guards de sesión
    ├── api.ts            # cliente HTTP + formateadores
    ├── auth.tsx          # AuthProvider, useAuth y guards RequireAuth/RequireGuest
    └── pages/
        ├── Login.tsx     # pantalla de acceso del administrador
        ├── ProductList.tsx
        └── ProductDetail.tsx
```

---

## 3. Cómo funciona

### 3.1 Modelo de datos (SQLite, `server/src/db.ts`)

Tres tablas con claves foráneas en cascada:

- **`products`**: `id`, `name`, `image_url`, `created_at`.
- **`pages`**: `id`, `product_id` → products, `url`, `store` (hostname sin `www.`), `css_selector` opcional, `created_at`.
- **`price_checks`**: `id`, `page_id` → pages, `price`, `currency`, `status` (`ok | not_found | blocked | error`), `error_msg`, `method`, `checked_at`.

Cada comprobación se **acumula** como fila histórica; las consultas solo leen el último check de cada página (`ORDER BY checked_at DESC, id DESC LIMIT 1`).

### 3.2 API REST (`server/src/routes.ts`)

Todas bajo `/api`, validadas con Zod. Requieren la cookie de sesión salvo las tres rutas de `/api/auth/*`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Valida `ADMIN_USERNAME`/`ADMIN_PASSWORD` y crea la sesión (`200` + cookie httpOnly, o `401`) |
| POST | `/api/auth/logout` | Destruye la sesión y caduca la cookie (`204`) |
| GET | `/api/auth/session` | Informa de `{ authenticated }` sin exigir cookie |
| GET | `/api/products` | Lista productos + nº de páginas + **mejor precio** (mínimo de los checks `ok`) |
| POST | `/api/products` | Crea producto |
| GET/PUT/DELETE | `/api/products/:id` | Detalle (con páginas y su último check), editar, borrar |
| POST | `/api/products/:id/pages` | Añade URL de tienda (calcula `store` del hostname) |
| PUT/DELETE | `/api/pages/:id` | Modifica el `css_selector` / borra la página |
| POST | `/api/pages/:id/check` | Consulta **una** página |
| POST | `/api/products/:id/check` | Consulta **todas** las páginas del producto en paralelo |

Detalle de `runCheck()`: limita la llamada con `p-limit(3)`, guarda el resultado en `price_checks` y, si el scraper ha devuelto imagen, **autocompleta** `image_url` del producto si estaba vacía.

### 3.3 Pipeline de obtención del precio

Es el corazón de la app (`server/src/scraper/`):

**1. Descarga (`fetcher.ts`)**
- Intento 1: `fetch` HTTP con User-Agent de Chrome, timeout de 20 s y seguimiento de redirecciones.
- Intento 2 (solo si el primero no dio precio): **Playwright/Chromium headless**, reutilizando una única instancia del navegador, bloqueando imágenes/media/fuentes, esperando `networkidle` (6 s) para que el JS pinte el precio.
- El `fetch` solo se salta si el dominio no resuelve (no tiene sentido reintentar).

**2. Evaluación (`index.ts`)**
- HTTP 401/403/429/503 → `blocked`; 404/410 → `error`; ≥400 → `error`.
- Si no hay precio y el HTML parece captcha/anti-bot (`classify.ts`: Cloudflare, DataDome, PerimeterX, "are you a robot"...) → `blocked`.
- Si todo falla → `not_found` (se sugiere añadir un selector CSS).
- Se devuelve el resultado más informativo de los dos intentos y el método usado (`fetch/...` o `browser/...`).

**3. Extracción (`extract.ts`)** — cascada de estrategias, en orden de prioridad:

1. **Selector CSS propio** de la página (si el usuario lo configuró).
2. **JSON-LD**: busca nodos `Product`/`ProductGroup` y sus `offers` (`price`, `lowPrice`, `priceSpecification`).
3. **Microdata**: `[itemprop="price"]` + `priceCurrency`.
4. **Meta tags**: `product:price:amount` / `og:price:amount`.
5. **Selectores conocidos** por hostname: Amazon (varias variantes), eBay, AliExpress.
6. **Heurística con regex**: primero en nodos con `price`/`precio` en clase/id, luego en `main` y `body`; excluye `<del>`, `<s>`, clases "old"/"tachado" (precios rebajados) y scripts/estilos, y une nodos de texto para no concatenar números vecinos.

Devuelve también `title` e `image` (con `og:title`/`og:image` como respaldo) que se usan para autocompletar el producto.

**4. Normalización (`normalize.ts`)**
- `parsePrice()` entiende formatos europeos e internacionales: `1.299,99 €`, `1,299.99`, `1299`, `19,90`… (el último separador encontrado manda; se descartan falsos positivos), redondea a 2 decimales y exige `> 0`.
- `detectCurrency()` a partir de códigos (`EUR|USD|GBP|JPY|CHF|MXN`) o símbolos (`€ $ £ ¥`).

**5. Estados resultantes** (persistidos y mostrados con color en la UI):
`ok` · `not_found` (conviene añadir selector) · `blocked` (la tienda protege el acceso) · `error`.

### 3.4 Frontend

- **`/login` — `Login`**: pantalla única con Admin Username y Admin password (sin registro ni recuperación); usa `Card`, `Input`, `Button` y `Alert`. `AuthProvider` comprueba la sesión al cargar y los guards `RequireAuth`/`RequireGuest` protegen el resto de rutas.
- **`/` — `ProductList`**: formulario para crear productos y tarjetas con imagen, nº de páginas y el **mejor precio** con su tienda.
- **`/products/:id` — `ProductDetail`**: tabla con tienda, precio, **diferencia vs. el mínimo** (€ y %), badge "Mejor", estado de la última comprobación, fecha, y acciones por fila: *Comprobar*, *Selector* (prompt para editar el CSS), *Quitar*. Arriba: *Comprobar todas*, *Renombrar*, *Eliminar*, y formulario para añadir URL + selector opcional (al añadir, lanza automáticamente la comprobación de esa página).
- Estado con `useState`/`useEffect` puro (sin librerías de estado); el estado de "comprobando" se gestiona con un `Set` de ids.

### 3.5 Modos de ejecución

| Modo | Comandos | Qué pasa |
|------|----------|----------|
| Desarrollo | `npm run dev` | `concurrently` levanta Fastify en `:3001` (tsx watch) y Vite en `:5173`; Vite **proxyea `/api`** a `127.0.0.1:3001` |
| Producción local | `npm run build` → `npm start` | Vite compila `web/dist` (con `tsc --noEmit` antes) y Fastify lo sirve como estático; fallback a `index.html` para rutas del router (las rutas `/api/*` devuelven 404 JSON) |
| Probar URL | `npm run try -w server -- <url> [selector]` | Ejecuta el pipeline y muestra JSON con precio, método y ms |

Requisitos: **Node 24+** (por `node:sqlite`) y Chromium de Playwright (`npx playwright install chromium`).

---

## 4. Aspectos destacados del diseño

- **Sin ORM ni migraciones**: el esquema se crea con `CREATE TABLE IF NOT EXISTS` al arrancar; SQL preparado a mano (rápido y suficiente para uso local).
- **Dos vías de scraping** con selección del mejor resultado, en lugar de un solo método frágil.
- **Cascada de extracción** ordenada de más fiable (datos estructurados) a menos (regex), con selectores "hardcodeados" solo para tiendas populares.
- **Historial de precios** completo: cada check es una fila, por lo que se podría graficar la evolución sin cambiar el esquema.
- **Concurrencia acotada** (`p-limit(3)`) para no saturar las tiendas ni disparar bloqueos.
- **Cierre limpio**: `SIGINT`/`SIGTERM` cierran Fastify y el navegador de Playwright.
- **Ligado a un entorno local**: escucha solo en `127.0.0.1` y CORS restringido a localhost. Desde SPEC 05 la API y las rutas de React requieren sesión de administrador (cookie httpOnly, credenciales en `.env`), pensada para uso local sin exponerse en red.
