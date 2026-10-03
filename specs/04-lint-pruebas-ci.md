# SPEC 04 — Lint, pruebas automáticas y CI

> **Status:** Aprobado
> **Depends on:** SPEC 03
> **Date:** 2026-10-03
> **Objective:** Añadir ESLint con Prettier, pruebas automáticas con Vitest para el scraper y la API, y un workflow de GitHub Actions que ejecute typecheck, lint, pruebas y build.

## Por qué existe este spec

Hoy la única verificación del proyecto es `tsc --noEmit` en cada workspace. No hay linter, ni formateador, ni pruebas, ni CI: cualquier regresión en la lógica de precios se descubre a mano contra URLs reales.

El scraper es el punto más frágil y el más barato de testear: `normalize.ts` convierte formatos numéricos españoles e internacionales, `classify.ts` decide si una tienda está bloqueando y `extract.ts` aplica una cascada de estrategias con regex. Todo eso es puro y no necesita red. La API, por su parte, se puede probar con `app.inject()` sin levantar servidor ni tocar la base de datos real.

## Scope

**In:**

- `eslint.config.mjs` nuevo en la raíz (flat config): `typescript-eslint@8` en modo `recommended`, `eslint-plugin-react-hooks@7` para `web/`, `eslint-config-prettier@10`, `globals` y `ignores` para `node_modules`, `web/dist` y `data/`.
- DevDependencies nuevas en la raíz: `eslint@^10`, `typescript-eslint@^8`, `eslint-plugin-react-hooks@^7`, `eslint-config-prettier@^10`, `prettier@^3`, `globals`.
- Scripts nuevos en la raíz: `lint` (`eslint . --max-warnings=0`), `lint:fix`, `format` (`prettier --write .`) y `test` (`npm run test -w server`); `verify` ampliado a typecheck + lint + test.
- `.prettierrc` (`singleQuote`, `printWidth: 120`, `trailingComma: "all"`) y `.prettierignore` (`node_modules`, `web/dist`, `data`, `package-lock.json`).
- Correcciones mínimas para que el lint pase en verde: dependencias de los `useEffect` de `web/src/pages/ProductList.tsx` y `web/src/pages/ProductDetail.tsx`, y el `type Json = any` de `server/src/scraper/extract.ts`.
- Vitest en `server`: `vitest@^5` como devDependency, `server/vitest.config.ts`, script `test` y `server/test/**` añadido al `include` de `server/tsconfig.json`.
- Pruebas unitarias del scraper: `server/test/normalize.test.ts`, `server/test/classify.test.ts`, `server/test/extract.test.ts` y fixtures HTML en `server/test/fixtures/`.
- Nuevo `server/src/app.ts` con `buildApp()` y `server/test/api.test.ts` con `app.inject()` sobre una base de datos temporal.
- `.github/workflows/ci.yml`: Node según `.nvmrc`, `npm ci`, `npm run verify`, `npm run build`.
- Documentación: `README.md` y `AGENTS.md` con los comandos nuevos.

**Out of scope (for future specs):**

- Tests de componentes React (Testing Library + jsdom) y tests e2e (Playwright Test).
- Umbrales de cobertura, informes o badges.
- Reformat masivo con Prettier de los archivos existentes.
- Husky, lint-staged o cualquier hook de pre-commit.
- Subir el repositorio a GitHub: hoy no hay ningún remoto configurado.
- Refactor pendiente (tipos compartidos, TanStack Query, modales, error boundary), TypeScript 7 y nuevas funcionalidades.

## Data model

Este spec no introduce datos persistidos nuevos ni toca el esquema de `data/prices.db`. Las estructuras que aparecen son solo de prueba:

```ts
// server/vitest.config.ts — los tests nunca abren data/prices.db
test: {
  env: { DB_PATH: join(tmpdir(), 'price-tracker-test.db') },
  setupFiles: ['test/setup.ts'],   // borra el temporal antes de la suite
  include: ['test/**/*.test.ts'],
}
```

