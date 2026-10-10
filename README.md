# Seguidor de precios

App local para comparar el precio de un producto en varias tiendas.

## Requisitos
- Node 24+ (la versión mínima está declarada en `engines` del `package.json` raíz y fijada en `.nvmrc`; si usas nvm, `nvm use` la instala).
- Un proyecto de Supabase con el esquema de `supabase/migrations/0001_esquema_inicial.sql` aplicado (tablas `products`, `pages` y `price_checks` con RLS activo sin políticas, y la función `reset_sequences()`).

## Instalación
```
npm install
npx playwright install chromium
```

### Configuración (`.env`)
Crea en la raíz del repositorio un fichero `.env` (ya está en `.gitignore`):
```
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ…
SUPABASE_ADMIN_EMAIL=admin@example.com
SUPABASE_ADMIN_PASSWORD=mi-secreto
```
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API) son obligatorias: si falta alguna, el servidor no arranca (sale con código 1 indicando cuál falta). La service role key solo la usa el backend; nunca se importa desde `web/`.
- `SUPABASE_ADMIN_EMAIL` y `SUPABASE_ADMIN_PASSWORD` solo las usa `seed:admin` para crear el usuario administrador.

### Puesta en marcha con Supabase
```
npm run seed:admin -w server      # crea el admin en Supabase Auth (no lo duplica si ya existe)
npm run migrate:sqlite -w server  # solo una vez: copia data/prices.db a Supabase
```
- `seed:admin` crea el usuario con `SUPABASE_ADMIN_EMAIL`/`SUPABASE_ADMIN_PASSWORD`; se puede ejecutar varias veces.
- `migrate:sqlite` (con la app parada) abre `data/prices.db` en solo lectura, guarda una copia `data/prices.backup-<fecha>.db`, copia las tres tablas preservando ids y fechas (UTC → ISO), ajusta las secuencias con `reset_sequences()` y compara los conteos. Se niega a ejecutarse si las tablas de Supabase ya tienen filas. Acepta otra ruta: `npm run migrate:sqlite -w server -- <ruta.db>`.

## Verificación
```
npm run verify
```
Ejecuta en un solo paso los cuatro comandos de comprobación: typecheck de `server`, typecheck de `web`, lint y pruebas.

Comandos sueltos:
```
npm run lint      # ESLint (flat config en eslint.config.mjs), 0 avisos permitidos
npm run lint:fix  # lo mismo aplicando los arreglos automáticos
npm test          # pruebas del backend con Vitest (scraper y API)
npm run format    # formatea todo con Prettier (reescribe los ficheros existentes)
```

### Pruebas
```
npm test
```
- Solo hay pruebas en `server/` (`server/test/**`): unidades del scraper (`normalize`, `classify`, `extract` con fixtures HTML) y API con `app.inject()`.
- Nunca hablan con Supabase ni abren ninguna base: `api.test.ts` y `auth.test.ts` inyectan un repo en memoria (`test/fake-repo.ts`) y un auth falso (`test/fake-auth.ts`) en `buildApp({ repo, auth })`. Tampoco hacen red ni lanzan Chromium (los endpoints `/check` quedan fuera).
- No leen el `.env` real (`loadDotenv()` solo se llama desde `src/index.ts` y los scripts): `api.test.ts` inicia sesión contra el auth falso en el `beforeAll` y reenvía la cookie en cada `inject`, y `auth.test.ts` cubre login, logout, caducidad y refresco de la sesión.

### Integración continua
`.github/workflows/ci.yml` ejecuta `npm ci`, `npm run verify` y `npm run build` con la versión de Node de `.nvmrc`, con `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (ninguna prueba necesita Chromium). No necesita secretos de Supabase: las pruebas usan repo y auth falsos. Hoy no hay remoto configurado: basta con `git remote add` para que el workflow funcione en GitHub Actions.

## Uso
- Desarrollo: `npm run dev` y abrir http://localhost:5173 (la API corre en el puerto 3001).
- Producción local: `npm run build` y después `npm start`. Abrir http://localhost:3001
- Sin sesión, cualquier ruta redirige a `/login`; entra con el email y la contraseña del admin de Supabase y cierra sesión con el botón del encabezado.

Los datos se guardan en Postgres en Supabase (la app necesita conexión a internet). `data/prices.db` ya no se usa: queda solo como copia de respaldo de antes de la migración.

## Despliegue en Render (Docker)

La aplicación está preparada para desplegarse como un **Web Service** en el plan gratuito de Render utilizando Docker.

### Opción A: Despliegue automático con Render Blueprint (`render.yaml`)
1. Sube el código a tu repositorio de GitHub.
2. En el panel de Render, ve a **Blueprints** → **New Blueprint Instance**.
3. Conecta tu repositorio de GitHub. Render detectará automáticamente el archivo `render.yaml`.
4. Rellena las variables de entorno marcadas como requeridas:
   - `SUPABASE_URL`: URL del proyecto Supabase (`https://<proyecto>.supabase.co`).
   - `SUPABASE_SERVICE_ROLE_KEY`: Clave de rol de servicio (Service Role Key) de Supabase.
