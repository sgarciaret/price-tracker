# SPEC 10 — Refuerzo anti-bloqueo y bypass de Render para scraping

> **Status:** Aprobado
> **Depends on:** SPEC 07-despliegue-render.md, SPEC 08-sistema-cache-optimizacion.md
> **Date:** 2026-10-11
> **Objective:** Mejorar el pipeline de scraping del backend para evitar los errores HTTP 403 (tienda bloquea el acceso) en entornos cloud (Render) mediante listas blancas de dominios que omiten el fetch estático y reintentos con retardo aleatorio.

## Por qué existe este spec

Al ejecutar la aplicación desplegada en Render, tiendas como Carrefour devuelven un error HTTP 403 debido a la detección de IPs de centros de datos y peticiones estáticas directas. Actualmente, el scraper intenta un `fetch` estático plano que es bloqueado de inmediato antes de recurrir a Playwright. Este spec introduce una estrategia robusta basada en omitir el paso estático para dominios protegidos conocidos y añadir reintentos inteligentes con retardo aleatorio.

## Scope

**In:**
- Actualización del módulo `server/src/scraper/fetcher.ts` y `server/src/scraper/index.ts`
- Implementación de una lista de dominios protegidos conocidos (ej. `carrefour.es`, etc.) que omiten el intento estático (`fetchStatic`) y ejecutan directamente el navegador (`fetchWithBrowser`).
- Mecanismo de reintento único con un retardo aleatorio configurable (jitter) ante respuestas de bloqueo antes de registrar el fallo definitivo.
- Refuerzo de las opciones de contexto en Playwright (`sec-ch-ua`, headers adicionales y control de huellas para evitar detección de automatización).

**Out of scope:**
- Uso de servicios de pago externos de proxies residenciales o APIs de terceros.
- Cambios inútiles en el frontend o en las rutas de la API (la interfaz solo reflejará los nuevos éxitos o un estado más preciso).

## Data model

*No se introducen nuevas entidades ni cambios en la base de datos de Supabase.*

## Implementation plan

1. **Configuración de dominios protegidos y constantes:** Definir una lista de dominios en el scraper que requieran ejecución directa por navegador (`fetchWithBrowser`).
2. **Refuerzo de Playwright:** Ampliar `fetchWithBrowser` en `server/src/scraper/fetcher.ts` con cabeceras HTTP avanzadas (`sec-ch-ua`, `sec-fetch-dest`, etc.) y ocultación de `navigator.webdriver`.
3. **Lógica de reintento y omisión estática:** Ajustar `checkUrl` en `server/src/scraper/index.ts` para que compruebe si el dominio está en la lista protegida (saltando el `fetch` estático) y añadir un reintento con retardo aleatorio ante códigos de bloqueo (403/429).
4. **Verificación y Pruebas:** Ejecutar tests unitarios y de integración del backend (`npm test`) y verificar el comportamiento de scraping mediante la CLI de prueba (`npm run try -w server -- <url>`).

## Acceptance criteria

- [ ] Los dominios configurados como protegidos omiten el intento estático y utilizan Playwright directamente.
- [ ] Ante una respuesta de bloqueo, el sistema aplica un reintento con retardo aleatorio antes de fallar.
- [ ] Las cabeceras y opciones de Playwright se envían correctamente para reducir falsos positivos de bloqueo en Render.
- [ ] Todos los tests existentes del backend pasan satisfactoriamente sin regresiones.

## Decisions taken and discarded

- **Descartado:** Uso de proxies residenciales de pago debido a la regla del usuario de descartar la opción 3 por costes y complejidad externa.
- **Tomado:** Lista blanca de dominios y omisión de fetch estático como solución directa, ligera y 100% interna.

## Identified risks

- **Riesgo:** Que algunas tiendas actualicen sus sistemas anti-bot y sigan bloqueando el navegador headless de Playwright en Render.
- **Mitigación:** Las mejoras en las cabeceras y la supresión de la huella de automatización reducen significativamente este riesgo.
