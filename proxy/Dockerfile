FROM node:22-alpine AS web-build

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM caddy:2-alpine

# Caddyfile (local HTTP) is the default config; Caddyfile.demo is the HTTPS demo host (#49).
COPY proxy/Caddyfile proxy/Caddyfile.demo proxy/common.caddy /etc/caddy/
COPY --from=web-build /web/dist /srv
