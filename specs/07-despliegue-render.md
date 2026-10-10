# SPEC 07 — Despliegue en Render con Docker

> **Status:** Implementado
> **Depends on:** SPEC 06
> **Date:** 2026-10-07
> **Objective:** Configurar el empaquetado Docker y los ajustes de red para desplegar la aplicación completa (backend Fastify, frontend React y Playwright) en el plan gratuito de Render.

## Por qué existe este spec

La aplicación hoy solo corre en local (`127.0.0.1:3001` / `5173`). La base de datos y la autenticación ya están alojadas en la nube en Supabase (SPEC 06), por lo que el siguiente paso natural es alojar el servidor y la interfaz web en una plataforma accesible desde cualquier navegador.

Render ofrece un plan gratuito para *Web Services* con soporte nativo de Docker. Empaquetar la aplicación en un contenedor Docker multi-stage garantiza que todas las dependencias del sistema operativo necesarias para que Playwright ejecute Chromium funcionen de forma reproducible y sin fricción.

## Scope

**In:**

- `Dockerfile` multi-stage en la raíz del repositorio:
  - Etapa de construcción: compila la aplicación web (`npm run build -w web`) generando `web/dist`.
  - Etapa de producción: basada en la imagen oficial `mcr.microsoft.com/playwright:v1.49.0-noble` (o equivalente con Node 24 y dependencias de Chromium preinstaladas), instala dependencias de producción y expone el puerto.
  - Comando de arranque: ejecuta `npm run start -w server`, el cual ya sirve tanto la API Fastify como los estáticos de `web/dist`.
- `.dockerignore` en la raíz: excluye `node_modules`, `.env`, `.git`, `data/`, etc., para optimizar el contexto de compilación.
- `render.yaml` en la raíz (Render Blueprint):
  - Definición del servicio web (`type: web`, `env: docker`, `plan: free`).
  - Declaración de variables requeridas (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` con `sync: false`) y variables predeterminadas (`NODE_ENV: production`, `PORT: 3001`).
- `server/src/index.ts`:
  - Cambiar el binding de host fijo de `127.0.0.1` a `process.env.HOST ?? '0.0.0.0'`.
- `server/src/routes.ts`:
  - En la función generadora de cookies de sesión (`sessionCookie` y `clearedCookie`), añadir la directiva `; Secure` cuando `process.env.NODE_ENV === 'production'`.
- `server/src/app.ts`:
  - Adaptar o flexibilizar la configuración de CORS para permitir peticiones del mismo host de producción o el dominio asignado por Render.
- Documentación:
  - `README.md` y `AGENTS.md`: Guía de despliegue en Render (mediante el Blueprint `render.yaml` y configuración manual en el panel), checklist de variables de entorno y nota sobre el comportamiento de suspensión por inactividad a los 15 minutos.

**Out of scope (for future specs):**

- Persistencia de sesiones en base de datos o Redis (se asume que si el contenedor se duerme por inactividad tras 15 min, el usuario se vuelve a autenticar al despertar).
- Tareas programadas de scraping en segundo plano (cron jobs en Render).
- Dominio personalizado propio (se usa el subdominio gratuito `*.onrender.com`).
- Escalado horizontal o réplicas múltiples.

## Data model

Esta funcionalidad no introduce nuevas entidades en la base de datos ni altera el esquema de Supabase.

## Implementation plan

1. **Ajustes de red y cookies en el servidor:**
   - Modificar `server/src/index.ts` para escuchar en `process.env.HOST ?? '0.0.0.0'`.
   - Modificar `server/src/routes.ts` para condicionar `; Secure` al entorno de producción.
   - Ajustar CORS en `server/src/app.ts` si fuera necesario.
   - Verificar que los tests unitarios (`npm test`) y la verificación (`npm run verify`) sigan pasando en local sin cambios de comportamiento en desarrollo.
2. **Crear `.dockerignore` y `Dockerfile`:**
   - Crear `.dockerignore` con las exclusiones habituales.
   - Crear el `Dockerfile` multi-stage con build de Vite y ejecución de Fastify + Playwright.
   - Probar la construcción local del contenedor (`docker build -t price-tracker .`).
   - Probar el arranque local del contenedor pasando las credenciales de Supabase y validar el acceso a la web y un test de scraping.
3. **Crear `render.yaml`:**
   - Escribir la configuración de Blueprint de Render con el plan `free` y las variables de entorno necesarias.
4. **Actualizar documentación:**
   - Reflejar en `README.md` y `AGENTS.md` los comandos de Docker, la arquitectura de despliegue y las instrucciones para desplegar en Render.

## Acceptance criteria

- [ ] `npm run verify` pasa limpiamente (typecheck de server y web, lint y tests).
- [ ] La imagen Docker se construye sin errores mediante `docker build`.
- [ ] El contenedor Docker arranca y responde correctamente en `http://localhost:3001` (o el puerto configurado).
- [ ] El frontend compila y se sirve correctamente desde Fastify en el contenedor.
- [ ] El scraping con Playwright funciona dentro del contenedor (sin errores por librerías compartidas de Linux faltantes).
- [ ] La cookie `pt_session` incluye la directiva `Secure` cuando `NODE_ENV=production` y no la incluye en desarrollo local sin HTTPS.
- [ ] El archivo `render.yaml` es sintácticamente válido para Render Blueprints.
- [ ] La documentación en `README.md` detalla el proceso de conexión con GitHub y despliegue en Render.

## Decisions

- **Sí:** `Dockerfile` multi-stage con imagen base oficial de Playwright.  
  *Razón:* Garantiza que todas las librerías del sistema operativo que necesita Chromium estén presentes en Linux sin configuraciones frágiles en el script de build de Render.
- **No:** Render Native Node Environment sin Docker.  
  *Razón:* Suele fallar al instalar o ejecutar los binarios de Chromium por dependencias de sistema ausentes en la máquina base de Render.
- **Sí:** Aceptar re-autenticación cuando Render se duerma tras 15 min de inactividad.  
  *Razón:* Al ser una app de uso estrictamente personal, añadir persistencia en Redis o base de datos para la sesión añade complejidad innecesaria para esta fase.
- **Sí:** Cookie con atributo `Secure` sólo en producción (`NODE_ENV=production`).  
  *Razón:* Render proporciona HTTPS automáticamente en producción, pero en desarrollo local sobre HTTP no se bloqueará la cookie.
- **Sí:** Fichero `render.yaml` (Blueprint).  
  *Razón:* Permite desplegar el servicio en Render con un solo clic al vincular el repositorio de GitHub.

## Risks

| Riesgo | Mitigación |
|---|---|
| Límite de 512 MB de RAM en Render Free durante el scraping con Chromium | El scraper ya limita la concurrencia (`p-limit` a 3) y bloquea recursos pesados (imágenes, fuentes, multimedia). Si fuera necesario, se puede limitar la concurrencia a 1 en el entorno de producción. |
| Tiempo de arranque tras inactividad (~50s) | Documentar el comportamiento. Opcionalmente, se puede configurar un servicio externo gratuito como UptimeRobot para realizar un ping cada 10 minutos si se quiere mantener despierto. |
