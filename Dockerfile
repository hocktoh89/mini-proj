# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the NestJS + Prisma backend.
#
# Targets:
#   development - full toolchain, source is bind-mounted by docker compose, runs `nest start --watch`
#   migrate     - one-shot container that runs `prisma migrate deploy` (prod)
#   production  - compiled JS + production node_modules only, no TS source / dev tooling
#
# Prisma client is generated into src/generated/prisma (see prisma/schema.prisma) and
# compiled by `nest build` into dist/generated/prisma.

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
# base: shared OS layer
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
# openssl is required by the Prisma schema engine (migrate / generate).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: all dependencies (dev + prod), cached on package.json / yarn.lock only
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --non-interactive

# ---------------------------------------------------------------------------
# development: used with a bind-mounted source tree (see docker-compose.override.yml)
# ---------------------------------------------------------------------------
FROM deps AS development
ENV NODE_ENV=development \
    PORT=3006
COPY . .
# Run as `node` (uid 1000) so files written into the bind mount (dist/, src/generated/)
# are owned by the host developer rather than root.
RUN chown -R node:node /app
USER node
EXPOSE 3006
CMD ["sh", "-c", "yarn prisma generate && yarn prisma migrate deploy && yarn start:dev"]

# ---------------------------------------------------------------------------
# build: generate prisma client into src/generated, compile TS -> dist
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
RUN yarn prisma generate
COPY src ./src
RUN yarn build \
    && rm -f dist/tsconfig.build.tsbuildinfo

# ---------------------------------------------------------------------------
# prod-deps: production-only node_modules, cache cleaned
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json yarn.lock ./
# yarn classic still installs devDependencies that satisfy a prod dep's optional peer
# (@prisma/client -> prisma, typescript ~60MB+), so drop devDependencies from the manifest
# first. --pure-lockfile keeps lockfile versions without failing on the now-unused entries.
RUN node -e "const f='package.json',p=require('./'+f);delete p.devDependencies;require('fs').writeFileSync(f,JSON.stringify(p,null,2))" \
    && yarn install --pure-lockfile --non-interactive --production --ignore-scripts \
    && yarn cache clean \
    && find node_modules -type f \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \) -delete \
    && find node_modules -type d -name '__tests__' -prune -exec rm -rf {} +

# ---------------------------------------------------------------------------
# migrate: runs pending migrations against DATABASE_URL, then exits.
# Needs the prisma CLI (devDependency), so it is kept out of the runtime image.
# ---------------------------------------------------------------------------
FROM deps AS migrate
ENV NODE_ENV=production
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN yarn cache clean
CMD ["yarn", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# production: minimal runtime image
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS production
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Drop yarn/npm/corepack from the runtime image - only `node` is needed.
RUN rm -rf /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
           /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
