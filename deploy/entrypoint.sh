#!/bin/sh
set -eu

case "${RELAY_APP:-}" in
  relay-command|shelter-grid|transit-ops|supply-hub) ;;
  *)
    echo "Invalid RELAY_APP: ${RELAY_APP:-unset}" >&2
    exit 64
    ;;
esac

SOURCE="/opt/relay/apps/${RELAY_APP}/dist"
TARGET="/usr/share/nginx/html"

if [ ! -f "${SOURCE}/index.html" ]; then
  echo "Missing production build for ${RELAY_APP}: ${SOURCE}/index.html" >&2
  exit 66
fi

rm -rf "${TARGET:?}"/*
cp -R "${SOURCE}/." "${TARGET}/"

exec "$@"
