# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder

WORKDIR /app

# Railway Docker builds run from the repo root, so we copy workspace packages explicitly.
RUN npm install -g pnpm@9.12.3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

COPY packages/types ./packages/types
COPY apps/admin ./apps/admin

RUN pnpm install --frozen-lockfile

# Build admin + types for TypeScript project references.
RUN pnpm turbo build --filter=@golden-abode/types --filter=@golden-abode/admin


FROM nginx:1.27-alpine AS runner

# envsubst (from gettext) lets us inject the backend origin into the nginx config at runtime.
RUN apk add --no-cache gettext

ENV PORT=3000
# Must be set in Railway env vars if the backend is not on the same container.
# Example: https://golden-adobe-production.up.railway.app
ENV API_UPSTREAM=http://localhost:3000

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

RUN mkdir -p /etc/nginx/templates

RUN cat > /etc/nginx/templates/admin.conf.template <<'EOF'
server {
  listen ${PORT};
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location = /health {
    access_log off;
    add_header Content-Type text/plain;
    return 200 'ok';
  }

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Admin app calls "/api/..." (axios baseURL is "/api").
  # Proxy those requests to the backend service origin.
  location /api/ {
    proxy_pass ${API_UPSTREAM};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF

RUN cat > /docker-entrypoint.sh <<'EOF'
#!/bin/sh
set -eu

envsubst '${PORT} ${API_UPSTREAM}' < /etc/nginx/templates/admin.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
EOF

RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]

