# syntax=docker/dockerfile:1
#
# Quizora frontend: Next.js standalone server.
#
# NEXT_PUBLIC_API_BASE_URL is compiled INTO the browser bundle at build time (it is not read at run time), so pass it as a
# build argument:
#   behind one ALB that routes /api/* to the backend (recommended on AWS):   --build-arg NEXT_PUBLIC_API_BASE_URL=/api/v1
#   docker-compose / local, API on another port:                              --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN mkdir -p public && npm run build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# standalone output = server.js + traced node_modules; static assets and public/ are added next to it
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
