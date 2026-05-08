# syntax=docker/dockerfile:1.6
# -----------------------------------------------------------------------------
# scoring-service — multi-stage build.
# -----------------------------------------------------------------------------

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3003

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3003

CMD ["node", "dist/index.js"]
