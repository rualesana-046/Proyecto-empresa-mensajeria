#!/usr/bin/env bash
# Arranca los 5 servicios como procesos locales; Redis y Postgres deben estar ya corriendo
set -euo pipefail
cd "$(dirname "$0")/.."

export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-$USER}"

crear_base_si_falta() {
  local base="$1"
  if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$base'" | grep -q 1; then
    psql -d postgres -qc "CREATE DATABASE $base"
    echo "[dev-local] base $base creada"
  fi
}

for base in envios_db asignacion_db cobros_db; do crear_base_si_falta "$base"; done

pids=()
detener_todo() {
  # SIGTERM activa el apagado ordenado de cada servicio
  kill -TERM "${pids[@]}" 2>/dev/null || true
  wait
}
trap detener_todo INT TERM EXIT

PUERTO=3005 node services/pasarela-mock/index.js & pids+=($!)
PUERTO=3001 node services/envios/index.js & pids+=($!)
PUERTO=3002 node services/asignacion/index.js & pids+=($!)
PUERTO=3003 PASARELA_URL=http://localhost:3005 node services/cobros/index.js & pids+=($!)
PUERTO=3004 node services/notificaciones/index.js & pids+=($!)

echo "[dev-local] 5 servicios arrancados (Ctrl+C para detenerlos)"
wait
