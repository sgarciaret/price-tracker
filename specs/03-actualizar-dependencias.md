# SPEC 03 — Actualización de dependencias del monorepo

> **Status:** Aprobado
> **Depends on:** —
> **Date:** 2026-10-03
> **Objective:** Actualizar a sus versiones actuales las dependencias desactualizadas del proyecto (Vite 8, Zod 4 con validación declarativa en Fastify, TypeScript 6 y varios bumps menores) sin cambiar el comportamiento de la aplicación.

## Por qué existe este spec

`npm outdated` señala varias majors pendientes: `vite` 6.4.3 → 8.3.2, `zod` 3.25.76 → 4.6.5, `typescript` 5.9.3 → 6.0.3, `@fastify/cors` 10.1.0 → 11.3.0, `p-limit` 6.2.0 → 7.3.3, `concurrently` 9.2.4 → 10.0.5 y `@vitejs/plugin-react` 4.7.0 → 6.1.1. Vite 6 ya no recibe soporte y es la base del build del frontend.

Además, el requisito de Node 24+ solo está escrito en el README: `package.json` no declara `engines` y no hay `.nvmrc`. Tampoco existe un script que verifique los dos workspaces de golpe; hoy hay que recordar dos comandos sueltos.

Este spec actualiza versiones y aprovecha Zod 4 para mover la validación de `server/src/routes.ts` del `parse()` manual de cada handler al `schema` de la ruta. El comportamiento visible de la API no cambia: mismos códigos de estado y mismo cuerpo de error.

## Scope

**In:**

- `package.json` (raíz): `concurrently` → `^10.0.5`, script nuevo `verify` con los dos typechecks y `engines.node: ">=24"`.
- `.nvmrc` nuevo con `24`.
- `server/package.json`: `@fastify/cors` → `^11.3.0`, `p-limit` → `^7.3.3`, `zod` → `^4.6.5`, `typescript` → `^6.0.3` y dependencia nueva `fastify-type-provider-zod`.
- `web/package.json`: `vite` → `^8.3.2`, `@vitejs/plugin-react` → `^6.1.1` y `typescript` → `^6.0.3`.
- `server/src/routes.ts`: esquemas Zod 4 (`z.url().trim()` en lugar de `z.string().trim().url()`) declarados como `schema` de cada ruta con `withTypeProvider`, manteniendo el `setErrorHandler` actual.
- `package-lock.json` regenerado con `npm install`.
- `README.md` y `AGENTS.md`: requisito de Node 24+ con `engines`/`.nvmrc` y el script `verify`.

**Out of scope (for future specs):**

- ESLint, Prettier, pruebas con Vitest y el workflow de CI: SPEC 04.
- Refactor pendiente (tipos compartidos entre `server` y `web`, TanStack Query, modales en lugar de `prompt()`/`confirm()`, error boundary, arranque del server compilado con `tsc`).
- TypeScript 7.0.2 (compilador nativo).
- `@types/node` 26.x.
- Cambios en el esquema de `data/prices.db` o en las consultas SQL.
- Nuevos endpoints o campos en la API.
- Exponer la API fuera de `127.0.0.1` (`@fastify/helmet`, rate limit).
- Documentación OpenAPI/Swagger, aunque se instale el type provider.

## Data model

Este spec no introduce datos nuevos ni toca el esquema de `data/prices.db`. Lo único que cambia es **dónde** se declara la validación que ya existía: los mismos esquemas, pero en el `schema` de la ruta en lugar del `parse()` dentro del handler.

```ts
// server/src/routes.ts
const idParam = z.object({ id: z.coerce.number().int().positive() });

const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  image_url: z.url().trim().nullish().or(z.literal('').transform(() => null)),
});

const pageBody = z.object({
  url: z.url().trim().refine((u) => /^https?:/i.test(u), 'Debe ser http(s)'),
  css_selector: z.string().trim().max(500).nullish().transform((v) => v || null),
});
```

Comportamiento de esos esquemas comprobado con `zod@4.6.5` antes de escribir este spec: `z.url()`, `.trim()`, `z.coerce.number()`, `.nullish().transform()`, `.refine` con mensaje propio y `ZodError.issues` siguen funcionando igual.

Contrato HTTP que se conserva tal cual (lo consume `web/src/api.ts`):

