#!/usr/bin/env bash
set -euo pipefail

# _watch_all.sh — helper to start all TypeScript watchers for active development
# Usage: ./shell/_watch_all.sh (prefer using ./dev build watch)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"
echo "Starting TypeScript watchers for all packages (watch:all)..."

# Run the root script which uses npx concurrently to start all watchers
npm run watch:all
