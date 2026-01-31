#!/usr/bin/env bash
set -euo pipefail

# Tool runner intended to be invoked via the ./lumos launcher
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo "ERROR: Do not call this script directly." >&2
  echo "Use: './lumos run lumostradetool' from the repository root." >&2
  exit 1
fi

if ! declare -F echo_err >/dev/null 2>&1; then
  echo_err() {
    printf '%s\n' "$1" >&2
  }
fi

: "${TOOL_SERVICE_ACCOUNT:?TOOL_SERVICE_ACCOUNT must be set}"
: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${LUMOS_ROOT_DIR:?LUMOS_ROOT_DIR must be set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8082}"

echo "Starting LumosTradeTool locally (env: ${LUMOS_ENVIRONMENT})"
echo "MCP endpoint: http://127.0.0.1:${PORT}/mcp"

echo "Attempting to impersonate service account: ${TOOL_SERVICE_ACCOUNT}"
if token=$(gcloud auth print-access-token --impersonate-service-account="${TOOL_SERVICE_ACCOUNT}" 2>/dev/null); then
  export IMPERSONATED_ACCESS_TOKEN="$token"
  echo "Impersonation access token obtained. Proceeding."
else
  echo_err "ERROR: failed to impersonate ${TOOL_SERVICE_ACCOUNT}. Ensure caller has 'roles/iam.serviceAccountTokenCreator' on that account."
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
  echo "Caller (gcloud active account): ${CURRENT_ACCOUNT}"
  echo "To grant the required role for the caller, run:"
  echo "gcloud iam service-accounts add-iam-policy-binding \"${TOOL_SERVICE_ACCOUNT}\" --member=\"user:${CURRENT_ACCOUNT}\" --role=\"roles/iam.serviceAccountTokenCreator\" --project=\"${PROJECT_ID}\""
  exit 1
fi

echo "Installing deps (if needed) and starting dev server..."
cd "${SCRIPT_DIR}"

echo "Building LumosTrade (dependency)..."
(cd "${LUMOS_ROOT_DIR}" && npm run build:lumostrade)

if [ ! -d node_modules ]; then
  npm install
fi

LUMOS_ENVIRONMENT="${LUMOS_ENVIRONMENT}" PORT="${PORT}" npm run dev