| Situación | Respuesta |
| --- | --- |
| Body o parámetro inválido | `400` con `{ "error": string }` |
| Recurso inexistente | `404` con `{ "error": string }` |
| Operación correcta | `200` / `201` / `204` con el JSON de siempre |

## Implementation plan

1. Raíz: `concurrently` → `^10.0.5`, añadir `"engines": { "node": ">=24" }`, añadir el script `"verify": "npm run typecheck -w server && npm run typecheck -w web"` y crear `.nvmrc` con `24`. Verificación: `npm install`, `npm run verify` en verde y `npm run dev` arranca api (3001) y web (5173).

2. `server/package.json`: `@fastify/cors` → `^11.3.0` y `p-limit` → `^7.3.3`. Verificación: `npm run verify` en verde y, con `npm run dev` en marcha, `GET http://localhost:5173/api/products` devuelve 200 (CORS y proxy siguen funcionando).

3. `typescript` → `^6.0.3` en `server` y `web`. Verificación: `npm run verify` y `npm run build` en verde; si TypeScript 6 acusa errores que 5.9 no daba, se corrigen en este mismo paso con cambios mínimos antes de seguir.

4. `web/package.json`: `vite` → `^8.3.2` y `@vitejs/plugin-react` → `^6.1.1`. Verificación: `npm run build` genera `web/dist/index.html` y `npm run dev` sigue sirviendo la app con el proxy a `127.0.0.1:3001`.

5. `server/package.json`: `zod` → `^4.6.5` y adaptar `server/src/routes.ts` a la API de Zod 4 (`z.url().trim()` en `productBody` y `pageBody`; el resto de constructos no cambian). Verificación: `npm run verify` en verde y `POST /api/products` con `{"name":""}` devuelve 400 con `{"error": ...}`.

6. Añadir `fastify-type-provider-zod` a `server/package.json` y mover cada esquema al `schema` de su ruta con `app.withTypeProvider()` en `server/src/routes.ts`: `params` en las rutas con `:id`, `body` en `POST /api/products`, `POST /api/products/:id/pages` y `PUT /api/pages/:id`. El `setErrorHandler` se queda como está. Verificación: typecheck en verde y repaso de la matriz de respuestas a mano (400 con body inválido, 404 con id inexistente, 201 al crear, 204 al borrar).

7. Documentación: `README.md` (requisito Node 24+ con `.nvmrc` y `engines`, script `verify`) y `AGENTS.md` (script `verify` en *Essential Commands*). Verificación: cada comando documentado existe realmente en algún `package.json`.

8. Verificación final: `npm run verify`, `npm run build`, `npm run build && npm start` con carga de `http://localhost:3001` y de `http://localhost:3001/products/1` (fallback SPA), y `npm audit` en 0 vulnerabilidades.

## Acceptance criteria

- [ ] `npm run verify` termina sin errores (typecheck de `server` y de `web`).
- [ ] `npm run build` termina sin errores y genera `web/dist/index.html`.
- [ ] `npm audit` informa de 0 vulnerabilidades.
- [ ] El `package.json` de la raíz declara `"engines": { "node": ">=24" }` y existe `.nvmrc` con `24`.
- [ ] `npm ls typescript` muestra `typescript@6.x` en `server` y en `web`, y `@types/node` sigue en `24.x`.
- [ ] `npm outdated` ya no muestra `vite`, `zod`, `@fastify/cors`, `p-limit`, `concurrently` ni `@vitejs/plugin-react` por debajo de la versión fijada en este spec.
- [ ] `npm run dev` arranca la API en 3001 y Vite en 5173, y `GET http://localhost:5173/api/products` devuelve 200 con JSON.
- [ ] `npm run build && npm start` sirve la app en 3001 y la ruta `/products/1` devuelve `index.html`.
- [ ] `POST /api/products` con `{"name":""}` devuelve 400 con `{"error": string}`.
- [ ] `POST /api/products` con un `image_url` que no es una URL válida devuelve 400.
- [ ] `POST /api/products` con `{"name":"Prueba"}` devuelve 201 y el producto aparece en `GET /api/products`.
- [ ] `GET /api/products/999999` devuelve 404 con `{"error": string}`.
- [ ] `POST /api/products/:id/pages` con una URL que no es `http(s)` devuelve 400 con el mensaje «Debe ser http(s)».
- [ ] `PUT /api/pages/:id` con un `css_selector` demasiado largo devuelve 400.
- [ ] `DELETE /api/products/:id` devuelve 204 y el producto desaparece del listado.
- [ ] Ningún endpoint cambia de forma: mismos códigos de estado y mismo campo `error` en las respuestas de fallo.
- [ ] No hay cambios en el esquema de `data/prices.db`.
- [ ] `README.md` y `AGENTS.md` documentan `engines`/`.nvmrc` y el script `verify`.

