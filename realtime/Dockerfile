# Multi-stage build for the realtime service (NFR-007).
#
# The workspace lockfile is the single source of dependency resolution, so both
# stages install from it with --frozen-lockfile: a Docker build that quietly
# resolves a newer version is not the build CI tested.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifests only: this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY realtime/package.json ./realtime/
RUN pnpm install --frozen-lockfile --filter realtime...

COPY packages/shared ./packages/shared
COPY realtime ./realtime
RUN pnpm --filter realtime build

FROM node:24-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY realtime/package.json ./realtime/

# THE FIX IS HERE: Added --ignore-scripts to prevent the husky prepare script from failing
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter realtime...

COPY --from=build /app/realtime/dist ./realtime/dist

WORKDIR /app/realtime
EXPOSE 4001
CMD ["node", "dist/main"]