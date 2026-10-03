# AGENTS.md

## Overview
Local price comparison web app using an npm workspaces monorepo: Fastify API backend (`server/`) and React + Vite frontend (`web/`).

## Prerequisites & Setup
- **Node 24+ required**: Backend uses Node's native `node:sqlite` (`DatabaseSync`). Declared in `engines` (root `package.json`) and `.nvmrc`.
- **Playwright Chromium**: Run `npx playwright install chromium` for browser-based scraping fallback.
- Install dependencies: `npm install`

## Essential Commands

### Development
- `npm run dev`: Runs Fastify API (`:3001`) and Vite dev server (`:5173`) concurrently.
  - Vite dev server proxies `/api` calls to `http://127.0.0.1:3001`.
- `npm run dev -w server`: Runs backend only with `tsx watch`.
- `npm run dev -w web`: Runs frontend only with Vite.

### Verification & Build
- `npm run verify`: Runs both typechecks (`typecheck -w server` and `typecheck -w web`) in one step.
- `npm run typecheck -w server`: Typecheck backend (`tsc --noEmit`).
- `npm run typecheck -w web`: Typecheck frontend (`tsc --noEmit`).
- `npm run build`: Builds frontend (`web/dist`) via `tsc --noEmit && vite build`.
- *Note:* No automated test runner (Jest/Vitest) is configured; use typecheck and the scraper CLI for verification.

### Production / Local Serving
- `npm run build && npm start`: Fastify serves compiled `web/dist` assets on `:3001` with SPA client routing fallback.

### Scraper Testing CLI
- `npm run try -w server -- <url> [css_selector]`: Test scraping against a live URL from the terminal without going through the web UI or database.

## Architecture & Code Quirks

### Backend (`server/`)
- **TypeScript Imports**: Uses `NodeNext` module resolution. Internal relative imports **must** include the `.js` extension (e.g. `import { routes } from './routes.js';`).
- **Database (`server/src/db.ts`)**: Embedded SQLite at `data/prices.db` (override with `DB_PATH` env var). No ORM or migration tool; tables (`products`, `pages`, `price_checks`) are auto-created on startup with WAL mode and foreign keys enabled.
- **Scraping Pipeline (`server/src/scraper/`)**:
  1. Static `fetch` + Cheerio.
  2. Headless Playwright Chromium fallback (uses singleton browser instance; blocks media/images/fonts; waits for `networkidle`).
  3. Extraction priority: page-specific CSS selector -> JSON-LD -> Microdata -> Meta/OG tags -> store presets (Amazon, eBay, AliExpress) -> regex heuristic.
  4. Request concurrency is limited to 3 simultaneous fetches via `p-limit`.
- **Side Effect**: Scraping records history into `price_checks` and auto-populates `products.image_url` if empty.
- **Host Binding**: Fastify listens strictly on `127.0.0.1` and CORS is restricted to localhost/127.0.0.1 origins.

### Frontend (`web/`)
- React 19 + React Router 7 (`/` for `ProductList`, `/products/:id` for `ProductDetail`).
- Tailwind CSS 4 configured via `@tailwindcss/vite` and `@import "tailwindcss";` in `src/index.css`.
- API client in `web/src/api.ts` uses native `fetch` (no Redux, TanStack Query, or external state libraries).