## Decisions

- **Sí:** cuatro pasos con verificación tras cada uno (bumps menores → TypeScript → Vite → Zod + type provider). Si algo se rompe, se sabe exactamente qué paquete lo rompió y se revierte solo ese.
- **Sí:** TypeScript en `^6.0.3`. **No:** TypeScript 7.0.2, el compilador nativo: `typescript-eslint@8` declara peer `typescript >=4.8.4 <6.1.0`, y el SPEC 04 añade ESLint, así que subir a 7 dejaría el lint sin soporte.
- **Sí:** `@types/node` en 24.x. **No:** 26.x. Los tipos deben seguir al runtime (Node 24, LTS hasta 2028), no a la última versión publicada.
- **Sí:** `fastify-type-provider-zod@7` para validar en el `schema` de la ruta. **No:** seguir con el `parse()` manual en cada handler: hoy la validación vive dentro de la lógica del handler y los parámetros se validan aparte con `idParam.parse(req.params)`.
- **Sí:** conservar el `setErrorHandler` con el formato `{ error: string }`. **No:** cambiar el contrato de error, porque `web/src/api.ts` lee `data.error` para pintar el `Alert`.
- **Sí:** `z.url().trim()`, probado antes de escribir este spec. **No:** otras reescrituras de estilo en los esquemas; solo lo que exija Zod 4.
- **Nota:** `fastify-type-provider-zod@7` arrastra como peers `@fastify/swagger` y `openapi-types` (los instala npm automáticamente). Quedan en el `package-lock.json`, pero no se registra ninguna ruta `/docs` en este spec.
- **Sí:** `engines` + `.nvmrc`. **No:** fijar una versión exacta de Node: el proyecto solo exige 24 o superior.
- **Sí:** rangos `^` en todas las versiones, como ya se usa en todo el repo. **No:** `overrides` ni pin exacto.
- **No:** tocar `fastify`, `@fastify/static`, `cheerio`, `playwright`, `react`, `react-dom`, `react-router-dom`, `tailwindcss`, `@tailwindcss/vite`, `tsx` ni `p-limit` más allá de lo indicado: todos están ya en su última versión (`npm audit` en 0).
- **No:** compilar el server con `tsc` para producción; `npm start` sigue usando `tsx`.
- **No:** Drizzle, Kysely ni ningún ORM: el SQL crudo con `as unknown as` se queda como está.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Vite 8 usa Rolldown y puede cambiar el build | Paso propio con `npm run build` antes de seguir; si falla, se revierte solo `vite` y `@vitejs/plugin-react`. |
| Zod 4 altera mensajes o formatos de error de validación | Criterios de aceptación que fijan el contrato 400/404 y el mensaje «Debe ser http(s)». |
| El type provider serializa o valida distinto a `reply.send` | Matriz de respuestas comprobada a mano en el paso 6. |
| TypeScript 6 acusa errores que 5.9 no daba | Paso dedicado antes de tocar Vite o Zod, con correcciones mínimas. |
| `@fastify/cors@11` cambia el manejo de `origin` | Se prueba la petición cross-origin desde `localhost:5173` en el paso 2. |
| `npm install` arrastra cambios transitivos en el `package-lock.json` | `npm audit` en verde y prueba manual de la app con `npm run dev`. |

## What is **not** in this spec

- ESLint, Prettier, pruebas con Vitest y workflow de CI (SPEC 04).
- Tipos compartidos entre `server` y `web`, TanStack Query, modales, error boundary y arranque compilado del server.
- TypeScript 7 y `@types/node` 26.
- Cambios en el esquema de la base de datos o en las consultas SQL.
- Nuevos endpoints, nuevas funcionalidades o OpenAPI.
- Exponer la API fuera de `127.0.0.1`.

Cada uno de esos, si llega algún día, va en su propio spec.
