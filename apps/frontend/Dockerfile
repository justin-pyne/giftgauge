# syntax=docker/dockerfile:1.6
# -----------------------------------------------------------------------------
# Frontend container.
# Two stages:
#   - "build" produces a static dist/ via `vite build`.
#   - "runtime" serves the dev server for local Compose (so VITE_* env vars
#     are honored at runtime). For an EKS deployment you'd switch the runtime
#     stage to nginx and build VITE_* into the bundle at build time.
# -----------------------------------------------------------------------------

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src

EXPOSE 5173

CMD ["npm", "run", "dev"]
