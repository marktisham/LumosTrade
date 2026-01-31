#!/usr/bin/env bash
set -euo pipefail

# Prevent direct invocation: prefer using ./lumos launcher
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo "ERROR: Do not call this script directly."
  echo "Use: 'LUMOS_ENVIRONMENT=development ./lumos deploy lumosapp' from the repository root." >&2
  exit 1
fi

# Validate required env vars are present
: "${LUMOS_ENVIRONMENT:?LUMOS_ENVIRONMENT must be set by caller}"
: "${PROJECT_ID:?PROJECT_ID must be set by caller}"
: "${REGION:?REGION must be set by the caller}"
: "${LUMOS_APP_SERVICE_ACCOUNT:?LUMOS_APP_SERVICE_ACCOUNT must be set by caller}"
: "${LUMOS_APP_SERVICE_NAME:?LUMOS_APP_SERVICE_NAME must be set by caller}"
: "${LUMOS_APP_SERVICE_URL:?LUMOS_APP_SERVICE_URL must be set by caller}"

SERVICE_NAME="${LUMOS_APP_SERVICE_NAME}"
IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

# 1. Initialization
gcloud config set project "$PROJECT_ID"

echo "🚀 Starting deployment for $PROJECT_ID (env: $LUMOS_ENVIRONMENT)"

# Resolve the root directory of the monorepo (parent of LumosApp)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "📂 Root directory: $ROOT_DIR"
echo "📂 LumosApp directory: $SCRIPT_DIR"

# Build all TypeScript packages from root
echo "🔨 Building TypeScript packages..."
cd "$ROOT_DIR"
npm install || true
npm run build:all || true

# 2. BUILD
echo "🔨 Building the container with Cloud Build and pushing to ${IMAGE_URL}..."
# Build from the root directory since Dockerfile needs access to both LumosApp and LumosTrade
cd "$ROOT_DIR"
gcloud builds submit \
  --config="${SCRIPT_DIR}/cloudbuild.yaml" \
  --substitutions="_IMAGE_URL=${IMAGE_URL}" \
  --project "${PROJECT_ID}" \
  .

# 3. DEPLOY
echo "🚢 Deploying to Cloud Run ($SERVICE_NAME) in region $REGION..."

# Verify project access
if ! gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
   echo "ERROR: Unable to describe project ${PROJECT_ID}. Check permissions or project ID."
   exit 1
fi

BUILD_NUMBER=$(TZ=America/New_York date +%Y%m%d.%H%M%S)

# Build ALLOWED_ORIGINS
ALLOWED_ORIGINS="http://localhost,http://localhost:8080,http://localhost:3000"
if [ -n "${LUMOS_APP_SERVICE_URL:-}" ]; then
  ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${LUMOS_APP_SERVICE_URL}"
fi

# Prepare env vars file (YAML) - dynamically generate from expanded env file variables
# This ensures any new variables added to env files are automatically included
ENV_FILE=$(mktemp)

# Use the LUMOS_ENVIRONMENT variable to determine which expanded env file to use
SOURCE_ENV_FILE="${ROOT_DIR}/config/${LUMOS_ENVIRONMENT}.expanded.env"

# Extract variable names from expanded env file (ignoring comments and empty lines)
# Then output each as YAML, excluding computed variables
{
  echo "# Runtime environment variables from ${LUMOS_ENVIRONMENT} environment"
  grep -E '^[A-Z_]+=' "$SOURCE_ENV_FILE" | cut -d'=' -f1 | while read -r var_name; do
    # Skip computed variables that are added by ./dev or ./prod
    if [[ "$var_name" == "LUMOS_ROOT_DIR" || "$var_name" == "SECRETS_FILE" ]]; then
      continue
    fi
    # Get the value from the current environment (already exported by ./dev or ./prod)
    var_value="${!var_name:-}"
    echo "${var_name}: \"${var_value}\""
  done
  # Add computed/dynamic variables
  echo "BUILD_NUMBER: \"${BUILD_NUMBER}\""
  echo "ALLOWED_ORIGINS: \"${ALLOWED_ORIGINS}\""
  echo "NODE_ENV: \"${LUMOS_ENVIRONMENT}\""
} > "${ENV_FILE}"

echo "Environment variables being set:"
cat "${ENV_FILE}"

# Ensure the LUMOS_APP_SERVICE_ACCOUNT exists in the project
if ! gcloud iam service-accounts describe "$LUMOS_APP_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: LUMOS_APP_SERVICE_ACCOUNT '$LUMOS_APP_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID." >&2
  echo "Create it or set LUMOS_APP_SERVICE_ACCOUNT to a valid service account in your env." >&2
  rm -f "${ENV_FILE}"
  exit 1
fi

# Deploy with allow-unauthenticated since this is a public web UI
gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URL" \
    --region="$REGION" \
    --service-account="$LUMOS_APP_SERVICE_ACCOUNT" \
    --env-vars-file="${ENV_FILE}" \
    --allow-unauthenticated \
    --project "$PROJECT_ID"
    
rm -f "${ENV_FILE}"

echo "✅ Deployment complete: $SERVICE_NAME"
