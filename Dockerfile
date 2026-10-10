# Stage 1: Build frontend and prepare production dependencies
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY web ./web
RUN npm run build -w web

RUN npm prune --omit=dev

# Stage 2: Production runner with Playwright & Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runner

USER root
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=3001

COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist
COPY server ./server

RUN chown -R pwuser:pwuser /app

USER pwuser

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "server"]
