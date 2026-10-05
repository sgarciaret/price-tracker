# SPEC 05 — Pantalla de login y autenticación del administrador

> **Status:** Aprobado
> **Depends on:** SPEC 04
> **Date:** 2026-10-05
> **Objective:** Añadir una única pantalla de login (solo Admin Username y Admin password, sin registro ni recuperación) que proteja tanto las pantallas de React como todos los endpoints de la API, con sesión basada en cookie httpOnly y credenciales leídas de `.env`.

## Por qué existe este spec

Hoy la aplicación no tiene ningún tipo de autenticación: cualquiera que abra `http://127.0.0.1:3001` (o `:5173` en desarrollo) ve la lista de productos, crea, edita y borra, y cualquier cliente puede llamar directamente a `GET /api/products`. No hay sesión, ni usuarios, ni variables de entorno de seguridad: `server/src/index.ts` solo lee `PORT`.

El cierre tiene que ser por ambos lados. Proteger solo React con un guard es cosmético: la API seguiría abierta a `curl`. Proteger solo la API dejaría la pantalla inicial visible. Por eso este spec añade (1) `POST /api/auth/login` que valida contra `ADMIN_USERNAME`/`ADMIN_PASSWORD` de `.env` y crea una cookie httpOnly, (2) un hook de Fastify que exige esa cookie en todos los endpoints `/api`, y (3) un guard de rutas en React que manda a `/login` a quien no esté autenticado. Un único administrador, un único secreto: no hay registro, ni recuperación de contraseña, ni cambio de contraseña.

## Scope

**In:**

- `server/src/env.ts` nuevo con `loadDotenv()`: lee `../../.env` con `process.loadEnvFile()` (nativo de Node, sin `dotenv`), tolerando que el fichero no exista. Se invoca al inicio de `server/src/index.ts`, antes de `buildApp()`.
- `server/src/auth.ts` nuevo: `getCredentials()` (lectura perezosa de `process.env.ADMIN_USERNAME`/`ADMIN_PASSWORD`), `verifyCredentials()` con `crypto.timingSafeEqual`, store de sesiones en memoria (`Map<token, expiraEn>`), `parseCookies()` y constantes `SESSION_COOKIE = 'pt_session'` y `SESSION_TTL_MS = 7 días`.
- Tres endpoints nuevos en `server/src/routes.ts`:
  - `POST /api/auth/login` → `{ username, password }` → `200` + `Set-Cookie: pt_session=…; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`; `401` con `{ error: 'Usuario o contraseña incorrectos' }` si no coinciden (o si faltan las variables en `.env`).
  - `POST /api/auth/logout` → `204` y borra la cookie y la sesión.
  - `GET /api/auth/session` → `200` con `{ authenticated: boolean }` (no exige sesión, para que el frontend compruebe el estado sin bucles de redirección).
- Hook `onRequest` en `routes.ts` (registrado **antes** que ninguna ruta): toda petición a `/api/*` que no sea `login`, `logout` o `session` y no lleve una cookie de sesión válida responde `401 { error: 'No autenticado' }`.
- `web/src/api.ts`: métodos `login`, `logout` y `session`; en `req()`, un `401` notifica a un manejador registrado (`setOnUnauthorized`) y lanza `Error('Sesión caducada')`.
- `web/src/auth.tsx` nuevo: `AuthProvider` + `useAuth()` con `status: 'checking' | 'authenticated' | 'guest'`, `login()` y `logout()`; y el guard `RequireAuth` que redirige a `/login` con `state.from` preservando la ruta original.
- `web/src/pages/Login.tsx` nueva: tarjeta centrada con `Card`, `Input` con label **Admin Username**, `Input type="password"` con label **Admin password**, `Button` con estado `loading` y `Alert` para el error. Reutiliza `Card`, `Input`, `Button` y `Alert` de SPEC 01, sin estilos nuevos.
- `web/src/main.tsx`: `AuthProvider` envolviendo el `BrowserRouter`; ruta `/login`; `/` y `/products/:id` envueltas en `RequireAuth`; botón «Cerrar sesión» en el header (solo visible autenticado).
- Redirecciones: no autenticado en `/` o `/products/:id` → `/login`; autenticado en `/login` → `/`; tras el login → a la ruta original (`state.from`) o `/`; un `401` de cualquier API → `/login`.
- Tests: `ADMIN_USERNAME`/`ADMIN_PASSWORD` de prueba en `server/vitest.config.ts`, login en `beforeAll` de `api.test.ts` reutilizando la cookie en todos los `inject`, y suite nueva de autenticación.
- Documentación: `README.md` y `AGENTS.md` con las variables `.env` requeridas y las rutas nuevas.

