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
  && pnpm deploy --filter @evals/worker --prod --legacy /out/worker

FROM build AS migrate
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["pnpm", "db:migrate"]

FROM node:20-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api .
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:20-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/worker .
CMD ["node", "dist/main.js"]

FROM nginx:1.27-alpine AS web
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
