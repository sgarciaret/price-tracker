# SPEC 01 — Rediseño visual de la interfaz con componentes de UI compartidos

> **Status:** Implemented
> **Depends on:** —
> **Date:** 2026-10-03
> **Objective:** Diferenciar visualmente las secciones y elementos de la aplicación y dar apariencia de botón real a todas las acciones, creando una capa de componentes de UI compartidos en `web/src/components/ui/`.

## Por qué existe este spec

Hoy toda la aplicación es fondo blanco con bordes de 1px como única separación. Las acciones secundarias — Renombrar, Eliminar, Comprobar, Selector, Quitar — se renderizan como texto con `hover:underline`, de modo que no se distinguen de un enlace normal. El resultado es una interfaz plana en la que no se ve dónde acaba una sección y empieza la siguiente, ni qué elementos son pulsables.

Este spec introduce una capa de componentes (`Button`, `Card`, `Input`, `Badge`, `Alert`, `EmptyState`) y tokens de diseño en Tailwind 4. Es la primera vez que el proyecto separa el estilo de las páginas, por eso conviene dejarlo constatado en el propio spec.

## Scope

**In:**

- Tokens de diseño en `web/src/index.css` mediante `@theme` de Tailwind 4: color de fondo de página, color de superficie, color de borde, radios, sombras y color de acento.
- Nuevos componentes en `web/src/components/ui/`: `Button.tsx`, `Card.tsx`, `Input.tsx`, `Badge.tsx`, `Alert.tsx`, `EmptyState.tsx`.
- Restyle de la cabecera en `web/src/main.tsx`: fondo diferenciado del área de contenido y separación por sombra o borde.
- Enlace "← Volver" en la cabecera de `web/src/pages/ProductDetail.tsx`.
- Restyle completo de `web/src/pages/ProductList.tsx`: formulario, tarjetas de producto, errores y estado vacío.
- Restyle completo de `web/src/pages/ProductDetail.tsx`: cabecera, formulario de añadir página, tabla de páginas y fila de acciones.
- Título de sección visible sobre la tabla de páginas: `Comparación de precios`.
- Todas las acciones existentes pasan a ser `<button>` con fondo y borde visibles: `Añadir producto`, `Añadir página`, `Comprobar todas`, `Renombrar`, `Eliminar`, `Comprobar`, `Selector`, `Quitar`.
- Estados `disabled`, `loading` y `focus-visible` en los botones.

**Out of scope (for future specs):**

- Modo oscuro. Necesita tokens semánticos y un toggle con persistencia; va en su propio spec si algún día se quiere.
- Iconos o librería de iconos (`lucide-react` u otra). Añadiría una dependencia de npm.
- Sustituir `prompt()` y `confirm()` por modales propios. El comportamiento de esos diálogos no cambia en este spec.
- Títulos de sección fuera de la tabla. El usuario decidió que solo la tabla lleve título.
- Cambios en backend, API o base de datos. Todo el spec es frontend.
- Nuevas dependencias de npm.
- Gráficos de evolución de precios.
- Configurar un runner de tests.

## Data model

Este spec no introduce datos nuevos. No cambia `products`, `pages` ni `price_checks`, ni el contrato de `web/src/api.ts`.

La única estructura nueva es el tipo de variante del botón, que vive en `web/src/components/ui/Button.tsx` y no se persiste:

```ts
type ButtonVariant = 'primary' | 'secondary' | 'danger';
```

## Implementation plan

1. Añadir los tokens de diseño en `web/src/index.css`: bloque `@theme` con `--color-page`, `--color-surface`, `--color-border`, `--color-accent` y sombras; aplicar `--color-page` al `body`. Verificación: `npm run typecheck -w web` y la app sigue cargando con fondo de página gris claro.

2. Crear `web/src/components/ui/Button.tsx` con las variantes `primary` / `secondary` / `danger`, tamaños `sm` / `md`, y soporte para `disabled` y `loading`. Verificación: typecheck en verde; todavía no se usa en ninguna página.

3. Crear `web/src/components/ui/Card.tsx` y `web/src/components/ui/Input.tsx`. Verificación: typecheck en verde.

4. Crear `web/src/components/ui/Alert.tsx`, `web/src/components/ui/EmptyState.tsx` y `web/src/components/ui/Badge.tsx`. Verificación: typecheck en verde.

5. Restyle de la cabecera en `web/src/main.tsx`: fondo diferenciado del contenido y separación por sombra. Verificación: en el navegador el header se distingue del área principal.

6. Restyle de `web/src/pages/ProductList.tsx`: `Card` para las tarjetas de producto, `Input` y `Button primary` para el formulario, `Alert` para errores, `EmptyState` para "Todavía no hay productos". Verificación: crear un producto y ver el estado vacío con la nueva estética.

7. Restyle de la cabecera de `web/src/pages/ProductDetail.tsx`: enlace "← Volver" a `/`, `Button secondary` para Renombrar, `Button danger` para Eliminar, `Button primary` para Comprobar todas. Verificación: los tres botones se ven con fondo y borde; Renombrar y Eliminar siguen abriendo `prompt()` y `confirm()`.

8. Restyle del formulario de añadir página en `web/src/pages/ProductDetail.tsx`: `Card`, `Input` para URL y selector, `Button primary` para "Añadir página". Verificación: añadir una página sigue funcionando y dispara la comprobación.

