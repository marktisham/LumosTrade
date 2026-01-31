#!/usr/bin/env bash
set -euo pipefail

# Prevent direct invocation: prefer using ./lumos launcher
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo "ERROR: Do not call this script directly." >&2
  echo "Use: 'LUMOS_ENVIRONMENT=development ./lumos deploy lumostradetool' from the repository root." >&2
  exit 1
fi

: "${PROJECT_ID:?PROJECT_ID must be set by caller}"
: "${REGION:?REGION must be set by the caller}"
: "${TOOL_SERVICE_ACCOUNT:?TOOL_SERVICE_ACCOUNT must be set by caller}"
: "${AGENT_SERVICE_ACCOUNT:?AGENT_SERVICE_ACCOUNT must be set by caller}"
: "${LUMOS_ROOT_DIR:?LUMOS_ROOT_DIR must be set by caller}"
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set by caller}"
: "${BROKER_ACCESS_DATASTORE_PROJECT_ID:?BROKER_ACCESS_DATASTORE_PROJECT_ID must be set by caller}"
: "${SQL_INSTANCE:?SQL_INSTANCE must be set by caller}"
: "${SQL_DATABASE:?SQL_DATABASE must be set by caller}"
: "${SQL_REGION:?SQL_REGION must be set by caller}"

# Service name is fixed by convention, but still configurable via env
: "${TOOL_LUMOSTRADE_SERVICE_NAME:?TOOL_LUMOSTRADE_SERVICE_NAME must be set by caller}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVICE_NAME="${TOOL_LUMOSTRADE_SERVICE_NAME}"
IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

# 1) Init

gcloud config set project "$PROJECT_ID"

echo "🚀 Starting deployment for $PROJECT_ID (env: $LUMOS_ENVIRONMENT)"

# Verify project access early
if ! gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "ERROR: Unable to describe project ${PROJECT_ID}. Check permissions or project ID." >&2
  exit 1
fi

# Ensure service accounts exist
if ! gcloud iam service-accounts describe "$TOOL_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: TOOL_SERVICE_ACCOUNT '$TOOL_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID." >&2
  exit 1
fi

if ! gcloud iam service-accounts describe "$AGENT_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: AGENT_SERVICE_ACCOUNT '$AGENT_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID." >&2
  exit 1
fi

# 2) Build TypeScript (local)
(cd "${LUMOS_ROOT_DIR}" && LUMOS_ENVIRONMENT="${LUMOS_ENVIRONMENT}" bash "${SCRIPT_DIR}/_build.sh")

# 3) Build container via Cloud Build

echo "🔨 Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project "${PROJECT_ID}" || true

echo "🔨 Building the container with Cloud Build and pushing to ${IMAGE_URL}..."
# Submit from repo root so Dockerfile can COPY LumosTrade
CLOUDBUILD_CONFIG="${SCRIPT_DIR}/cloudbuild.yaml"
gcloud builds submit "${LUMOS_ROOT_DIR}" \
  --config "${CLOUDBUILD_CONFIG}" \
  --substitutions _IMAGE_URL="${IMAGE_URL}" \
  --project "${PROJECT_ID}"

# 4) Deploy to Cloud Run

echo "🚢 Deploying to Cloud Run (${SERVICE_NAME}) in region ${REGION}..."

BUILD_NUMBER=$(TZ=America/New_York date +%Y%m%d.%H%M%S)

# Prepare env vars file (YAML)
ENV_FILE=$(mktemp)
cat > "${ENV_FILE}" <<EOF
ENVIRONMENT: "${LUMOS_ENVIRONMENT}"
NODE_ENV: "${LUMOS_ENVIRONMENT}"
PROJECT_ID: "${PROJECT_ID}"
GOOGLE_CLOUD_PROJECT: "${PROJECT_ID}"
GOOGLE_CLOUD_LOCATION: "${REGION}"
GOOGLE_GENAI_USE_VERTEXAI: "${GOOGLE_GENAI_USE_VERTEXAI:-1}"
BUILD_NUMBER: "${BUILD_NUMBER}"
LUMOS_SECRET_NAME: "${LUMOS_SECRET_NAME}"
BROKER_ACCESS_DATASTORE_PROJECT_ID: "${BROKER_ACCESS_DATASTORE_PROJECT_ID}"
SQL_INSTANCE: "${SQL_INSTANCE}"
SQL_DATABASE: "${SQL_DATABASE}"
SQL_REGION: "${SQL_REGION}"
DEMO_MODE: "${DEMO_MODE:-False}"
DEMO_ALLOW_EDITS: "${DEMO_ALLOW_EDITS:-False}"
MAX_IMPORT_DAYS: "${MAX_IMPORT_DAYS:-}"
GITHUB_REPO_URL: "${GITHUB_REPO_URL:-}"
EOF

if ! gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URL}" \
  --region="${REGION}" \
  --service-account="${TOOL_SERVICE_ACCOUNT}" \
  --env-vars-file="${ENV_FILE}" \
  --no-allow-unauthenticated \
  --project "${PROJECT_ID}"; then
  CURRENT_USER=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
  echo "ERROR: gcloud run deploy failed. Often caused by missing iam.serviceAccounts.actAs on ${TOOL_SERVICE_ACCOUNT}." >&2
  echo "Grant it with:" >&2
  echo "  gcloud iam service-accounts add-iam-policy-binding ${TOOL_SERVICE_ACCOUNT} --member=\"user:${CURRENT_USER}\" --role=\"roles/iam.serviceAccountUser\" --project=${PROJECT_ID}" >&2
  rm -f "${ENV_FILE}"
  exit 1
fi

rm -f "${ENV_FILE}"

echo "✅ Deploy finished."

# Grant agent service account invoker permissions
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  echo "Granting roles/run.invoker to ${AGENT_SERVICE_ACCOUNT} on Cloud Run service ${SERVICE_NAME} (region ${REGION})"
  gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
    --member="serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
    --role="roles/run.invoker" \
    --region="${REGION}" --platform=managed || true
fi

# Revoke public invoker if present
echo "Checking for public (allUsers) invoker binding for ${SERVICE_NAME} (region ${REGION})..."
user_binding=$(gcloud run services get-iam-policy "${SERVICE_NAME}" --region="${REGION}" --platform=managed --flatten="bindings[].members" --filter="bindings.members:allUsers" --format="value(bindings.role)" || true)
if [ -z "${user_binding}" ]; then
  echo "No public binding found; skipping removal."
else
  echo "Found public binding (role: ${user_binding}). Revoking..."
  gcloud run services remove-iam-policy-binding "${SERVICE_NAME}" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region="${REGION}" --platform=managed || true
  echo "Public binding removed."
fi

echo "--- Service IAM policy for ${SERVICE_NAME} (region ${REGION}) ---"
gcloud run services get-iam-policy "${SERVICE_NAME}" --region="${REGION}" --platform=managed --format="yaml" || true
echo "--- End IAM policy ---"

echo "✅ Deployment complete: ${SERVICE_NAME}"