```ts
// server/test/fixtures/*.html — HTML mínimo por estrategia de extracción
json-ld.html      // <script type="application/ld+json"> con Product + offers
microdata.html    // itemprop="price" / itemprop="priceCurrency"
meta-price.html   // og:price:amount / og:price:currency + og:image
plain-price.html  // solo texto visible, para la heurística regex y el selector propio
```

Funciones que pasan a ser directamente testables, con su valor actual:

| Módulo | Función | Casos de referencia |
| --- | --- | --- |
| `normalize.ts` | `parsePrice` | `'1.299,99 €' → 1299.99`, `'1,299.99' → 1299.99`, `'19,90' → 19.9`, `'1299' → 1299`, `'agotado' → null` |
| `normalize.ts` | `detectCurrency` | `'99,99 EUR' → 'EUR'`, `'10 €' → 'EUR'`, `'$10' → 'USD'`, `'sin moneda' → null` |
| `classify.ts` | `isBlockedStatus` | `401/403/429/503 → true`, `200/500 → false` |
| `classify.ts` | `looksBlocked` | HTML con `captcha → true`, HTML normal → `false` |
| `extract.ts` | `extractPrice` | `price`, `currency` y `method` por estrategia (`json-ld`, `microdata`, `meta`, `selector`, `regex`) |

## Implementation plan

1. Añadir las devDependencies de lint a la raíz y crear `eslint.config.mjs` con `typescript-eslint` (`recommended`), `react-hooks` para `web/**`, `globals.node`/`globals.browser`, `argsIgnorePattern: '^_'` y los `ignores` (`node_modules`, `web/dist`, `data`), más los scripts `lint` y `lint:fix`. Verificación: `npm run lint` ejecuta y enumera las incidencias reales del código actual.

2. Corregir en `web/` las dependencias de los `useEffect`: en `ProductList.tsx` y `ProductDetail.tsx` el effect carga los datos sin que `exhaustive-deps` se queje (el `load` pasa a `useCallback` y el effect depende de él) sin cambiar el comportamiento (carga al montar y al cambiar el `id`, sin bucles). Verificación: `npm run lint` sin avisos de `react-hooks` y carga normal de ambas páginas en el navegador.

3. Corregir `server/src/scraper/extract.ts`: `type Json = any` pasa a ser un tipo JSON recursivo (`string | number | boolean | null | Json[] | { [k: string]: Json | undefined }`), estrechando las firmas internas (`hasType`, `priceFromOffer`, `walk`) donde el compilador lo pida. Verificación: `npm run lint` y `npm run verify` en verde, sin cambios en el comportamiento.

4. Añadir `.prettierrc`, `.prettierignore` y el script `format`; incorporar `eslint-config-prettier` a `eslint.config.mjs` para que ESLint y Prettier no se pisen. Verificación: `npx prettier --check` pasa sobre los ficheros nuevos de este spec; los existentes no se reformatean.

5. Infraestructura de pruebas en `server/`: `vitest@^5`, script `"test": "vitest run"`, `server/vitest.config.ts` con `DB_PATH` temporal y `setupFiles`, `server/test/setup.ts` que borra el temporal, y `include: ["src", "test", "vitest.config.ts"]` en `server/tsconfig.json`. Verificación: `npm test` ejecuta la suite en verde con 0 pruebas todavía.

6. `server/test/normalize.test.ts` y `server/test/classify.test.ts` con los casos de la tabla de arriba (incluidos los inválidos: texto sin número, `0`, negativos). Verificación: `npm test` en verde.

7. `server/test/fixtures/` con los cuatro HTML y `server/test/extract.test.ts` cubriendo las cinco estrategias de `extractPrice` más `extractMeta`. Si un caso no coincide con el comportamiento actual, se ajusta el test al comportamiento real: este spec no cambia la lógica del scraper. Verificación: `npm test` en verde.

8. Extraer el constructor de la app a `server/src/app.ts` (`buildApp()`: CORS, rutas, estático y `setNotFoundHandler`) y dejar en `server/src/index.ts` solo el `listen`, los manejadores de señal y `closeBrowser()`. Verificación: `npm run dev` y `npm run build && npm start` siguen funcionando igual que antes.

