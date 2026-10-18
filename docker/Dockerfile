# syntax=docker/dockerfile:1

FROM node:20-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.29.1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --offline --frozen-lockfile
RUN pnpm build \
  && pnpm deploy --filter @evals/api --prod --legacy /out/api \
  && pnpm deploy --filter @evals/worker --prod --legacy /out/worker \
  && pnpm deploy --filter @evals/grader --prod --legacy /out/grader

FROM build AS migrate
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["pnpm", "db:migrate"]

FROM node:20-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM ghcr.io/astral-sh/uv:0.9.17 AS uv

# The worker drives Harbor, which shells out to `docker compose` against the host daemon
# (socket mounted by compose). Harbor 0.24.0 is the version verified in the day-1 spike.
FROM node:20-slim AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    docker-ce-cli docker-compose-plugin docker-buildx-plugin \
  && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN uv tool install 'harbor==0.24.0' --python 3.12 && harbor --version
COPY hermes_harbor /opt/evals/hermes_harbor
ENV NODE_ENV=production ADAPTER_DIR=/opt/evals
WORKDIR /app
COPY --from=build /out/worker .
CMD ["node", "dist/main.js"]

# Verifier for Harbor's separate verifier container: bash (Harbor runs commands via `bash -c`),
# Node for the grader, Python + pytest for task check scripts. Built by `pnpm images:build`.
FROM node:20-slim AS verifier
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pytest \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/grader /grader

FROM nginx:1.27-alpine AS web
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
