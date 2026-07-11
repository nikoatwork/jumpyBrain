FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    JUMPYBRAIN_SERVER_ROOT=/data/jumpybrain/memory \
    JUMPYBRAIN_SERVER_HOST=0.0.0.0 \
    JUMPYBRAIN_SERVER_PORT=3001 \
    JUMPYBRAIN_QMD_BIN=qmd

WORKDIR /app

RUN npm install -g @tobilu/qmd \
    && mkdir -p /data/jumpybrain/memory

COPY package.json ./package.json
COPY --from=build /app/dist ./dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.JUMPYBRAIN_SERVER_PORT || '3001') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "node dist/cli.js serve --root \"${JUMPYBRAIN_SERVER_ROOT}\" --host \"${JUMPYBRAIN_SERVER_HOST}\" --port \"${JUMPYBRAIN_SERVER_PORT}\" --init"]
