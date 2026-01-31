#!/usr/bin/env bash
set -euo pipefail

# Prevent direct invocation: prefer using ./lumos launcher
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo_err "ERROR: Do not call this script directly."
  echo_err "Use: 'LUMOS_ENVIRONMENT=development ./lumos deploy lumosagents' from the repository root."
  exit 1
fi

# Validate required env vars are present
: "${PROJECT_ID:?PROJECT_ID must be set by caller}"
: "${REGION:?REGION must be set by the caller}"
: "${AGENT_SERVICE_ACCOUNT:?AGENT_SERVICE_ACCOUNT must be set by caller}"
: "${AGENT_LUMOSAGENTS_SERVICE_NAME:?AGENT_LUMOSAGENTS_SERVICE_NAME must be set by caller}"
: "${AGENT_LUMOSAGENTS_URL:?AGENT_LUMOSAGENTS_URL must be set by caller}"
: "${LUMOS_APP_SERVICE_ACCOUNT:?LUMOS_APP_SERVICE_ACCOUNT must be set by caller}"
: "${TOOL_LUMOSDB_SERVICE_URL:?TOOL_LUMOSDB_SERVICE_URL must be set by caller}"
: "${TOOL_LUMOSTRADE_SERVICE_URL:?TOOL_LUMOSTRADE_SERVICE_URL must be set by caller}"

SERVICE_NAME="${AGENT_LUMOSAGENTS_SERVICE_NAME}"
IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

# 1. Initialization
gcloud config set project "$PROJECT_ID"

echo "🚀 Starting deployment for $PROJECT_ID (env: $LUMOS_ENVIRONMENT)"

# Verify project access early before building
if ! gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
   echo_err "ERROR: Unable to describe project ${PROJECT_ID}. Check permissions or project ID."
   exit 1
fi

# Ensure the AGENT_SERVICE_ACCOUNT exists in the project before building
if ! gcloud iam service-accounts describe "$AGENT_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo_err "ERROR: AGENT_SERVICE_ACCOUNT '$AGENT_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID."
  echo_err "Create it or set AGENT_SERVICE_ACCOUNT to a valid service account in your env."
  exit 1
fi

# Helpful check for permissions to act as the agent service account
CURRENT_USER=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
if ! gcloud iam service-accounts get-iam-policy "$AGENT_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Warning: cannot read IAM policy for $AGENT_SERVICE_ACCOUNT; you may need additional permissions to verify 'actAs'." >&2
fi

# Ensure the LUMOS_APP_SERVICE_ACCOUNT exists in the project before building
if ! gcloud iam service-accounts describe "$LUMOS_APP_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo_err "ERROR: LUMOS_APP_SERVICE_ACCOUNT '$LUMOS_APP_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID."
  echo_err "Create it using /Lumos/dev service or Lumos/prod service"
  exit 1
fi

# Resolve script directory to execute build from the correct context
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📂 Changing directory to $SCRIPT_DIR"
cd "$SCRIPT_DIR"
echo "📂 Current working directory: $(pwd)"
echo "📂 Directory contents:"
ls -F

# 2. BUILD
echo "🔨 Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project "${PROJECT_ID}" || true

echo "🔨 Building the container with Cloud Build and pushing to ${IMAGE_URL}..."
# We use gcloud builds submit because it's more robust than 'run deploy --source'
# and allows us to cache the image.
gcloud builds submit --tag "${IMAGE_URL}" . --project "${PROJECT_ID}"

# 3. DEPLOY
echo "🚢 Deploying to Cloud Run ($SERVICE_NAME) in region $REGION..."

BUILD_NUMBER=$(TZ=America/New_York date +%Y%m%d.%H%M%S)

# Build ALLOWED_ORIGINS 
ALLOWED_ORIGINS="http://localhost,http://localhost:8080,http://localhost:3000"
if [ -n "${AGENT_LUMOSAGENTS_URL:-}" ]; then
  ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${AGENT_LUMOSAGENTS_URL}"
fi

