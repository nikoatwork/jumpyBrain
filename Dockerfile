FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts/build-editor.mjs scripts/feedback-config.mjs ./scripts/
RUN npm run build

FROM node:22-slim AS engine

WORKDIR /engine
COPY scripts/engine/package.json scripts/engine/package-lock.json ./
# Some pinned QMD grammar/SQLite dependencies compile on Linux. Keep the
# toolchain out of the runtime image instead of relying on host prebuilds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ cmake \
    && npm ci --omit=dev

FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    JUMPYBRAIN_SERVER_ROOT=/data/jumpybrain/memory \
    JUMPYBRAIN_SERVER_HOST=0.0.0.0 \
    JUMPYBRAIN_SERVER_PORT=3001 \
    JUMPYBRAIN_QMD_BIN=/usr/local/bin/qmd

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/qmd-install-check.mjs scripts/multiplayer-upgrade.mjs ./scripts/
# Keep the production dependency graph (including platform-specific esbuild),
# plus QMD's CLI, SDK and native SQLite dependencies. A copied qmd shim is not enough.
RUN npm ci --omit=dev
COPY --from=engine /engine/node_modules /opt/jumpybrain-engine/node_modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /opt/jumpybrain-engine/node_modules/@tobilu/qmd/bin/qmd /usr/local/bin/qmd \
    && node scripts/qmd-install-check.mjs qmd \
    && mkdir -p /data/jumpybrain/memory \
    && chown -R node:node /data/jumpybrain

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.JUMPYBRAIN_SERVER_PORT || '3001') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "exec node dist/cli.js serve --root \"${JUMPYBRAIN_SERVER_ROOT}\" --host \"${JUMPYBRAIN_SERVER_HOST}\" --port \"${JUMPYBRAIN_SERVER_PORT}\" --init"]
