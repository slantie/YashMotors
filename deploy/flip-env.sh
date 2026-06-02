#!/usr/bin/env bash
# Flip the public backend upstream between prod (:3001) and staging (:4001), then reload
# nginx with zero downtime. The mobile APK URL never changes — the swap is server-side.
#
#   sudo deploy/flip-env.sh staging   # route yashmotorsbackend.mooo.com → staging stack
#   sudo deploy/flip-env.sh prod      # route back to prod
#
# Override the upstream include path with YM_NGINX_UPSTREAM if you installed it elsewhere.
set -euo pipefail

TARGET="${1:-}"
CONF="${YM_NGINX_UPSTREAM:-/etc/nginx/conf.d/yashmotors-backend-active.conf}"

case "$TARGET" in
  prod)    PORT=3001 ;;
  staging) PORT=4001 ;;
  *) echo "usage: $0 prod|staging" >&2; exit 1 ;;
esac

if [ ! -w "$(dirname "$CONF")" ]; then
  echo "Cannot write $CONF (run with sudo?)" >&2; exit 1
fi

cat > "$CONF" <<EOF
# ACTIVE: $TARGET (auto-written by deploy/flip-env.sh $(date -u +%FT%TZ))
upstream yashmotors_backend_active {
    server 127.0.0.1:$PORT;
}
EOF

nginx -t
nginx -s reload
echo "✅ Backend upstream now → $TARGET (127.0.0.1:$PORT)"
echo "   Verify: curl -s https://yashmotorsbackend.mooo.com/healthz"
