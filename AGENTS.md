# AGENTS.md

## Overview
Local price comparison web app using an npm workspaces monorepo: Fastify API backend (`server/`) and React + Vite frontend (`web/`).

## Prerequisites & Setup
- **Node 22+ required**: Declared in `engines` (root `package.json`). `node:sqlite` is only used by the one-off `migrate:sqlite` script.
- **Playwright Chromium**: Run `npx playwright install chromium` for browser-based scraping fallback.
- Install dependencies: `npm install`
- **`.env` at the repo root** (git-ignored):
  - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — required; `src/index.ts` exits with code 1 naming the missing one. The service role key is backend-only and must never be imported from `web/`.
  - `SUPABASE_ADMIN_EMAIL` and `SUPABASE_ADMIN_PASSWORD` — only read by `seed:admin`.
- **Supabase setup**: schema lives in `supabase/migrations/0001_esquema_inicial.sql` (applied to the remote project with the Supabase MCP `apply_migration`; there is no Supabase CLI/Docker in the workflow). Then:
  - `npm run seed:admin -w server`: creates the admin user in Supabase Auth from `SUPABASE_ADMIN_EMAIL`/`SUPABASE_ADMIN_PASSWORD`; idempotent (skips it if the email exists).
  - `npm run migrate:sqlite -w server [-- <path.db>]`: one-off copy of `data/prices.db` to Supabase. Opens it read-only, writes `data/prices.backup-<timestamp>.db`, refuses to run if the Supabase tables are not empty, inserts each table in one request with explicit ids and dates converted from `YYYY-MM-DD HH:MM:SS` (UTC) to ISO, calls `reset_sequences()` via RPC and compares counts. Stop the app first.

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
- *Testing quirks:* tests never talk to Supabase, open any database, hit the network or launch Chromium; the `/check` endpoints are excluded from the API tests. `api.test.ts` and `auth.test.ts` inject an in-memory repo (`test/fake-repo.ts`) and a fake `AuthPort` (`test/fake-auth.ts`, single-use refresh tokens like Supabase) into `buildApp({ repo, auth })`. CI needs no Supabase secrets.
- *Auth in tests:* tests never read the real `.env` (`loadDotenv()` runs only from `src/index.ts` and `scripts/`); `server/vitest.config.ts` sets no env vars. `api.test.ts` logs in against the fake auth from `beforeAll` and reuses the cookie in every `inject`; `auth.test.ts` covers login/logout, the 7-day cookie expiry, token refresh (<60 s left, shared between concurrent requests) and refresh failure → `401`. Time is simulated with `vi.useFakeTimers({ toFake: ['Date'] })`.

### Production / Local Serving
- `npm run build && npm start`: Fastify serves compiled `web/dist` assets on `:3001` with SPA client routing fallback. The local app needs internet access (the database is Supabase).

### Scraper Testing CLI
- `npm run try -w server -- <url> [css_selector]`: Test scraping against a live URL from the terminal without going through the web UI or database.

## Architecture & Code Quirks