9. `server/test/api.test.ts` con `buildApp().inject()` para CRUD: crear, listar, detalle, actualizar y borrar productos; añadir, editar y borrar páginas; y los errores 400/404. Sin endpoints `/check` (hacen red). Verificación: `npm test` en verde y `git status` limpio tras la ejecución.

10. Ampliar el `verify` de la raíz a `typecheck + lint + test` y añadir el script `test`. Verificación: `npm run verify` ejecuta los cuatro comandos y termina en verde.

11. Crear `.github/workflows/ci.yml` con `actions/checkout@v7`, `actions/setup-node@v7` (node-version-file: `.nvmrc`, caché de npm), `npm ci`, `npm run verify`, `npm run build` y `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'`. Verificación: el YAML es válido y `npm ci && npm run verify && npm run build` reproducido en local pasa igual.

12. Documentación: `README.md` (sección de comandos con `verify`, `lint`, `test` y nota del CI) y `AGENTS.md` (nuevos comandos en *Essential Commands* y ausencia de runner de pruebas antes de este spec). Verificación: cada comando documentado existe en algún `package.json`.

## Acceptance criteria

- [ ] `npm run lint` (`eslint . --max-warnings=0`) termina con 0 errores y 0 avisos sobre el código actual.
- [ ] Los ficheros existentes no se han reformateado: fuera de las correcciones puntuales de los pasos 2 y 3, el diff no contiene cambios de formato.
- [ ] `npm test` ejecuta la suite del server en verde.
- [ ] `npm run verify` ejecuta typecheck de `server`, typecheck de `web`, lint y pruebas, y termina sin errores.
- [ ] `npm run build` sigue terminando sin errores.
- [ ] Hay pruebas de `parsePrice` que cubren `1.299,99 € → 1299.99`, `1,299.99 → 1299.99`, `19,90 → 19.9`, `1299 → 1299`, texto sin número → `null` y `0` → `null`.
- [ ] Hay pruebas de `detectCurrency` para código `EUR`, símbolo `€`, símbolo `$` y texto sin moneda → `null`.
- [ ] Hay pruebas de `isBlockedStatus` (401, 403, 429 y 503 → `true`; 200 y 500 → `false`) y de `looksBlocked` (HTML con captcha → `true`, HTML normal → `false`).
- [ ] Hay pruebas de `extractPrice` con fixtures que cubren JSON-LD, microdata, meta/OG, selector CSS propio y la heurística por regex, comprobando `price`, `currency` y `method`.
- [ ] Hay pruebas de API con `app.inject()` que cubren: crear producto (201), listar (200), detalle (200 y 404), actualizar (200), borrar (204 y después 404), añadir página válida (201), añadir página con URL no `http(s)` (400 con «Debe ser http(s)»), añadir página a producto inexistente (404), editar selector (200) y borrar página (204).
- [ ] Ningún test abre `data/prices.db`: `DB_PATH` apunta a un fichero temporal y `git status` queda limpio tras `npm test`.
- [ ] Ningún test hace peticiones de red ni lanza Chromium.
- [ ] `server/src/index.ts` sigue siendo el único punto de entrada y la app se construye desde el nuevo `server/src/app.ts`.
- [ ] Existe `.github/workflows/ci.yml` que, con la versión de Node de `.nvmrc`, ejecuta `npm ci`, `npm run verify` y `npm run build`, con `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- [ ] `README.md` y `AGENTS.md` documentan `npm run lint`, `npm test` y el `verify` ampliado.

## Decisions

- **Sí:** una única flat config `eslint.config.mjs` en la raíz para los dos workspaces. **No:** un config por workspace. **Por qué `.mjs`:** el `package.json` de la raíz no declara `"type": "module"`.
- **Sí:** `typescript-eslint` en modo `recommended` (sin reglas *type-checked*). **No:** `recommendedTypeChecked`, porque `no-unsafe-*` obligaría a reescribir todos los cast `as unknown as` de `routes.ts`, que este spec no toca.
- **Sí:** `--max-warnings=0` en `lint`. **No:** aceptar avisos, porque `react-hooks/exhaustive-deps` es *warning* por defecto y justo es lo que hay que corregir.
- **Sí:** corregir el código existente (dependencias de los `useEffect` y el `any` de `extract.ts`). **No:** `eslint-disable` como primera opción; solo se admite si una regla choca con el estilo del repo y se anota aquí.
- **Sí:** `argsIgnorePattern: '^_'` para tolerar los parámetros ignorados como `_req` del `setErrorHandler`. **No:** renombrarlos para quedar bien.
- **Sí:** tipo JSON recursivo en `extract.ts`. **No:** `type Json = any` ni `eslint-disable` en esa línea: `parsePrice` ya acepta `unknown`, así que el tipo real es fácil de escribir.
- **Sí:** Prettier configurado con el estilo actual (`singleQuote`, `printWidth: 120`, `trailingComma: "all"`) y `eslint-config-prettier`. **No:** reformatear los archivos existentes en este spec: el diff sería enorme y taparía los cambios reales. **No:** commit de reformato masivo.
- **Sí:** Vitest solo en `server`. **No:** Testing Library ni Playwright Test; añadiría `jsdom` y un runner de e2e que hoy nadie pide.
- **Sí:** pruebas en `server/test/` y no colocalizadas junto al código. **No:** `*.test.ts` en `src/`, para no mezclar fuentes con pruebas en el `include` del tsconfig.
- **Sí:** extraer `buildApp()` a `server/src/app.ts`. **No:** importar `server/src/index.ts` desde los tests, porque ejecuta `app.listen()` al cargarse.
- **Sí:** `app.inject()` de Fastify. **No:** `supertest` ni levantar un servidor real en los tests.
- **Sí:** los tests de API cubren CRUD y no los endpoints `/check`. **No:** mockear `fetch` o Playwright para probar el checkeo: requiere otra estrategia y va en otro spec.
- **Sí:** base de datos temporal vía `DB_PATH` en `vitest.config.ts`. **No:** usar `data/prices.db` en los tests, ni fixtures sobre la BD real.
- **Sí:** workflow de GitHub Actions aunque hoy no haya remoto, para que solo haya que hacer `git remote add` y funcionar. **No:** otra CI.
- **Sí:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` en CI. **No:** `npx playwright install chromium` en la pipeline: el paquete `playwright` baja Chromium en el `postinstall` y ningún test de este spec lo usa.
- **Sí:** depend on SPEC 03: el lint se configura sobre el código ya actualizado a TypeScript 6 y el `verify` ampliado parte del script que crea ese spec.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El lint acuse muchas más incidencias de las previstas | El paso 1 solo enumera; los pasos 2 y 3 corrigen con cambios mínimos; si una regla choca con el estilo del repo, se ajusta la regla y se anota en Decisions. |
| Corregir las dependencias del `useEffect` cambia el número de peticiones | Se comprueba en el navegador: carga al montar, recarga al cambiar de producto, sin bucles de peticiones. |
| El tipo JSON rompe el typecheck de `extract.ts` | Se estrechan las firmas internas y `parsePrice(unknown)` ya admite cualquier valor; las pruebas de `extract` fijan el comportamiento. |
| `buildApp()` rompe el arranque en producción | Se prueban `npm run dev` y `npm run build && npm start` en el paso 8, antes de seguir. |
| Los tests de API ensucian `data/prices.db` | `DB_PATH` temporal en `vitest.config.ts` y criterio de aceptación con `git status` limpio. |
| El workflow no puede validarse sin remoto | Los mismos comandos (`npm ci && npm run verify && npm run build`) se ejecutan en local en el paso 11. |
| Vitest y Vite 8 conviven mal | `vitest@5.0.3` declara peer `vite: ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`, comprobado antes de escribir este spec. |

## What is **not** in this spec

- Tests de componentes React y tests e2e.
- Cobertura, informes o badges.
- Reformat masivo de los archivos existentes con Prettier.
- Hooks de pre-commit (Husky, lint-staged).
- Publicar el repositorio en GitHub.
- Refactor pendiente, TypeScript 7 y nuevas funcionalidades.

Cada uno de esos, si llega algún día, va en su propio spec.
