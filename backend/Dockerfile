# Node 24 matches .github/workflows/security-checks.yml and package.json engines.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL in both stages.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
# postinstall generates Prisma; no database connection or build secrets are needed.
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
# server.ts listens on process.env.PORT when executed directly, but not when Vercel imports it.
CMD ["node", "dist/server.js"]
