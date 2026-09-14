#!/usr/bin/env bash
# Bootstraps the local development environment. Idempotent — safe to re-run.
#
#   bash scripts/setup-dev.sh            # seed .env, install deps, run migrations
#   bash scripts/setup-dev.sh --redis    # also start a local Redis (only needed to run the worker)
#   bash scripts/setup-dev.sh --down     # stop the local Redis started with --redis
#
# The database is a hosted Postgres (Supabase). Put its connection settings in
# packages/api/.env (see packages/api/.env.example for the Supabase shape).
# CI does NOT run this script; it provisions its own Postgres.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "ERROR: Docker Compose not found. Install Docker Desktop, or run Redis natively." >&2
    exit 1
  fi
}

case "${1:-up}" in
  --down)
    echo "Stopping local Redis..."
    compose down
    exit 0
    ;;
  --redis)
    START_REDIS=1
    ;;
esac

# 1. Seed .env files from .env.example where missing (never overwrite an existing .env).
for example in packages/*/.env.example; do
  [ -e "$example" ] || continue
  env_file="$(dirname "$example")/.env"
  if [ ! -f "$env_file" ]; then
    cp "$example" "$env_file"
    echo "Created $env_file — fill in the Supabase connection settings before starting the API."
  fi
done

# 2. Install dependencies (workspace-aware).
echo "Installing dependencies..."
npm install

# 3. Optionally start a local Redis for worker development.
if [ "${START_REDIS:-0}" = "1" ]; then
  echo "Starting local Redis..."
  compose up -d redis
fi

# 4. Run schema migrations against the configured database
#    (idempotent — TypeORM tracks applied migrations).
echo "Running migrations..."
npm run migration:run -w @hrms/api || echo "No migrations to run yet."

echo "Done. Start the API with:  npm run start:dev -w @hrms/api"