# Prepare env vars file (YAML) to avoid delimiter issues with gcloud CLI parsing
ENV_FILE=$(mktemp)
cat > "${ENV_FILE}" <<EOF
ENVIRONMENT: "${LUMOS_ENVIRONMENT}"
NODE_ENV: "${LUMOS_ENVIRONMENT}"
PROJECT_ID: "${PROJECT_ID}"
GOOGLE_CLOUD_PROJECT: "${PROJECT_ID}"
GOOGLE_CLOUD_LOCATION: "${REGION}"
GOOGLE_GENAI_USE_VERTEXAI: "True"
BUILD_NUMBER: "${BUILD_NUMBER}"
ALLOWED_ORIGINS: "${ALLOWED_ORIGINS}"
AGENT_SERVICE_URL: "${AGENT_LUMOSAGENTS_URL}"
TOOL_LUMOSDB_SERVICE_URL: "${TOOL_LUMOSDB_SERVICE_URL:-}"
TOOL_LUMOSTRADE_SERVICE_URL: "${TOOL_LUMOSTRADE_SERVICE_URL:-}"
DEMO_MODE: "${DEMO_MODE:-False}"
DEMO_ALLOW_EDITS: "${DEMO_ALLOW_EDITS:-False}"
MAX_IMPORT_DAYS: "${MAX_IMPORT_DAYS:-}"
GITHUB_REPO_URL: "${GITHUB_REPO_URL:-}"
EOF

echo "Environment variables being set:"
cat "${ENV_FILE}"

# Note: --no-allow-unauthenticated ensures restricted access (requires IAM)
if ! gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URL" \
    --region="$REGION" \
    --service-account="$AGENT_SERVICE_ACCOUNT" \
    --env-vars-file="${ENV_FILE}" \
    --no-allow-unauthenticated \
    --project "$PROJECT_ID"; then
  echo_err "ERROR: gcloud run deploy failed. This is often caused by missing 'iam.serviceAccounts.actAs' permission on the service account ($AGENT_SERVICE_ACCOUNT)."
  echo_err "Ensure your user ($CURRENT_USER) has the role 'roles/iam.serviceAccountUser' on $AGENT_SERVICE_ACCOUNT:"
  echo_err "  gcloud iam service-accounts add-iam-policy-binding $AGENT_SERVICE_ACCOUNT --member=\"user:$CURRENT_USER\" --role=\"roles/iam.serviceAccountUser\" --project=$PROJECT_ID"
  rm -f "${ENV_FILE}"
  exit 1
fi
    
rm -f "${ENV_FILE}"

echo "✅ Deploy finished."

# Ensure the Lumos App service account has service-level Run invoker on this service (idempotent)
# This allows the Lumos App to invoke this agent
if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
  echo "Granting roles/run.invoker to ${LUMOS_APP_SERVICE_ACCOUNT} on Cloud Run service ${SERVICE_NAME} (region ${REGION})"
  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --member="serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}" \
    --role="roles/run.invoker" \
    --region="$REGION" --platform=managed || true
fi

# Revoke public (allUsers) invoker binding if present to prevent unauthenticated access
# Check for existence first to avoid noisy errors
echo "Checking for public (allUsers) invoker binding for ${SERVICE_NAME} (region ${REGION})..."
user_binding=$(gcloud run services get-iam-policy "$SERVICE_NAME" --region="$REGION" --platform=managed --flatten="bindings[].members" --filter="bindings.members:allUsers" --format="value(bindings.role)" || true)
if [ -z "${user_binding}" ]; then
  echo "No public binding found; skipping removal."
else
  echo "Found public binding (role: ${user_binding}). Revoking..."
  gcloud run services remove-iam-policy-binding "$SERVICE_NAME" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region="$REGION" --platform=managed || true
  echo "Public binding removed."
fi

# Output the Cloud Run service IAM policy for verification
echo "--- Service IAM policy for ${SERVICE_NAME} (region ${REGION}) ---"
if ! gcloud run services get-iam-policy "$SERVICE_NAME" --region="$REGION" --platform=managed --format="yaml"; then
  echo "Warning: Failed to fetch IAM policy for ${SERVICE_NAME}." >&2
fi
echo "--- End IAM policy ---"

echo "✅ Deployment complete: $SERVICE_NAME"
echo "URL: $AGENT_LUMOSAGENTS_URL"