**Out of scope (for future specs):**

- Registro de usuarios, recuperación de contraseña, cambio de contraseña, múltiples usuarios o roles.
- Botón «Recuérdame», caducidad configurable por variable de entorno o sesión persistida en la base de datos.
- Rate limiting / bloqueo por intentos fallidos de login.
- Cookies `Secure` / HTTPS (la app es `http` en localhost).
- Proteger los ficheros estáticos: `index.html` y los assets siguen siendo públicos; lo que se protege es la API y las rutas se guardan en el cliente.
- Tests de componentes React y e2e (siguen fuera del alcance, como en SPEC 04). La verificación del frontend es manual.
- Cambios en el esquema de `data/prices.db`.
- Nuevas dependencias de npm.

## Data model

No hay datos persistidos nuevos: las sesiones viven en memoria y el esquema de SQLite no cambia.

```ts
// server/src/auth.ts
const SESSION_COOKIE = 'pt_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const sessions = new Map<string, number>(); // token -> fecha de caducidad (epoch ms)

getCredentials(): { username: string; password: string } | null; // null si .env no define ambas
verifyCredentials(username: string, password: string): boolean;   // timingSafeEqual
createSession(): string;                                          // randomBytes(32).toString('base64url')
isValidSession(token: string | undefined): boolean;               // y purga caducadas
destroySession(token: string): void;
parseCookies(header?: string): Record<string, string>;             // parseo manual, sin dependencias
```

Contrato de la API:

| Método | Ruta | Exige sesión | Éxito | Error |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | no | `200` + `Set-Cookie` | `401 { error: 'Usuario o contraseña incorrectos' }` |
| POST | `/api/auth/logout` | no | `204` + cookie caducada | — |
| GET | `/api/auth/session` | no | `200 { authenticated: boolean }` | — |
| resto | `/api/*` | **sí** | como hasta ahora | `401 { error: 'No autenticado' }` |

Estado del frontend:

```ts
// web/src/auth.tsx
type AuthStatus = 'checking' | 'authenticated' | 'guest';
useAuth(): { status: AuthStatus; login(u: string, p: string): Promise<void>; logout(): Promise<void> };
```

- `checking`: mientras `GET /api/auth/session` no responde → se muestra «Comprobando sesión…», sin parpadear el contenido ni redirigir.
- `guest`: `RequireAuth` hace `<Navigate to="/login" state={{ from }} replace />`.
- `authenticated`: rutas visibles y botón «Cerrar sesión» en el header.

Variables de entorno (fichero `.env`, ya en `.gitignore`):

| Variable | Ejemplo actual | Comportamiento si falta |
| --- | --- | --- |
| `ADMIN_USERNAME` | `sadmin` | El servidor arranca; todo intento de login responde `401` y el detalle se escribe en el log. |
| `ADMIN_PASSWORD` | `Keep7Admin¿` | Igual. La lectura es UTF-8 (`process.loadEnvFile`), la `¿` llega intacta. |

## Implementation plan

1. `server/src/env.ts` con `loadDotenv()` (`process.loadEnvFile` sobre `<raíz>/.env` dentro de `try/catch` que solo avisa si no existe) y su llamada al inicio de `server/src/index.ts`, antes de `buildApp()`. Verificación: `npm run typecheck -w server` en verde y un login real en el paso 3 confirma que las credenciales del `.env` se leen.

2. `server/src/auth.ts` con las funciones de la tabla anterior. `getCredentials()` lee `process.env` **en cada llamada** (no al cargar el módulo), para que los tests puedan fijar o retirar credenciales. Verificación: `npm run typecheck -w server` en verde.

3. Endpoints `login`, `logout` y `session` en `routes.ts` y el hook de protección registrado al principio de `routes()`, con la lista de rutas exentas. Verificación: `npm run dev` y con `curl -i -X POST http://127.0.0.1:3001/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"sadmin\",\"password\":\"Keep7Admin¿\"}"` → `200` con `Set-Cookie` y `HttpOnly`; con credenciales falsas → `401`; `curl -i http://127.0.0.1:3001/api/products` sin cookie → `401`.

4. Tests: `ADMIN_USERNAME`/`ADMIN_PASSWORD` de prueba en `server/vitest.config.ts`, helper de login en `beforeAll` de `api.test.ts` (captura la cabecera `set-cookie` y la reenvía en cada `inject`) y suite `autenticación` con los casos de los criterios de aceptación. Verificación: `npm test` en verde y `git status` limpio.

5. `web/src/api.ts`: `login`, `logout`, `session`, el registro del manejador de `401` y su invocación en `req()`. Verificación: `npm run typecheck -w web` en verde.

