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
  # Ensure root dependencies are installed (includes TypeScript)
  if [ ! -d "${LUMOS_ROOT_DIR}/node_modules" ]; then
    echo "Installing root dependencies (includes TypeScript)..."
    (cd "${LUMOS_ROOT_DIR}" && npm install)
  fi
  
  echo "Ensuring LumosTrade dependencies are installed..."
  if [ ! -d "${LUMOS_TRADE_DIR}/node_modules" ]; then
    echo "Installing LumosTrade dependencies..."
    (cd "${LUMOS_TRADE_DIR}" && npm install)
  fi
  
  echo "Building LumosTrade..."
  (cd "${LUMOS_ROOT_DIR}" && npm run build:lumostrade)
  
  # Verify the build produced output
  if [ ! -d "${LUMOS_TRADE_DIR}/dist" ] || [ ! -f "${LUMOS_TRADE_DIR}/dist/index.js" ]; then
    echo "ERROR: LumosTrade build did not produce expected dist/index.js output." >&2
    exit 1
  fi
  echo "✅ LumosTrade built successfully"
fi

# 2) Install deps + build this tool
cd "${SCRIPT_DIR}"

if [ ! -d node_modules ]; then
  echo "Installing LumosTradeTool dependencies..."
  npm install
else
  # Ensure lumostrade link is fresh after rebuild
  echo "Refreshing lumostrade dependency link..."
  npm install lumostrade
fi

echo "Building LumosTradeTool..."
npm run build

echo "✅ LumosTradeTool build complete"
