#!/usr/bin/env bash
set -euo pipefail

# _clean_rebuild.sh - Wipe all build artifacts and node_modules, then rebuild all packages from scratch
# Usage: ./shell/_clean_rebuild.sh (prefer using ./dev build clean)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Remove all node_modules and dist folders in root and subpackages
echo "Removing node_modules and dist folders..."
rm -rf "$ROOT_DIR/node_modules" "$ROOT_DIR/LumosApp/node_modules" "$ROOT_DIR/LumosTrade/node_modules" "$ROOT_DIR/LumosCLI/node_modules"
rm -rf "$ROOT_DIR/LumosApp/dist" "$ROOT_DIR/LumosTrade/dist" "$ROOT_DIR/LumosCLI/dist"

# Remove package-lock.json files
echo "Removing package-lock.json files..."
rm -f "$ROOT_DIR/package-lock.json" "$ROOT_DIR/LumosApp/package-lock.json" "$ROOT_DIR/LumosTrade/package-lock.json" "$ROOT_DIR/LumosCLI/package-lock.json"

# Reinstall root dependencies
echo "Installing root dependencies..."
cd "$ROOT_DIR"
npm install

# Install all type definitions before building
echo "Installing all type definitions (prebuild:all)..."
npm run prebuild:all

# Reinstall and rebuild all packages
echo "Installing and building all packages..."
npm run build:all

echo "Clean rebuild complete!"
