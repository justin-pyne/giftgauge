# syntax=docker/dockerfile:1.6
# -----------------------------------------------------------------------------
# profile-service — multi-stage build.
# Stage 1 compiles TypeScript. Stage 2 ships only production dependencies and
# the compiled output, runs as a non-root user, and exposes the service port.
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
ENV PORT=3001

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run as non-root user that ships with the node:alpine image
USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
