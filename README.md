# Seguidor de precios

App local para comparar el precio de un producto en varias tiendas.

## Requisitos
- Node 24+ (usa `node:sqlite`). La versión mínima está declarada en `engines` del `package.json` raíz y fijada en `.nvmrc` (si usas nvm, `nvm use` la instala).

## Instalación
```
npm install
npx playwright install chromium
```

## Verificación
```
npm run verify
```
Ejecuta el typecheck de `server` y de `web` en un solo paso.

## Uso
- Desarrollo: `npm run dev` y abrir http://localhost:5173 (la API corre en el puerto 3001).
- Producción local: `npm run build` y después `npm start`. Abrir http://localhost:3001

Los datos se guardan en `data/prices.db`.

## Cómo se obtiene el precio
1. Se descarga la página con `fetch`. Si no se encuentra el precio, se abre con Chromium (Playwright).
2. Se busca el precio en este orden: selector CSS propio de la página, JSON-LD, microdata, meta tags, selectores conocidos (Amazon, eBay, AliExpress) y, por último, una heurística con regex.
3. Estados posibles: `ok`, `not_found` (conviene añadir un selector), `blocked` (la tienda bloquea el acceso) y `error`.

Para probar una URL desde la terminal:
```
npm run try -w server -- <url> [selector]
```
