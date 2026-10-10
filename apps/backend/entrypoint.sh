#!/bin/sh
set -eu

log() {
  printf '%s\n' "[entrypoint] $*"
}

AUTO_MIGRATE="${AUTO_MIGRATE:-true}"
WAIT_SECONDS="${AUTO_MIGRATE_WAIT_SECONDS:-60}"
AUTO_BOOTSTRAP_PLATFORM_ADMIN="${AUTO_BOOTSTRAP_PLATFORM_ADMIN:-false}"

wait_for_db() {
  python - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

url = os.environ.get("DATABASE_URL", "")
wait_seconds = int(os.environ.get("AUTO_MIGRATE_WAIT_SECONDS", "60"))

if not url:
    raise SystemExit("DATABASE_URL is not set")

parsed = urlparse(url)
host = parsed.hostname or "localhost"
port = parsed.port or 5432

deadline = time.time() + wait_seconds
last_error = None

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"DB reachable at {host}:{port}")
            raise SystemExit(0)
    except OSError as exc:
        last_error = exc
        time.sleep(1)

raise SystemExit(f"DB not reachable at {host}:{port} within {wait_seconds}s: {last_error}")
PY
}

if [ "$AUTO_MIGRATE" = "true" ]; then
  log "Waiting for database (${WAIT_SECONDS}s timeout)"
  wait_for_db
  
  log "Running alembic migrations"
  alembic upgrade head

  if [ "$AUTO_BOOTSTRAP_PLATFORM_ADMIN" = "true" ]; then
    if [ -n "${PLATFORM_ADMIN_EMAIL:-}" ] && [ -n "${PLATFORM_ADMIN_PASSWORD:-}" ]; then
      log "Bootstrapping developer admin"
      python -m app.bootstrap_admin
    else
      log "Skipping developer admin bootstrap (missing PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD)"
    fi
  fi
else
  log "AUTO_MIGRATE=false, skipping migration step"
fi

log "Starting process: $*"
exec "$@"
