FROM node:20-alpine AS base
RUN apk add --no-cache openssl wget

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Never bake secrets into the image
RUN rm -f .env .env.* production.inputs.env || true
# Production images always use Postgres Prisma client
RUN node scripts/switch-db-provider.mjs postgres
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV SHOPIFY_BILLING_TEST=false
ENV PORT=3000

RUN addgroup -S bundleguard && adduser -S bundleguard -G bundleguard

COPY --from=build --chown=bundleguard:bundleguard /app/package.json ./
COPY --from=build --chown=bundleguard:bundleguard /app/package-lock.json* ./
COPY --from=build --chown=bundleguard:bundleguard /app/node_modules ./node_modules
COPY --from=build --chown=bundleguard:bundleguard /app/build ./build
COPY --from=build --chown=bundleguard:bundleguard /app/prisma ./prisma
COPY --from=build --chown=bundleguard:bundleguard /app/scripts ./scripts
COPY --from=build --chown=bundleguard:bundleguard /app/public ./public
COPY --from=build --chown=bundleguard:bundleguard /app/app ./app

USER bundleguard
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=50s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/readyz || exit 1

CMD ["npm", "run", "docker-start"]
