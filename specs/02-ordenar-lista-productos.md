# SPEC 02 — Ordenación de la lista de productos en la página principal

> **Status:** Implementado
> **Depends on:** —
> **Date:** 2026-10-03
> **Objective:** Permitir ordenar la lista de la página principal por nombre, por fecha de creación o por fecha del último registro de precio, con la creación descendente como orden por defecto.

## Por qué existe este spec

Hoy el orden de la lista es fijo: `GET /api/products` hace `ORDER BY created_at DESC, id DESC` en `server/src/routes.ts` y el frontend pinta el array tal cual llega. Con varios productos no hay forma de verlos en orden alfabético ni de poner arriba los que se han actualizado recientemente. Este spec añade el control de ordenación en la interfaz y el único dato que falta para que eso sea posible, `last_check_at`.

## Scope

**In:**

- Campo nuevo `last_check_at` en la respuesta de `GET /api/products` (`server/src/routes.ts`): fecha del registro de precio más reciente de cualquier página del producto, o `null`.
- Campo nuevo `last_check_at: string | null` en el tipo `ProductSummary` de `web/src/api.ts`.
- Módulo nuevo `web/src/productSort.ts`: tipo `SortKey`, orden por defecto, lista de opciones y función `sortProducts`.
- Estado `sort` en `web/src/pages/ProductList.tsx` con valor inicial `created_desc`.
- Fila propia con etiqueta `Ordenar por` y `<select>` de 5 opciones, colocada entre el formulario de añadir producto y la cuadrícula de productos.
- Persistencia de la elección en `sessionStorage` con la clave `productList:sort`.
- Las 5 combinaciones de orden: nombre A→Z, nombre Z→A, creación descendente, creación ascendente y último registro descendente.

**Out of scope (for future specs):**

- Persistir el orden en `localStorage` o en el backend. El usuario eligió que la elección viva solo durante la sesión.
- Query param `?sort=` en la API y `ORDER BY` en SQL. El orden se calcula en el frontend.
- Reordenación manual arrastrando las tarjetas (drag & drop).
- Paginación, búsqueda o filtros de productos.
- Aplicar el mismo control a otras vistas (tabla de páginas del detalle).
- Cambios en el esquema de la base de datos (`products`, `pages`, `price_checks`).
- Reordenar la lista automáticamente mientras se está en la página de detalle.
- Nuevas dependencias de npm.

## Data model

El backend calcula `last_check_at` a partir de los `last_check` que ya carga para cada página, sin ninguna consulta nueva:

```ts
// Respuesta de GET /api/products (campo nuevo)
last_check_at: string | null; // 'YYYY-MM-DD HH:MM:SS' en UTC, null si no hay registros
```

Estructuras nuevas en `web/src/productSort.ts`:

```ts
export type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'last_check_desc';

export const DEFAULT_SORT: SortKey = 'created_desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[];

export function isValidSortKey(value: string | null): value is SortKey;
export function sortProducts(products: ProductSummary[], key: SortKey): ProductSummary[];
```

Clave de persistencia: `sessionStorage['productList:sort']` → un `SortKey`.

Reglas de orden:

| `SortKey` | Criterio | Desempate |
| --- | --- | --- |
| `created_desc` (por defecto) | `created_at` descendente | `id` descendente |
| `created_asc` | `created_at` ascendente | `id` ascendente |
| `name_asc` | `localeCompare('es', { sensitivity: 'base' })` | `id` ascendente |
| `name_desc` | inversión exacta de `name_asc` | `id` descendente |
| `last_check_desc` | `last_check_at` descendente, `null` al final | `created_at` descendente, luego `id` descendente |

Convenciones:

- Las fechas se comparan como cadenas `YYYY-MM-DD HH:MM:SS`: el orden lexicográfico es el orden cronológico.
- `sortProducts` nunca muta el array recibido: se trabaja sobre una copia con `[...products]`.
- Las variantes `_desc` de nombre y creación se obtienen invirtiendo el resultado ascendente.

## Implementation plan

