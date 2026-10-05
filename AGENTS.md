# AGENTS.md

## Overview
Local price comparison web app using an npm workspaces monorepo: Fastify API backend (`server/`) and React + Vite frontend (`web/`).

## Prerequisites & Setup
- **Node 24+ required**: Backend uses Node's native `node:sqlite` (`DatabaseSync`). Declared in `engines` (root `package.json`) and `.nvmrc`.
- **Playwright Chromium**: Run `npx playwright install chromium` for browser-based scraping fallback.
- Install dependencies: `npm install`
- **`.env` at the repo root** (git-ignored) with the single admin account: `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Without them the server still boots, but every login answers `401` and the server log warns about the missing configuration.

## Essential Commands

### Development
- `npm run dev`: Runs Fastify API (`:3001`) and Vite dev server (`:5173`) concurrently.
  - Vite dev server proxies `/api` calls to `http://127.0.0.1:3001`.
- `npm run dev -w server`: Runs backend only with `tsx watch`.
- `npm run dev -w web`: Runs frontend only with Vite.

### Verification & Build
- `npm run verify`: Runs the whole gate in one step: `typecheck -w server`, `typecheck -w web`, `lint` and `test`.
- `npm run typecheck -w server`: Typecheck backend (`tsc --noEmit`).
- `npm run typecheck -w web`: Typecheck frontend (`tsc --noEmit`).
- `npm run lint`: ESLint over the whole repo (`eslint . --max-warnings=0`) with the flat config in `eslint.config.mjs`.
- `npm run lint:fix`: Same as `lint` but with `--fix`.
- `npm test`: Runs the backend suite (`vitest run` in `server/`, tests in `server/test/**`).
- `npm run format`: Formats everything with Prettier (`.prettierrc`) — it rewrites existing files, so it is not part of `verify`.
- `npm run build`: Builds frontend (`web/dist`) via `tsc --noEmit && vite build`.
- *Note:* Before SPEC 04 there was no test runner at all (Jest/Vitest); typecheck plus the scraper CLI were the only verification. Vitest now covers `server/` only — React component tests and e2e tests are still out of scope.
- *Testing quirks:* tests never open `data/prices.db` (`server/vitest.config.ts` sets `DB_PATH` to a temp file) and never hit the network or launch Chromium; the `/check` endpoints are excluded from the API tests.
- *Auth in tests:* tests never read the real `.env` (`loadDotenv()` runs only from `src/index.ts`); `server/vitest.config.ts` provides its own `ADMIN_USERNAME`/`ADMIN_PASSWORD`. `api.test.ts` logs in from `beforeAll` and reuses the cookie in every `inject`, and `auth.test.ts` covers the auth endpoints. Test files run sequentially (`fileParallelism: false`) because both suites open the same temp database.

### Production / Local Serving
- `npm run build && npm start`: Fastify serves compiled `web/dist` assets on `:3001` with SPA client routing fallback.

### Scraper Testing CLI
- `npm run try -w server -- <url> [css_selector]`: Test scraping against a live URL from the terminal without going through the web UI or database.

## Architecture & Code Quirks

### Backend (`server/`)
- **TypeScript Imports**: Uses `NodeNext` module resolution. Internal relative imports **must** include the `.js` extension (e.g. `import { routes } from './routes.js';`).
- **Env loading (`server/src/env.ts`)**: `loadDotenv()` reads `<repo root>/.env` with Node's native `process.loadEnvFile()` (no `dotenv` dependency) and tolerates a missing file. It is called from `src/index.ts` **before** `buildApp()` — never from `app.ts`, because tests import `buildApp()` and must not load the real `.env`.
- **Auth (`server/src/auth.ts`)**: credentials read lazily from `ADMIN_USERNAME`/`ADMIN_PASSWORD` (`verifyCredentials()` compares via `crypto.timingSafeEqual`); sessions are an in-memory `Map<token, expiry>` (`SESSION_COOKIE = 'pt_session'`, `SESSION_TTL_MS = 7 días`) with a hand-rolled `parseCookies()`. Restarting the server drops all sessions.
- **API protection (`server/src/routes.ts`)**: an `onRequest` hook registered **first** in `routes()` blocks every `/api/*` request without a valid session cookie (`401 { error: 'No autenticado' }`), except `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/session`. `login` answers `200` + `Set-Cookie: pt_session=…; HttpOnly` or `401 { error: 'Usuario o contraseña incorrectos' }`; `session` returns `200 { authenticated }` without requiring a session.
- **Database (`server/src/db.ts`)**: Embedded SQLite at `data/prices.db` (override with `DB_PATH` env var). No ORM or migration tool; tables (`products`, `pages`, `price_checks`) are auto-created on startup with WAL mode and foreign keys enabled.
- **Scraping Pipeline (`server/src/scraper/`)**:
  1. Static `fetch` + Cheerio.
  2. Headless Playwright Chromium fallback (uses singleton browser instance; blocks media/images/fonts; waits for `networkidle`).
  3. Extraction priority: page-specific CSS selector -> JSON-LD -> Microdata -> Meta/OG tags -> store presets (Amazon, eBay, AliExpress) -> regex heuristic.
  4. Request concurrency is limited to 3 simultaneous fetches via `p-limit`.
- **Side Effect**: Scraping records history into `price_checks` and auto-populates `products.image_url` if empty.
- **Host Binding**: Fastify listens strictly on `127.0.0.1` and CORS is restricted to localhost/127.0.0.1 origins.

### Frontend (`web/`)
- React 19 + React Router 7 (`/login` for `Login`, `/` for `ProductList`, `/products/:id` for `ProductDetail`).
- **Auth (`web/src/auth.tsx`)**: `AuthProvider` (checks `GET /api/auth/session` on mount, registers `setOnUnauthorized()` from `api.ts`, exposes `login()`/`logout()`), `useAuth()` with `status: 'checking' | 'authenticated' | 'guest'`, plus the guards `RequireAuth` (redirects to `/login` keeping `state.from`) and `RequireGuest` (keeps authenticated users off `/login`). No token is stored in JS: the session lives in the httpOnly cookie.
- **Login screen (`web/src/pages/Login.tsx`)**: only two fields (labels "Admin Username" and "Admin password"), reusing `Card`/`Input`/`Button`/`Alert`. There is no registration or password recovery.
- Tailwind CSS 4 configured via `@tailwindcss/vite` and `@import "tailwindcss";` in `src/index.css`.
- API client in `web/src/api.ts` uses native `fetch` (no Redux, TanStack Query, or external state libraries); a `401` notifies the registered handler and throws `Error('Sesión caducada')` — except in `login()`, where the `401` means bad credentials and is shown on the form.
