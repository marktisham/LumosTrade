#!/usr/bin/env bash
set -euo pipefail

# Auth helper to set the current gcloud project and run application-default login.
# Uses PROJECT_ID environment variable (for example, from config/development.env or config/production.env).

if [ -z "${PROJECT_ID:-}" ]; then
  echo "Error: PROJECT_ID environment variable is not set. Set it (e.g., export PROJECT_ID=development-467713) and re-run." >&2
  exit 1
fi

echo "Setting gcloud project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"
gcloud config get-value project
gcloud auth application-default login