1. Añadir `last_check_at` en el handler de `GET /api/products` de `server/src/routes.ts`, calculado como el máximo `checked_at` entre los `last_check` de las páginas ya cargadas (`null` si no hay páginas o no hay registros). Verificación: `npm run typecheck -w server` en verde y `GET /api/products` devuelve el campo en cada producto.

2. Añadir `last_check_at: string | null` a `ProductSummary` en `web/src/api.ts`. Verificación: `npm run typecheck -w web` en verde; todavía nada lo usa.

3. Crear `web/src/productSort.ts` con `SortKey`, `DEFAULT_SORT`, las 5 entradas de `SORT_OPTIONS`, `isValidSortKey` y `sortProducts` siguiendo la tabla de reglas. Verificación: typecheck en verde; el módulo todavía no se importa desde ninguna página.

4. Añadir el estado `sort` en `web/src/pages/ProductList.tsx`: valor inicial leído de `sessionStorage['productList:sort']` con `isValidSortKey`, y `DEFAULT_SORT` como respaldo. La escritura con `setItem` va dentro de un `try/catch` que cae a `DEFAULT_SORT`. Verificación: elegir un orden en las herramientas del navegador, recargar y ver que se mantiene.

5. Renderizar la fila de ordenación en `ProductList.tsx` entre el formulario y la lista: etiqueta `Ordenar por` con `htmlFor="product-sort"` y `<select id="product-sort">` con las 5 opciones de `SORT_OPTIONS`, con las mismas clases de borde, radio y foco que `Input`. Verificación: el select se ve alineado a la derecha y no envía el formulario al cambiar.

6. Aplicar `sortProducts(products, sort)` en el render de la cuadrícula y cambiar la lista en caliente con cada opción. Verificación: en el navegador, cada una de las 5 opciones reordena la lista sin recargar ni volver a pedir datos.

7. Verificación final: `npm run typecheck -w server`, `npm run typecheck -w web` y `npm run build` en verde, y repaso manual de los criterios de aceptación con al menos 3 productos, uno de ellos sin registros de precio.

## Acceptance criteria

- [x] `npm run typecheck -w server` termina sin errores.
- [x] `npm run typecheck -w web` termina sin errores.
- [x] `npm run build` termina sin errores.
- [x] `GET /api/products` incluye `last_check_at` en cada producto, con fecha o `null`.
- [x] Al cargar la página, la lista sale por fecha de creación descendente (los más nuevos primero), igual que hoy.
- [x] El `<select>` «Ordenar por» está en su propia fila entre el formulario y la cuadrícula, alineado a la derecha.
- [x] El select contiene exactamente 5 opciones: `Nombre (A → Z)`, `Nombre (Z → A)`, `Más recientes primero`, `Más antiguos primero`, `Último registro más reciente`.
- [x] El valor seleccionado por defecto al abrir la app sin nada guardado es `created_desc`.
- [x] `Nombre (A → Z)` ignora mayúsculas y acentos («Sony», «samsung» y «Ácido» se ordenan de forma natural) y respeta la ñ.
- [x] `Nombre (Z → A)` es la inversión exacta del orden A → Z.
- [x] `Más antiguos primero` es la inversión exacta de `Más recientes primero`.
- [x] `Último registro más reciente` pone primero el producto cuyo `last_check_at` es más reciente.
- [x] Los productos sin registros quedan al final en `Último registro más reciente`, ordenados entre sí por fecha de creación descendente.
- [x] Cambiar el select reordena la lista sin recargar la página y sin nuevas peticiones a la API.
- [x] Tras crear un producto nuevo, aparece en la posición que corresponda al orden activo.
- [x] Elegir un orden, entrar en un producto y volver con «← Volver» mantiene el orden elegido.
- [x] Recargar la pestaña mantiene el orden elegido; cerrar el navegador y volver a abrirlo restablece el orden por defecto.
- [x] Ningún componente muta el array de productos recibido de la API (la ordenación trabaja sobre una copia).
- [x] No se ha añadido ninguna dependencia de npm.
- [x] No hay cambios en el esquema de `data/prices.db`.

