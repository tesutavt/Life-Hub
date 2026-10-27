# Life Hub — сервер (API + веб-клиент) для VDS.
# Сборка:  docker build -t lifehub .
# Запуск:  см. docker-compose.yml и deploy/README.md

FROM node:20-bookworm-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npx vite build

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    LIFEHUB_DATA_DIR=/data
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
# База, загрузки, кэш озвучки и секрет токенов — в томе /data
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
