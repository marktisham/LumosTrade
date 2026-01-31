#!/usr/bin/env bash
set -euo pipefail

# Prevent direct invocation: prefer using ./lumos build lumostradetool
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo "ERROR: Do not call this script directly." >&2
  echo "Use: './lumos build lumostradetool' from the repository root." >&2
  exit 1
fi

# Resolve directories once and reuse (avoid brittle relative paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${LUMOS_ROOT_DIR:?LUMOS_ROOT_DIR must be set by caller}"
LUMOS_TRADE_DIR="${LUMOS_ROOT_DIR}/LumosTrade"

echo "Building LumosTradeTool (env: ${LUMOS_ENVIRONMENT})"
echo "Repo root: ${LUMOS_ROOT_DIR}"
echo "LumosTrade: ${LUMOS_TRADE_DIR}"

# 1) Build LumosTrade so the local file dependency has dist output
if [ -f "${LUMOS_ROOT_DIR}/package.json" ]; then
  echo "Building LumosTrade..."
  (cd "${LUMOS_ROOT_DIR}" && npm run build:lumostrade)
fi

# 2) Install deps + build this tool
cd "${SCRIPT_DIR}"

if [ ! -d node_modules ]; then
  npm install
fi

npm run build

echo "✅ LumosTradeTool build complete"
