# syntax=docker/dockerfile:1.7
#
# Portal API: compiled JS + production node_modules. Pending migrations (its own `portal` schema)
# are applied on start, so the prisma CLI is a runtime dependency here.

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
# openssl is required by the Prisma schema engine (migrate / generate).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --non-interactive

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
RUN yarn prisma generate
COPY src ./src
RUN yarn build && rm -f dist/tsconfig.build.tsbuildinfo

FROM base AS prod-deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --non-interactive --production

FROM base AS production
ENV NODE_ENV=production \
    PORT=3010
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3010
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
