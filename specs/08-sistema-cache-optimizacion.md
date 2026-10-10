# SPEC 08 — Sistema de caché en memoria y optimización de consultas PostgREST

> **Status:** Implementado
> **Depends on:** SPEC 06, SPEC 07
> **Date:** 2026-10-10
> **Objective:** Reducir drásticamente las llamadas a Supabase implementando una caché en memoria en backend y frontend combinada con consultas agrupadas (PostgREST joins) para eliminar el problema N+1.

## Por qué existe este spec

Actualmente, cada petición a `GET /api/products` realiza una consulta para obtener los productos, una consulta adicional por cada producto para sus páginas, y otra consulta por cada página para obtener su último chequeo de precio (problema N+1). Con 10 productos y 2 tiendas cada uno, una sola carga de página dispara más de 30 peticiones HTTP a Supabase. Además, la navegación en el cliente React desmonta componentes y vuelve a pedir la información sin reutilizar datos recientes.

Este spec aborda el problema en los tres frentes clave:
1. **Backend Cache (Opción A):** Caché en memoria en el servidor Fastify con TTL de 2 minutos e invalidación activa ante mutaciones.
2. **Optimización PostgREST (Opción B):** Eliminación del N+1 utilizando consultas anidadas (`joins`) de PostgREST, reduciendo la carga en caché fría a una sola consulta de base de datos.
3. **Frontend Cache (Opción C):** Caché en memoria en `web/src/api.ts` con TTL de 30 segundos e invalidación al ejecutar acciones.

## Scope

**In:**

- **Módulo de caché en memoria en backend (`server/src/cache.ts`):**
  - Estructura `MemoryCache<T>` con soporte para TTL (por defecto 2 minutos), almacenamiento clave-valor, borrado por clave, borrado por prefijo y vaciado total.
- **Ampliación de `Repo` (`server/src/repo.ts`):**
  - Incorporar tipos y métodos optimizados para obtener la lista resumida (`listProductsSummary()`) y el detalle completo (`getProductDetail(id)`).
- **Consultas con Joins en Supabase (`server/src/repo-supabase.ts`):**
  - Implementar `listProductsSummary()` y `getProductDetail(id)` mediante consultas anidadas de PostgREST (`products -> pages -> price_checks`) resolviendo la lista o el detalle en una única petición de red a Supabase.
- **Actualización de repositorio de pruebas (`server/test/fake-repo.ts`):**
  - Implementar los nuevos métodos en el fake en memoria para mantener los tests herméticos sin Supabase.
- **Integración y ciclo de invalidación en `server/src/routes.ts`:**
  - `GET /api/products`: consulta primero la caché (`'products:list'`); en caso de fallo, consulta el repo y guarda el resultado.
  - `GET /api/products/:id`: consulta la caché (`'products:detail:${id}'`); en caso de fallo, consulta el repo y guarda el resultado.
  - **Invalidación activa:**
    - Al crear/editar/eliminar productos: invalida `'products:list'` y `'products:detail:${id}'`.
    - Al crear/editar/eliminar páginas: invalida `'products:list'` y el detalle del producto padre.
    - Al ejecutar chequeos de scraping (`checkPage` y `checkProduct`): invalida `'products:list'` y el detalle del producto afectado.
- **Caché en cliente (`web/src/api.ts`):**
  - Caché en memoria con TTL de 30 segundos para `listProducts()` y `getProduct(id)`.
  - Invalidación automática en memoria al ejecutar cualquier método mutador (`createProduct`, `updateProduct`, `deleteProduct`, `addPage`, `updatePage`, `deletePage`, `checkPage`, `checkProduct`).
- **Tests unitarios e integración:**
  - `server/test/cache.test.ts`: comprobación de hit, miss, expiración por TTL y métodos de invalidación.
  - Actualización de `server/test/api.test.ts` para verificar que la invalidación funciona correctamente a través de los endpoints HTTP.

**Out of scope (for future specs):**

- Almacén de caché externo distribuido (como Redis o Memcached); el tamaño y tráfico actual de la app funciona óptimamente en la memoria del proceso Fastify.
- Suscripciones en tiempo real mediante Supabase Realtime / WebSockets.
- Persistencia de la caché entre reinicios del servidor en disco.

## Data model

Estructuras en `server/src/repo.ts`:

