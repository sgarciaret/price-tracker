# SPEC 11 — Mejor precio por tienda en detalle

> **Status:** Aprobado  
> **Depends on:** SPEC 09-precio-mejor-collection.md  
> **Date:** 2026-10-11  
> **Objective:** Mostrar en la pantalla de detalle de producto el precio más bajo registrado por cada tienda junto con la fecha de su última ocurrencia.

## Por qué existe este spec

SPEC 09 añadió el mejor precio histórico a nivel de producto y lo muestra en la lista. Los usuarios necesitan la misma visibilidad a nivel de tienda dentro de la pantalla de detalle, para comparar el mínimo alcanzado por cada página sin revisar el historial de checks.

## Scope

**In:**
- Tabla `pages` en Supabase: nuevas columnas `best_price` numeric y `best_price_at` timestamptz.
- Actualización automática de `best_price`/`best_price_at` en `Repo.insertCheck` cuando se registra un nuevo `price_check` válido.
- Extensión de `PageRow` en `server/src/repo.ts` y `Page` en `web/src/api.ts` con `best_price` y `best_price_at`.
- API `GET /api/products/:id` devuelve páginas con los nuevos campos.
- Frontend `ProductDetail.tsx` muestra columna adicional “Mejor precio” antes de “Estado”, con precio mínimo y fecha de su última ocurrencia.
- Invalidación de caché existente al mutar checks.

**Out of scope:**
- No se modifica la columna `best_price`/`best_price_at` de `products`.
- No se cambia la vista de lista de productos.
- No notificaciones/alertas.
- No triggers en base de datos.

## Data model

**Base de datos**
```sql
ALTER TABLE pages ADD COLUMN best_price numeric;
ALTER TABLE pages ADD COLUMN best_price_at timestamptz;
```

**Interfaces**
```ts
// server/src/repo.ts
export interface PageRow {
  id: number;
  product_id: number;
  url: string;
  store: string;
  css_selector: string | null;
  created_at: string;
  best_price: number | null;
  best_price_at: string | null;
}
```
```ts
// web/src/api.ts
export interface Page {
  id: number;
  product_id: number;
  url: string;
  store: string;
  css_selector: string | null;
  created_at: string;
  last_check: Check | null;
  best_price: number | null;
  best_price_at: string | null;
}
```

## Implementation plan

1. Crear migración `supabase/migrations/0003_add_best_price_to_pages.sql`.
2. Actualizar tipos backend `server/src/repo.ts`.
3. Actualizar `server/src/repo-supabase.ts`: extender `toPage` y modificar `insertCheck` para actualizar `best_price`/`best_price_at` de la página; si el precio es igual al mínimo, refrescar `best_price_at` a la fecha más reciente.
4. Actualizar fake repo `server/test/fake-repo.ts`.
5. Actualizar tipos frontend `web/src/api.ts`.
6. Actualizar `web/src/pages/ProductDetail.tsx`: añadir encabezado “Mejor precio” antes de “Estado” y renderizar precio + fecha.
7. Verificar con `npm run verify`.

## Acceptance criteria

- [ ] Migración aplicada y columnas existen en `pages`.
- [ ] `PageRow` y `Page` incluyen los dos campos.
- [ ] `GET /api/products/:id` devuelve `best_price` y `best_price_at` por página.
- [ ] Insertar check con precio menor actualiza ambos campos.
- [ ] Insertar check con precio igual al mínimo actualiza solo `best_price_at` a la fecha más reciente.
- [ ] `ProductDetail` muestra la columna “Mejor precio” con formato correcto.
- [ ] `npm run verify` pasa.

## Decisions taken and discarded

- **Sí:** Persistir en `pages` como en SPEC 09. Razón: consistencia y rendimiento.
- **Sí:** Actualizar en `insertCheck`. Razón: lógica centralizada, sin triggers.
- **Sí:** Fecha de última ocurrencia del mínimo. Razón: decisión del usuario.
- **No:** Calcular en tiempo de lectura. Razón: preferible dato materializado.
- **No:** Trigger DB. Razón: complejidad de mantenimiento.

## Identified risks

| Riesgo | Mitigación |
|--------|------------|
| Migración en producción | Aplicar en staging primero; columnas permiten NULL. |
| Diferentes monedas por página | El campo no guarda moneda; se asume coherencia por página. |
| Incoherencia tras importación masiva | Lógica solo actualiza al insertar; importación inicial requeriría recálculo. |

## What is **not** in this spec

- Cambios en `products.best_price`.
- Modificaciones en lista de productos.
- Notificaciones/alertas.
- Cálculo por demanda.

## Final note

Este spec extiende SPEC 09 al nivel de tienda, aportando visibilidad del precio mínimo histórico por página en la pantalla de detalle y manteniendo la consistencia mediante actualización en `insertCheck`.