6. `web/src/auth.tsx`: `AuthProvider` (comprueba la sesión al montar, expone `login`/`logout`), `useAuth()` y `RequireAuth`. Verificación: typecheck en verde.

7. `web/src/pages/Login.tsx` con el formulario de dos campos, estado `loading` en el botón, `autoComplete="username"`/`"current-password"` y `Alert` con el error devuelto. Verificación: typecheck en verde; se ve alineada con el resto de la app.

8. `web/src/main.tsx`: `AuthProvider`, ruta `/login`, guards en `/` y `/products/:id`, redirección de `/login` a `/` si ya hay sesión, y botón «Cerrar sesión» en el header. Verificación: repaso manual de todos los criterios de aceptación en el navegador con `npm run dev`.

9. Verificación de producción: `npm run build && npm start` y comprobar que `/login` y `/products/1` cargan por URL directa (SPA fallback) y que la protección funciona también en `:3001`.

10. Documentación: `README.md` y `AGENTS.md` con las variables `.env`, las rutas de auth y la nota de que los tests inyectan sus propias credenciales. Verificación: `npm run verify` y `npm run build` en verde.

## Acceptance criteria

- [ ] Abrir `http://127.0.0.1:3001` (o `:5173` en dev) sin sesión redirige a `/login`.
- [ ] Abrir `http://127.0.0.1:3001/products/3` sin sesión redirige a `/login`.
- [ ] `/login` muestra un formulario con exactamente dos campos, etiquetados «Admin Username» y «Admin password», más el botón de entrada; no hay enlaces ni flujos de registro ni de recuperación de contraseña.
- [ ] La pantalla de login usa los mismos componentes (`Card`, `Input`, `Button`, `Alert`) y tokens de estilo que el resto de la app.
- [ ] Con credenciales correctas se entra y se redirige a la ruta original desde la que se llegó al login (o a `/` si se llegó escribiendo la URL).
- [ ] Con credenciales incorrectas aparece «Usuario o contraseña incorrectos» y no se cambia de pantalla.
- [ ] Recargar la pestaña estando autenticado no vuelve a pedir las credenciales.
- [ ] Volver atrás desde `/products/:id` con «← Volver» mantiene la sesión.
- [ ] El botón «Cerrar sesión» está en el header solo cuando hay sesión; al pulsarlo se vuelve a `/login` y la ruta anterior ya no es accesible.
- [ ] Estando en `/login` con sesión iniciada, navegar a `/login` lleva a `/`.
- [ ] `GET /api/products` sin cookie responde `401 { error: 'No autenticado' }`; con cookie responde `200`.
- [ ] `POST /api/auth/login` con credenciales válidas devuelve `200` y una cabecera `Set-Cookie` con `HttpOnly`.
- [ ] `POST /api/auth/login` con credenciales inválidas devuelve `401` y no crea sesión.
- [ ] Si `ADMIN_USERNAME` o `ADMIN_PASSWORD` no están en el entorno, el servidor arranca pero el login responde `401` y el log del servidor avisa de la configuración ausente.
- [ ] `GET /api/auth/session` devuelve `200 { authenticated: true }` con sesión y `false` sin ella.
- [ ] Una cookie manipulada o caducada responde `401` en los endpoints protegidos.
- [ ] La cookie de sesión no es legible desde JavaScript (httpOnly) y el frontend no almacena token alguno en `localStorage`/`sessionStorage` (salvo el orden de la lista de SPEC 02).
- [ ] Si el backend devuelve `401` con la sesión caducada, el frontend redirige a `/login` sin dejar un error suelto en la página.
- [ ] `npm run verify` (typecheck + lint + tests) termina en verde.
- [ ] `npm run build && npm start` funciona y `/login` se carga por URL directa.
- [ ] Los tests no abren `data/prices.db` ni hacen red, y `git status` queda limpio tras `npm test`.
- [ ] Ninguna credencial aparece en el bundle del frontend ni en el repositorio (`.env` sigue en `.gitignore`).

## Decisions