9. Restyle de la tabla en `web/src/pages/ProductDetail.tsx`: título `Comparación de precios` sobre la tabla, `Card` como contenedor, cabecera con fondo diferenciado, `Badge` para los estados, resaltado de la fila mejor precio y `EmptyState` para "sin páginas". Verificación: abrir un producto con páginas y ver la tabla con la nueva estética.

10. Fila de acciones de la tabla: `Button secondary` para Comprobar y Selector, `Button danger` para Quitar, todos en tamaño `sm`. Verificación: pulsar cada uno y confirmar que la acción original sigue funcionando.

11. Pulido final: anillo `focus-visible` en todos los botones, estados `disabled` durante las comprobaciones y comprobación de que la tabla sigue siendo desplazable en horizontal en pantallas estrechas. Verificación: navegar toda la interfaz con Tab y ver el anillo en cada botón.

## Acceptance criteria

- [x] `npm run typecheck -w web` termina sin errores.
- [x] `npm run build` termina sin errores.
- [x] El fondo de la página no es blanco puro y las tarjetas blancas se separan de él visualmente.
- [x] `Añadir producto`, `Añadir página` y `Comprobar todas` se renderizan con la variante `primary` (fondo azul, texto blanco).
- [x] `Renombrar`, `Comprobar` y `Selector` se renderizan con la variante `secondary` (fondo claro, borde visible).
- [x] `Eliminar` y `Quitar` se renderizan con la variante `danger` (fondo rojo claro, texto rojo).
- [x] Ninguna acción de la interfaz se muestra como texto plano con `hover:underline`.
- [x] Cada botón muestra un anillo visible al enfocarlo con Tab.
- [x] Los botones deshabilitados (`Comprobar todas` con 0 páginas, `Comprobar` mientras se comprueba) se ven deshabilitados.
- [x] La cabecera tiene un fondo distinto del área de contenido y se separa de ella con sombra o borde.
- [x] La página de detalle muestra un enlace "← Volver" que lleva a `/`.
- [x] La tabla de páginas tiene un título visible por encima.
- [x] Los estados `ok`, `not_found`, `blocked` y `error` de la columna Estado se muestran como `Badge` con colores diferenciados.
- [x] Los mensajes de error se muestran dentro de una caja de alerta con fondo y borde, no como párrafo rojo suelto.
- [x] Los estados vacíos ("Todavía no hay productos", "Añade páginas de tiendas") se muestran dentro de un recuadro con borde punteado.
- [x] `prompt()` de Renombrar y Selector sigue abriéndose; `confirm()` de Eliminar y Quitar sigue abriéndose.
- [x] No se ha añadido ninguna dependencia de npm.
- [x] No hay cambios en `server/` ni en `data/prices.db`.
- [x] La tabla sigue envolviéndose en `overflow-x-auto` en pantallas estrechas.

## Decisions

- **Sí:** componentes compartidos en `web/src/components/ui/`. Un cambio de estilo de botón se hace en un solo sitio; hoy el mismo string está repetido en 8 sitios.
- **Sí:** tokens con `@theme` de Tailwind 4 en `web/src/index.css`. Es la forma nativa de la v4 y evita colores mágicos repartidos por los componentes.
- **Sí:** tres variantes de botón (`primary` / `secondary` / `danger`). Da jerarquía: crear y comprobar son acciones principales, configurar es secundaria, borrar es destructiva.
- **Sí:** mantener el azul actual (`blue-600`) como acento. Ya está en uso, no rompe nada y el usuario lo eligió explícitamente.
- **Sí:** botones compactos con borde en las filas de la tabla, en lugar de iconos o menú desplegable. Legibles sin dependencias y sin lógica de estado nueva.
- **Sí:** título de sección solo sobre la tabla. Decisión del usuario: el resto de bloques se diferencian por fondo y espaciado.
- **Sí:** fondo diferenciado en la cabecera más enlace "← Volver" en el detalle.
- **Sí:** el nombre de la tienda en la tabla sigue siendo un enlace con `hover:underline`. Es navegación a la tienda externa, no una acción; los enlaces deben parecer enlaces (decisión tomada en la revisión del criterio 7).
- **No:** modo oscuro. Duplicaría los tokens y añadiría un toggle con persistencia; se queda para otro spec.
- **No:** librería de iconos. El texto de las acciones ya es explícito y se evita una dependencia.
- **No:** modales propios para Renombrar / Selector / Eliminar. Se estiliza el botón, no se toca el comportamiento. Sustituir `prompt()` y `confirm()` es un spec aparte.
- **No:** renombrar `blue-600` en el `@theme`. Se definen tokens nuevos con nombre propio para no alterar las clases Tailwind existentes.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| Tres botones por fila ensanchan la tabla y provocan corte en pantallas estrechas | Mantener el envoltorio `overflow-x-auto` actual y aplicar `whitespace-nowrap` a la celda de acciones. |
| Definir `--color-blue-600` en `@theme` cambiaría sin querer todas las clases `bg-blue-600` existentes | Los tokens usan nombres propios (`--color-surface`, `--color-accent`) y no sobreescriben la paleta por defecto. |
| Los componentes creados en los pasos 2–4 no se usan hasta los pasos 6–10 | Es esperado; cada paso pasa typecheck y build, y la app arranca en cada uno. |

## What is **not** in this spec

- Modo oscuro.
- Iconos en los botones.
- Modales propios que sustituyan a `prompt()` y `confirm()`.
- Títulos de sección fuera de la tabla.
- Cambios en backend, API o base de datos.
- Nuevas dependencias de npm.

Cada uno de esos, si llega algún día, va en su propio spec.