5. Haz clic en **Apply**. Render compilará la imagen Docker multi-stage y publicará la aplicación en un subdominio `https://<tu-app>.onrender.com`.

### Opción B: Despliegue manual
1. En Render, crea un nuevo **Web Service** y conecta tu repositorio.
2. Runtime / Environment: selecciona **Docker** (usará el `Dockerfile` de la raíz).
3. Plan: **Free**.
4. En **Environment Variables**, añade:
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
   - `SUPABASE_URL`: tu URL de Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: tu Service Role Key de Supabase.
5. Inicia el despliegue.

### Comportamiento del plan gratuito de Render
- **Suspensión por inactividad:** En el plan gratuito, el contenedor entra en suspensión tras 15 minutos sin recibir peticiones. Al recibir una nueva petición, tarda entre 30 y 50 segundos en reanudarse.
- **Sesiones tras despertar:** Las sesiones de usuario se gestionan en la memoria del servidor Fastify. Cuando el contenedor entra en reposo y se reactiva, la memoria se reinicia, solicitando de nuevo las credenciales de administrador en la pantalla `/login`.
- **Chromium y Scraping:** La imagen de producción incluye Chromium preinstalado y dependencias nativas de Linux optimizadas (`--no-sandbox`, `--disable-dev-shm-usage`) para operar de forma estable en el entorno del contenedor.

### Comandos Docker en local
Para probar el contenedor localmente antes de desplegar:
```
# Construir la imagen
docker build -t price-tracker .

# Arrancar el contenedor con las variables del .env
docker run -d --name price-tracker -p 3001:3001 --env-file .env price-tracker

# Ver logs
docker logs -f price-tracker

# Parar y eliminar
docker rm -f price-tracker
```
Accede desde el navegador a `http://localhost:3001`.

## Autenticación
- Pantalla única de acceso en `/login` (Email y Admin password; sin registro ni recuperación de contraseña).
- `POST /api/auth/login` recibe `{ email, password }`, lo valida contra Supabase Auth y devuelve la cookie `pt_session` (httpOnly, `SameSite=Lax`, 7 días de duración). Con credenciales incorrectas responde `401 { "error": "Usuario o contraseña incorrectos" }`.
- `POST /api/auth/logout` borra la cookie y revoca la sesión en Supabase; `GET /api/auth/session` informa de si hay sesión (`200 { authenticated }`).
- Los tokens de Supabase (access y refresh) viven solo en el servidor; el navegador solo recibe un token opaco en la cookie. Cuando al access token le quedan menos de 60 s, el servidor lo refresca solo; si el refresco falla (p. ej. el usuario se borró en Supabase), la sesión se cierra y la siguiente petición responde `401`.
- Todos los endpoints `/api` exigen esa cookie: sin ella responden `401 { "error": "No autenticado" }`. Las rutas de React (`/`, `/products/:id`) también están protegidas con un guard.
- Las sesiones viven solo en memoria: reiniciar el servidor obliga a volver a pasar por `/login`. Los ficheros estáticos (`index.html` y assets) siguen siendo públicos.

## Cómo se obtiene el precio
1. Se descarga la página con `fetch`. Si no se encuentra el precio, se abre con Chromium (Playwright).
2. Se busca el precio en este orden: selector CSS propio de la página, JSON-LD, microdata, meta tags, selectores conocidos (Amazon, eBay, AliExpress) y, por último, una heurística con regex.
3. Estados posibles: `ok`, `not_found` (conviene añadir un selector), `blocked` (la tienda bloquea el acceso) y `error`.

Para probar una URL desde la terminal:
```
npm run try -w server -- <url> [selector]
```