- **Sí:** hook de autenticación en el backend para **todos** los `/api`. **No:** solo guard en React, porque el guard es cosmético si la API sigue abierta.
- **Sí:** cookie httpOnly con token aleatorio de 32 bytes guardado en un `Map` en memoria. **No:** token en `localStorage` (legible desde JS, expuesto a XSS). **No:** cookie firmada con la contraseña como secreto: el token aleatorio no se puede forjar y se puede revocar al instante con logout.
- **Sí:** sesiones en memoria, sin tocar SQLite. **No:** tabla `sessions`: sería esquema nuevo para una app local de un solo usuario. Coste aceptado: reiniciar el servidor cierra la sesión y hay que volver a entrar.
- **Sí:** TTL de 7 días fijo, `Max-Age=604800`. **No:** caducidad configurable por `.env` ni «recuérdame»: no lo pide nadie y amplía la superficie a probar.
- **Sí:** parseo manual de la cabecera `cookie` (~10 líneas). **No:** `@fastify/cookie` ni `dotenv`: solo hay una cookie y existe `process.loadEnvFile`, así que **este spec no añade dependencias**.
- **Sí:** `process.loadEnvFile` llamado desde `index.ts`. **No:** desde `app.ts`: los tests importan `buildApp()` y no deben cargar el `.env` real (sus credenciales vienen de `vitest.config.ts`).
- **Sí:** lectura perezosa de `process.env` dentro de `getCredentials()`. **No:** cachear al importar el módulo: rompería los tests que retiran credenciales temporalmente.
- **Sí:** `crypto.timingSafeEqual` para comparar. **No:** `===` directo sobre la contraseña.
- **Sí:** `GET /api/auth/session` devuelve `200 { authenticated }` sin exigir sesión. **No:** devolver `401`, que dispararía el manejador de sesión caducada justo al comprobar si hay sesión.
- **Sí:** mismo mensaje «Usuario o contraseña incorrectos» para usuario malo, contraseña mala y configuración ausente. **No:** revelar cuál de los tres falla; el detalle va al log del servidor.
- **Sí:** hook registrado al **principio** de `routes()`, antes que las rutas. **No:** al final: Fastify aplica los hooks del contexto a las rutas registradas después, y un hook tardío no cubriría nada.
- **Sí:** etiquetas en inglés «Admin Username» y «Admin password», tal como pidió el usuario, manteniendo el resto de la interfaz en español.
- **Sí:** el manejador de `401` se registra desde `AuthProvider` hacia `api.ts` (`setOnUnauthorized`). **No:** `api.ts` importando `auth.tsx`, que crearía un ciclo de imports.
- **Sí:** el guard muestra «Comprobando sesión…» mientras dura la comprobación inicial. **No:** asumir `guest` al arrancar, que mandaría a `/login` a un usuario con sesión válida y crearía un parpadeo.
- **Sí:** los tests existentes se autentican en `beforeAll`. **No:** `buildApp({ auth: false })`: los CRUD se probarían con la seguridad apagada y no cubriríamos el `401` real.
- **Sí:** depende de SPEC 04: se apoya en `buildApp()`, la suite con `app.inject()` y el `verify` ampliado.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| La cookie no llega en desarrollo porque React vive en `:5173` y la API en `:3001` | Vite proxya `/api`, así que el navegador ve la petición como same-origin y la cookie se envía y se recibe sin `credentials: 'include'`. Se verifica en el navegador con `npm run dev` en el paso 8. |
| El hook de Fastify no cubre algunas rutas | Se registra al inicio de `routes()` y se prueba con `curl`/`inject` el `401` en `GET /api/products` y en las rutas anidadas (`/api/pages/:id/check`). |
| Los tests existentes fallan masivamente con `401` | Login en `beforeAll` con credenciales de `vitest.config.ts` y helper que inyecta la cookie; criterio de aceptación con `npm run verify` en verde. |
| La contraseña contiene `¿` (UTF-8) y se lee mal | `process.loadEnvFile` lee UTF-8; el paso 3 prueba el login real con la credencial del `.env`. |
| Reiniciar el servidor deja a todos sin sesión | Comportamiento aceptado en una app local: solo implica volver a pasar por `/login`. Documentado en Decisions. |
| El frontend entra en bucle de redirecciones con un `401` | `/api/auth/session` no devuelve `401`; el manejador solo cambia el estado a `guest` y `RequireAuth` redirige una vez con `replace`. |
| `StrictMode` duplica la comprobación de sesión al montar | La llamada es de solo lectura e idempotente; se comprueba en dev que no genera peticiones en bucle. |
| Fuga de credenciales al bundle del cliente | Las credenciales solo viajan en el body del login y se comparan en el servidor; nada de esto se importa desde `web/`. |

## What is **not** in this spec

- Registro, recuperación y cambio de contraseña; múltiples usuarios o roles.
- «Recuérdame», TTL configurable y sesiones persistidas en la base de datos.
- Rate limiting o bloqueo por intentos fallidos.
- HTTPS y cookies `Secure`.
- Proteger los ficheros estáticos de la app.
- Tests de componentes React y tests e2e.
- Nuevas dependencias de npm y cambios en el esquema de `data/prices.db`.

Cada uno de esos, si llega algún día, va en su propio spec.
