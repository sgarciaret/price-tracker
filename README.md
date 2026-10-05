# Seguidor de precios

App local para comparar el precio de un producto en varias tiendas.

## Requisitos
- Node 24+ (usa `node:sqlite`). La versión mínima está declarada en `engines` del `package.json` raíz y fijada en `.nvmrc` (si usas nvm, `nvm use` la instala).

## Instalación
```
npm install
npx playwright install chromium
```

### Configuración (`.env`)
Crea en la raíz del repositorio un fichero `.env` (ya está en `.gitignore`) con el único administrador:
```
ADMIN_USERNAME=sadmin
ADMIN_PASSWORD=mi-secreto
```
Si falta alguna de las dos variables el servidor arranca igual, pero todo intento de login responde `401` y el log del servidor avisa de la configuración ausente.

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
- Nunca abren `data/prices.db`: `server/vitest.config.ts` apunta `DB_PATH` a un fichero temporal. Tampoco hacen red ni lanzan Chromium (los endpoints `/check` quedan fuera).
- No usan el `.env` real: `server/vitest.config.ts` inyecta sus propias credenciales `ADMIN_USERNAME`/`ADMIN_PASSWORD`, `api.test.ts` inicia sesión en el `beforeAll` y reenvía la cookie en cada `inject`, y `auth.test.ts` cubre los endpoints de autenticación.

### Integración continua
`.github/workflows/ci.yml` ejecuta `npm ci`, `npm run verify` y `npm run build` con la versión de Node de `.nvmrc`, con `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (ninguna prueba necesita Chromium). Hoy no hay remoto configurado: basta con `git remote add` para que el workflow funcione en GitHub Actions.

## Uso
- Desarrollo: `npm run dev` y abrir http://localhost:5173 (la API corre en el puerto 3001).
- Producción local: `npm run build` y después `npm start`. Abrir http://localhost:3001
- Sin sesión, cualquier ruta redirige a `/login`; entra con las credenciales del `.env` y cierra sesión con el botón del encabezado.

Los datos se guardan en `data/prices.db`.

## Autenticación
- Pantalla única de acceso en `/login` (Admin Username y Admin password; sin registro ni recuperación de contraseña).
- `POST /api/auth/login` valida contra `ADMIN_USERNAME`/`ADMIN_PASSWORD` y devuelve la cookie `pt_session` (httpOnly, `SameSite=Lax`, 7 días de duración); `POST /api/auth/logout` la destruye y `GET /api/auth/session` informa de si hay sesión (`200 { authenticated }`).
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