### Backend (`server/`)
- **TypeScript Imports**: Uses `NodeNext` module resolution. Internal relative imports **must** include the `.js` extension (e.g. `import { routes } from './routes.js';`).
- **Env loading (`server/src/env.ts`)**: `loadDotenv()` reads `<repo root>/.env` with Node's native `process.loadEnvFile()` (no `dotenv` dependency) and tolerates a missing file. It is called from `src/index.ts` (**before** `buildApp()`) and from `scripts/` — never from `app.ts`, because tests import `buildApp()` and must not load the real `.env`.
- **Dependency injection (`server/src/app.ts`)**: `buildApp({ repo, auth })` receives the data layer (`Repo`) and the auth port (`AuthPort`); production defaults are `createSupabaseRepo()` and `createSupabaseAuth()`. `routes()` gets both as plugin options.
- **Supabase client (`server/src/supabase.ts`)**: `getSupabase()` is a lazily created singleton with the service role key (bypasses RLS). `createAuthClient()` returns a throwaway client for `signInWithPassword`/`refreshSession` — never sign in on the shared client, or its DB queries would run as the user and RLS (no policies) would hide every row.
- **Auth (`server/src/auth.ts`)**: `AuthPort` (`signIn`, `refresh`, `signOut`) backed by Supabase Auth; login is by **email**. Sessions are an in-memory `Map<cookieToken, { accessToken, refreshToken, expiresAt, sessionExpiresAt }>` (`SESSION_COOKIE = 'pt_session'`, `SESSION_TTL_MS = 7 días`); Supabase tokens never leave the server. `isValidSession()` is async: valid while the 7-day cookie lives; if the access token has < 60 s left (`REFRESH_MARGIN_MS`) it refreshes, sharing one promise per session; a failed refresh deletes the session. `destroySession()` revokes the Supabase session (`auth.admin.signOut(jwt, 'local')`). Hand-rolled `parseCookies()`. Restarting the server drops all sessions.
- **API protection (`server/src/routes.ts`)**: an `onRequest` hook registered **first** in `routes()` blocks every `/api/*` request without a valid session cookie (`401 { error: 'No autenticado' }`), except `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/session`. `login` takes `{ email, password }` and answers `200` + `Set-Cookie: pt_session=…; HttpOnly` (plus `; Secure` when `NODE_ENV === 'production'`) or `401 { error: 'Usuario o contraseña incorrectos' }` (malformed bodies are also `401`, never `400`); `logout` always answers `204` (a failed revocation is only logged); `session` returns `200 { authenticated }` without requiring a session.
- **Database**: Postgres on Supabase. Tables `products`, `pages`, `price_checks` (`bigint generated by default as identity`, `timestamptz`), indexes `idx_pages_product`/`idx_checks_page`, RLS enabled with **no** policies (only the service role can read/write), plus `reset_sequences()`. Schema changes go in a new file under `supabase/migrations/`. `data/prices.db` is no longer used by the app; it (and `prices.backup-*.db`) is just a pre-migration backup.
- **Repository (`server/src/repo.ts`, `server/src/repo-supabase.ts`)**: `Repo` interface plus `ProductRow`/`PageRow`/`CheckRow`/`Status`. The Supabase implementation normalizes every date to `toISOString()` (`…Z`), because `GET /api/products` compares `checked_at` as text to compute `last_check_at`; Supabase errors are thrown and end up as `500` + log.
- **Scraping Pipeline (`server/src/scraper/`)**:
  1. Static `fetch` + Cheerio.
  2. Headless Playwright Chromium fallback (uses singleton browser instance with `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`; blocks media/images/fonts; waits for `networkidle`).
  3. Extraction priority: page-specific CSS selector -> JSON-LD -> Microdata -> Meta/OG tags -> store presets (Amazon, eBay, AliExpress) -> regex heuristic.
  4. Request concurrency is limited to 3 simultaneous fetches via `p-limit`.
- **Side Effect**: Scraping records history into `price_checks` and auto-populates `products.image_url` if empty.
- **Host Binding & CORS**: Fastify listens on `process.env.HOST ?? '0.0.0.0'` (port `process.env.PORT ?? 3001`). CORS allows `localhost`, `127.0.0.1`, `*.onrender.com`, and optional `RENDER_EXTERNAL_URL` / `CORS_ORIGIN`.

### Deployment & Docker
- **Multi-stage Dockerfile**:
  - `builder` stage (`node:22-slim`): builds `web/dist` and prepares production `node_modules` via `npm prune --omit=dev`.
  - `runner` stage (`mcr.microsoft.com/playwright:v1.63.0-noble`): runs as non-root `pwuser`, includes Chromium and Linux system libraries preinstalled, and starts Fastify with `npm run start -w server`.
- **Render Blueprint (`render.yaml`)**:
  - Defines a free-tier Docker Web Service (`price-tracker`) with `NODE_ENV: production`, `PORT: 3001` and required `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
  - In Render free tier, the service spins down after 15 minutes of inactivity; in-memory sessions are dropped on spin-down and the user simply logs in again upon wake-up (~30-50s cold start).

### Frontend (`web/`)
- React 19 + React Router 7 (`/login` for `Login`, `/` for `ProductList`, `/products/:id` for `ProductDetail`).
- **Auth (`web/src/auth.tsx`)**: `AuthProvider` (checks `GET /api/auth/session` on mount, registers `setOnUnauthorized()` from `api.ts`, exposes `login()`/`logout()`), `useAuth()` with `status: 'checking' | 'authenticated' | 'guest'`, plus the guards `RequireAuth` (redirects to `/login` keeping `state.from`) and `RequireGuest` (keeps authenticated users off `/login`). No token is stored in JS: the session lives in the httpOnly cookie.
- **Login screen (`web/src/pages/Login.tsx`)**: only two fields — "Email" (`type="email"`, `autoComplete="email"`) and "Admin password" — reusing `Card`/`Input`/`Button`/`Alert`. `api.login(email, password)` sends `{ email, password }`. There is no registration or password recovery.
- `formatDate()` in `web/src/api.ts` expects ISO 8601 dates with `Z`, as returned by the API.
- Tailwind CSS 4 configured via `@tailwindcss/vite` and `@import "tailwindcss";` in `src/index.css`.
- API client in `web/src/api.ts` uses native `fetch` (no Redux, TanStack Query, or external state libraries); a `401` notifies the registered handler and throws `Error('Sesión caducada')` — except in `login()`, where the `401` means bad credentials and is shown on the form.
