#!/usr/bin/env bash
set -euo pipefail

# Start Cloud SQL Proxy for local development using environment variables
# Requires the following environment variables to be set (for example, from config/development.env or config/production.env):
#   PROJECT_ID, REGION, SQL_INSTANCE
# Optionally override proxy binary path with CLOUD_SQL_PROXY_BIN (defaults to ~/google-cloud-tools/cloud-sql-proxy)

# Use PROJECT_ID if SQL_PROJECT is not set
SQL_PROJECT="${SQL_PROJECT:-${PROJECT_ID:-}}"
if [ -z "$SQL_PROJECT" ]; then
  echo "Error: PROJECT_ID not set." >&2
  exit 1
fi

# Use REGION if SQL_REGION is not set
SQL_REGION="${SQL_REGION:-${REGION:-}}"
if [ -z "$SQL_REGION" ]; then
  echo "Error: REGION not set." >&2
  exit 1
fi

if [ -z "${SQL_INSTANCE:-}" ]; then
  echo "Error: SQL_INSTANCE not set (e.g., export SQL_INSTANCE=lumos-development)." >&2
  exit 1
fi

PROXY_BIN="${CLOUD_SQL_PROXY_BIN:-$HOME/google-cloud-tools/cloud-sql-proxy}"
CONN_STR="${SQL_PROJECT}:${SQL_REGION}:${SQL_INSTANCE}"

if [ ! -x "$PROXY_BIN" ]; then
  echo "Warning: Cloud SQL Proxy binary not found or not executable at $PROXY_BIN" >&2
  echo "You can set CLOUD_SQL_PROXY_BIN to the path of your cloud-sql-proxy binary." >&2
  # still attempt to run it to let the user see the error
fi

echo "Starting Cloud SQL Proxy for: $CONN_STR (port 3306)"
exec "$PROXY_BIN" --port 3306 "$CONN_STR"