```ts
export interface ProductSummaryRow extends ProductRow {
  page_count: number;
  last_check_at: string | null;
  best: {
    price: number;
    currency: string | null;
    store: string;
  } | null;
}

export interface ProductDetailRow extends ProductRow {
  pages: Array<PageRow & { last_check: CheckRow | null }>;
}
```

Estructura de la caché en `server/src/cache.ts`:

```ts
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  deletePrefix(prefix: string): void;
  clear(): void;
}
```

Claves de caché estandarizadas:
- `products:list`: listado general de productos.
- `products:detail:<productId>`: detalle de un producto específico con sus páginas y chequeos.

## Implementation plan

1. **Crear utilidad de caché en memoria del backend (`server/src/cache.ts`):**
   - Implementar `MemoryCache` con mapa de entradas y expiración por tiempo (`Date.now()`).
   - Crear suite de tests `server/test/cache.test.ts` verificando `get`, `set`, TTL, `delete` y `deletePrefix`.
2. **Extender interfaz `Repo` y actualizar `fake-repo.ts`:**
   - Añadir `listProductsSummary()` y `getProductDetail(id)` a `Repo` en `server/src/repo.ts`.
   - Implementar la lógica agregada en `server/test/fake-repo.ts` para que los tests unitarios existentes y nuevos compilen y pasen.
3. **Implementar PostgREST Joins en `server/src/repo-supabase.ts`:**
   - Implementar `listProductsSummary()` haciendo un único `.select('*, pages(*, price_checks(*))')` con ordenación y cálculo del mejor precio en memoria.
   - Implementar `getProductDetail(id)` trayendo el producto con sus páginas y sus checks más recientes en una única consulta.
4. **Integrar caché e invalidación activa en `server/src/routes.ts`:**
   - Instanciar la caché para las rutas.
   - Conectar las lecturas (`GET /api/products` y `GET /api/products/:id`) a la caché.
   - Añadir la invalidación en los endpoints de mutación (`POST`, `PUT`, `DELETE`, y `check`).
   - Añadir tests en `server/test/api.test.ts` para validar el comportamiento con caché e invalidación tras mutaciones.
5. **Implementar caché en cliente en `web/src/api.ts`:**
   - Crear mapa en memoria con TTL de 30 segundos para las peticiones GET.
   - Limpiar las claves correspondientes en llamadas mutadoras.
6. **Verificación completa:**
   - Ejecutar `npm run verify` (`typecheck -w server`, `typecheck -w web`, `lint` y `test`).

## Acceptance criteria

- [ ] `npm run verify` pasa limpiamente (TypeScript, ESLint y Vitest sin advertencias ni errores).
- [ ] La caché en memoria (`MemoryCache`) expira los elementos tras su TTL configurado (por defecto 2 minutos).
- [ ] Al llamar a `GET /api/products` por segunda vez dentro del TTL, la respuesta proviene de la caché sin llamar al repositorio.
- [ ] Al invocar un endpoint mutador (`createProduct`, `updateProduct`, `deleteProduct`, `createPage`, `updatePage`, `deletePage`, `runCheck`), la entrada en caché se invalida inmediatamente y la siguiente petición devuelve datos actualizados.
- [ ] Una consulta fría a Supabase para la lista de productos realiza 1 sola petición de red con joins en lugar de múltiples peticiones en bucle.
- [ ] En el frontend (`web/src/api.ts`), navegar entre pantallas dentro de los 30 segundos no vuelve a disparar llamadas HTTP al backend a menos que ocurra una mutación.

## Decisions

- **Sí:** Invalidación activa combinada con TTL (2 minutos en backend, 30s en frontend). Garantiza frescura inmediata de datos ante cambios locales y evita datos obsoletos.
- **Sí:** Joins directos de PostgREST (`select('*, pages(*, price_checks(*))')`). Elimina el N+1 a nivel de base de datos sin requerir migraciones SQL ni alterar el esquema actual de Postgres.
- **Sí:** Caché en memoria pura en el proceso Node.js y en el módulo cliente de React. No añade dependencias pesadas ni infraestructura adicional (no requiere Redis).
- **No:** Cabeceras HTTP `Cache-Control` en el navegador para la API de datos. En una SPA con mutaciones locales, una caché en memoria en `api.ts` permite invalidación precisa e inmediata sin problemas de respuestas cacheadas por el navegador.

## What is **not** in this spec

- Infraestructura externa de caché (Redis, Memcached).
- Suscripciones en tiempo real con WebSockets / Supabase Realtime.
- Persistencia de la caché en disco entre reinicios del servicio.