## Decisions

- **Sí:** orden calculado en el frontend. La lista ya se carga entera, así que reordenar en React evita ampliar el contrato de la API con query params que habría que validar.
- **Sí:** el backend solo aporta `last_check_at`. Se calcula en memoria a partir de los `last_check` que ya recorre el handler; ninguna consulta ni índice nuevos.
- **Sí:** `sessionStorage` con la clave `productList:sort`. Es lo que eligió el usuario: el orden sobrevive a la vuelta desde el detalle y a recargar la pestaña, pero no persiste al cerrar el navegador.
- **Sí:** estado inicial con `isValidSortKey` y respaldo a `DEFAULT_SORT`. Una clave corrupta o escrita a mano no rompe el render.
- **Sí:** fila propia para el select, entre el formulario y la lista. Dentro de la fila del formulario competiría con el submit y se quedaría corta de ancho.
- **Sí:** `<select>` nativo con las clases de `Input` en lugar de un componente nuevo. Solo hay un desplegable en toda la app; si aparece otro, se extrae a `web/src/components/ui/Select.tsx`.
- **Sí:** módulo `web/src/productSort.ts` separado de la página. Comparadores puros, sin React, se revisan de un vistazo.
- **Sí:** `localeCompare('es', { sensitivity: 'base' })` para el nombre. Ignora mayúsculas y acentos y respeta la ñ, que es lo que un usuario espera al ordenar nombres en español.
- **Sí:** las variantes descendentes se obtienen invirtiendo el array ascendente. Garantiza que Z → A es exactamente la inversión de A → Z sin escribir dos comparadores.
- **Sí:** `last_check_at` nulo siempre al final, agrupado por creación descendente. Son los productos con menos información y encabezarlos no aporta nada.
- **Sí:** copia con `[...products].sort(...)` y no `toSorted`. Evita depender de ES2023 en el `lib` de TypeScript y no muta el estado de React.
- **Sí:** desempate siempre por `id`. `created_at` solo tiene resolución de segundos: dos productos creados en el mismo segundo empatarían.
- **No:** `?sort=` en `GET /api/products`. Redundante hoy y amplía la superficie que habría que validar y probar.
- **No:** `localStorage`. El usuario lo descartó: el orden no debe sobrevivir al cierre del navegador.
- **No:** cabeceras clicables para ordenar. La lista principal es una cuadrícula de tarjetas, no una tabla con cabeceras.
- **No:** drag & drop para reordenar manualmente. Requeriría persistir un campo `position` en la base de datos.
- **No:** paginación ni búsqueda. Fuera del alcance; se retoma en otro spec si la lista crece.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `last_check_at` es `null` para productos sin páginas o sin comprobaciones | En `last_check_desc` van al final agrupados; en los otros cuatro órdenes el campo no se usa. |
| `created_at` solo tiene precisión de segundos, dos productos pueden empatar | Desempate por `id` en los cinco órdenes. |
| `Array.prototype.toSorted` puede no existir en el `lib` de TS configurado | Se usa `[...products].sort(...)`, disponible en cualquier versión. |
| `sessionStorage` lanza en algunos modos de privacidad | Lectura y escritura envueltas en `try/catch` con caída a `DEFAULT_SORT`. |
| El `<select>` nativo hereda estilos del sistema que rompen la estética de SPEC 01 | Se le dan las mismas clases de borde, radio, fondo y foco que `Input`. |
| Al volver del detalle la lista se recarga y el orden por último registro puede cambiar | Es el comportamiento pedido: el orden refleja los datos actuales, no una instantánea. |

## What is **not** in this spec

- Persistir el orden en `localStorage` o en el backend.
- Ordenar desde la API con `?sort=`.
- Reordenar arrastrando las tarjetas.
- Paginación, búsqueda o filtros de productos.
- El mismo control en la tabla de páginas del detalle.
- Cambios en el esquema de la base de datos.
- Nuevas dependencias de npm.

Cada uno de esos, si llega algún día, va en su propio spec.
