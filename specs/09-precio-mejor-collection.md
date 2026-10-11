# SPEC 09 — Mejor precio de producto (columna de precio más bajo)

> **Status:** Implementado
> **Depends on:** SPEC 08-sistema-cache-optimizacion.md, SPEC 07-despliegue-render.md
> **Date:** 2026-10-11
> **Objective:** Agregar una columna a la tabla de productos que muestre el precio más bajo registrado para cada producto junto con la fecha de esa medición, actualizando automáticamente cuando se registran nuevos precios.

## Por qué existe este spec

Actualmente, la API `/api/products` devuelve información sobre productos y sus páginas, pero no muestra el precio más bajo histórico disponible. Los usuarios necesitan saber cuál es el precio mínimo que ha tenido un producto para tomar decisiones de compra informadas. Esta columna proporciona esa visibilidad sin requerir consultas adicionales en tiempo de lectura.

## Scope

**In:**
- Tabla `products` en la base de datos de Supabase
  - Nueva columna `best_price` (decimal) – el precio numérico más bajo registrado para el producto
  - Nueva columna `best_price_at` (timestamptz) – la fecha/hora ISO cuando se registró ese mejor precio
- Interfaces del repositorio para manejar los nuevos campos
- Frontend para mostrar la información en la lista de productos

**Out of scope:**
- No se modifica la estructura de `price_checks` ni se añaden nuevas entidades.
- No se implementan notificaciones o alertas basadas en el mejor precio.
- No se cambia la API de autenticación ni de paginación.

## Data model

### Base de datos

```sql
ALTER TABLE products ADD COLUMN best_price numeric;
ALTER TABLE products ADD COLUMN best_price_at timestamptz;
```

Las nuevas columnas se inicializan con `NULL` para todos los productos. Cuando se registra un nuevo precio en `price_checks`, el backend actualizará estos campos para el producto correspondiente.

### Interfaces del repositorio

```typescript
import type { ProductSummaryRow } from '../src/repo';

interface ProductSummaryRow {
  id: number;
  name: string;
  image_url: string | null;
  created_at: string;
  best_price: number | null;        // Nuevo: precio más bajo
  best_price_at: string | null;     // Nuevo: fecha del mejor precio
}
```

### Frontend

En la vista de lista de productos, se mostrará:
- `best_price` – el precio más bajo (si existe)
- `best_price_at` – la fecha/hora ISO del momento en que se registró ese precio

## Implementation plan

1. ** crear migración SQL** – Agregar las dos columnas a la tabla `products` en Supabase.
2. ** actualizar el repositorio** – Modificar `server/src/repo.ts` para incluir `best_price` y `best_price_at` en las interfaces y asegurar que se lean/escriban correctamente.
3. ** actualizar el frontend** – Modificar `web/src/api.ts` para exponer la información en la API y actualizar `web/src/pages/ProductList.tsx` (o el componente correspondiente) para mostrar el nuevo campo.
4. ** verificación** – Ejecutar `npm run verify` para asegurar que todo compile y passe los tests.

## Acceptance criteria

- [ ] La migración `000X-add-best-price-columns.sql` se crea exitosamente y se aplica sin errores.
- [ ] La tabla `products` tiene las columnas `best_price` (numeric) y `best_price_at` (timestamptz) con valores `NULL` por defecto.
- [ ] El backend puede leer y escribir `best_price` y `best_price_at` a través del repositorio.
- [ ] La API `/api/products` devuelve los nuevos campos en `ProductSummaryRow`.
- [ ] El frontend muestra el precio más bajo y la fecha de registro en la lista de productos.
- [ ] `npm run verify` pasa sin advertencias ni errores.

## Decisions taken and discarded

- **Sí:** Agregar columnas a la base de datos (en lugar de calcular en tiempo de lectura).
  - *Razón:* Es más eficiente y consistente mantener los datos actualizados en la fuente.
- **Sí:** Usar dos columnas (`best_price` + `best_price_at`) en lugar de una columna combinada.
  - *Razón:* Separar el precio del timestamp permite mayor flexibilidad (por ejemplo, podría quererse mostrar el precio más alto también).
- **No:** No implementar un trigger en la base de datos.
  - *Razón:* Los triggers pueden ser difíciles de depurar y mantener en un entorno dinámico. La actualización se hace en la capa de aplicación donde ya se procesan los `price_checks`.
- **No:** Añadir notificaciones o alertas basadas en el mejor precio.
  - *Razón:* Fuera del alcance de este spec; sería un feature separado.

## Identified risks

| Riesgo | Mitigación |
|--------|------------|
| La migración falla si la base de datos está en un estado inconsistente | Se puede aplicar la migración después de una limpieza de datos o en un entorno de staging primero. |
| Los datos históricos de `price_checks` podrían no reflejar el mejor precio actual | La actualización se hace en el backend cuando se insertan/actualizan `price_checks`, asegurando que siempre se mantenga sincronizado. |
| El frontend no muestre la información correctamente | Se seguirán las mismas prácticas de formato y tipado que el resto del código. |

## What is **not** in this spec

- Notifications/alerts based on best price
- Changes to the authentication system
- Database schema changes beyond the two new columns
- Additional indexes (unless needed for query performance)

## Final note

This spec adds persistent storage for the best price per product, which improves the user experience by providing immediate visibility into the lowest price available. The data is kept in sync with the price checking history through application logic, ensuring accuracy without relying on triggers.