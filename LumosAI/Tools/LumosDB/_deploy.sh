#!/usr/bin/env bash
set -euo pipefail

# Prevent direct invocation: prefer using ./lumos launcher
if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo "ERROR: Do not call this script directly."
  echo "Use: 'LUMOS_ENVIRONMENT=development ./lumos deploy lumosdb' from the repository root." >&2
  exit 1
fi

# Validate required env vars are present
: "${PROJECT_ID:?PROJECT_ID must be set by caller}"
: "${REGION:?REGION must be set by the caller}"
: "${TOOL_SERVICE_ACCOUNT:?TOOL_SERVICE_ACCOUNT must be set by caller}"
: "${AGENT_SERVICE_ACCOUNT:?AGENT_SERVICE_ACCOUNT must be set by caller}"
: "${TOOL_LUMOSDB_SERVICE_URL:?TOOL_LUMOSDB_SERVICE_URL must be set by caller}"
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set by caller}"

# Use TOOL_LUMOSDB_SERVICE_NAME from env if provided, otherwise default
SERVICE_NAME="${TOOL_LUMOSDB_SERVICE_NAME:-lumos-mcp-db}"

# Hardcoded google docker image file location. MCP Toolbox for Databases.
IMAGE_URL="us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:latest"

# 1. Initialization
gcloud config set project "$PROJECT_ID"
SERVICE_ACCOUNT="$TOOL_SERVICE_ACCOUNT"

echo "🚀 Starting deployment for $PROJECT_ID (env: $LUMOS_ENVIRONMENT)"

# Verify tools.yaml exists locally
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_YAML="$DEPLOY_DIR/tools.yaml"

if [ ! -f "$TOOLS_YAML" ]; then
  echo "ERROR: tools.yaml not found at $TOOLS_YAML. Ensure the file exists in Tools/LumosDB." >&2
  exit 1
fi

# Upload tools.yaml as a secret so it can be mounted into the container.
# We use Google's pre-built toolbox image which we cannot modify, so we must mount
# tools.yaml at runtime via Cloud Run's --set-secrets mounting mechanism.
# tools.yaml itself doesn't contain secrets - it references environment variables
# like ${SQL_USER}, ${SQL_PASSWORD} which are populated from the lumos secret.
TOOLS_SECRET_NAME="${SERVICE_NAME}-tools-yaml"
if gcloud secrets describe "$TOOLS_SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "🔄 Updating tools.yaml..."
    gcloud secrets versions add "$TOOLS_SECRET_NAME" --data-file="$TOOLS_YAML" --project="$PROJECT_ID"
else
    echo "🆕 Creating tools.yaml secret..."
    gcloud secrets create "$TOOLS_SECRET_NAME" --data-file="$TOOLS_YAML" --project="$PROJECT_ID"
fi

# 2. DEPLOYMENT

# Fetch database secrets from Google Secret Manager
echo "🔐 Fetching database secrets from Secret Manager..."
LUMOS_SECRETS=$(gcloud secrets versions access latest --secret="$LUMOS_SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null || echo "")

if [ -z "$LUMOS_SECRETS" ]; then
  echo "ERROR: Failed to fetch secrets from '$LUMOS_SECRET_NAME' in Secret Manager." >&2
  echo "Ensure:" >&2
  echo "  1. Secrets have been uploaded via './dev secrets upload' or './prod secrets upload'" >&2
  echo "  2. Secret '$LUMOS_SECRET_NAME' exists in project $PROJECT_ID" >&2
  exit 1
fi

# Parse individual secrets using jq (only user and password)
SQL_USER=$(echo "$LUMOS_SECRETS" | jq -r '.database.user // empty')
SQL_PASSWORD=$(echo "$LUMOS_SECRETS" | jq -r '.database.password // empty')

# Use environment variables for database connection metadata
SQL_PROJECT="${PROJECT_ID}"
SQL_REGION="${SQL_REGION:-${REGION}}"
SQL_INSTANCE="${SQL_INSTANCE}"
SQL_DATABASE="${SQL_DATABASE:-lumos}"

# Validate required secrets
if [ -z "$SQL_USER" ] || [ -z "$SQL_PASSWORD" ]; then
  echo "ERROR: Missing required database credentials (user, password) in '$LUMOS_SECRET_NAME'" >&2
  exit 1
fi

# Validate required environment variables
if [ -z "$SQL_PROJECT" ] || [ -z "$SQL_REGION" ] || [ -z "$SQL_INSTANCE" ] || [ -z "$SQL_DATABASE" ]; then
  echo "ERROR: Missing required database connection environment variables (PROJECT_ID, REGION, SQL_INSTANCE, SQL_DATABASE)" >&2
  exit 1
fi

# Build environment variable string for Cloud Run
# Note: GOOGLE_GENAI_USE_VERTEXAI=True is essential for the agent to access the gemini model.
ENV_VARS="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=True,NODE_ENV=$LUMOS_ENVIRONMENT"
ENV_VARS="$ENV_VARS,SQL_PROJECT=$SQL_PROJECT,SQL_REGION=$SQL_REGION,SQL_INSTANCE=$SQL_INSTANCE"
ENV_VARS="$ENV_VARS,SQL_DATABASE=$SQL_DATABASE,SQL_USER=$SQL_USER,SQL_PASSWORD=$SQL_PASSWORD"
ENV_VARS="$ENV_VARS,DEMO_MODE=${DEMO_MODE:-False},DEMO_ALLOW_EDITS=${DEMO_ALLOW_EDITS:-False}"
ENV_VARS="$ENV_VARS,MAX_IMPORT_DAYS=${MAX_IMPORT_DAYS:-},GITHUB_REPO_URL=${GITHUB_REPO_URL:-}"

# Build application args
ARGS=("--tools-file=/app/tools.yaml" "--address=0.0.0.0" "--port=8080" "--allowed-origins=${TOOL_LUMOSDB_SERVICE_URL}")

# Convert ARGS array to comma-separated string for gcloud's --args
OLD_IFS="$IFS"
IFS=,
ARGS_CSV="${ARGS[*]}"
IFS="$OLD_IFS"

# Deploy to Cloud Run
# Ensure the TOOL_SERVICE_ACCOUNT exists in the project
if ! gcloud iam service-accounts describe "$TOOL_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: TOOL_SERVICE_ACCOUNT '$TOOL_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID." >&2
  echo "Create it or set TOOL_SERVICE_ACCOUNT to a valid service account in your environment file (for example, config/development.env or config/production.env at repo root)." >&2
  echo "To create: gcloud iam service-accounts create <name> --project=$PROJECT_ID" >&2
  exit 1
fi

# Helpful check for permissions to act as the service account
CURRENT_USER=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
if ! gcloud iam service-accounts get-iam-policy "$TOOL_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Warning: cannot read IAM policy for $TOOL_SERVICE_ACCOUNT; you may need additional permissions to verify 'actAs'." >&2
fi

# Ensure the AGENT_SERVICE_ACCOUNT exists in the project
if ! gcloud iam service-accounts describe "$AGENT_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "ERROR: AGENT_SERVICE_ACCOUNT '$AGENT_SERVICE_ACCOUNT' does not exist in project $PROJECT_ID." >&2
  echo "Create it or set AGENT_SERVICE_ACCOUNT to a valid service account in your env." >&2
  echo "To create: gcloud iam service-accounts create <name> --project=$PROJECT_ID" >&2
  exit 1
fi

# Helpful check for permissions to act as the agent service account
if ! gcloud iam service-accounts get-iam-policy "$AGENT_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Warning: cannot read IAM policy for $AGENT_SERVICE_ACCOUNT; you may need additional permissions to verify 'actAs'." >&2
fi

# Show the exact command that will be run (useful for debugging and CI logs)
echo "🚢 Deploying to Cloud Run ($SERVICE_NAME) in region $REGION..."

# Note: we use the tool service account for the running permissions of this service,
# but add the agent service account (further below) as an invoker so that agents can call it.
# This prevents us from having to give the agent additional perms, like DB access.
# We mount tools.yaml from a secret (required because we can't modify Google's pre-built image)
# and pass database credentials via environment variables.
if ! gcloud run deploy "$SERVICE_NAME" \
    --image="$IMAGE_URL" \
    --region="$REGION" \
    --service-account="$TOOL_SERVICE_ACCOUNT" \
    --set-secrets="/app/tools.yaml=$TOOLS_SECRET_NAME:latest" \
    --set-env-vars="$ENV_VARS" \
    --args="$ARGS_CSV" \
    --no-allow-unauthenticated; then
  echo "ERROR: gcloud run deploy failed. This is often caused by missing 'iam.serviceAccounts.actAs' permission on the service account ($TOOL_SERVICE_ACCOUNT)." >&2
  echo "Ensure your user ($CURRENT_USER) has the role 'roles/iam.serviceAccountUser' on $TOOL_SERVICE_ACCOUNT:" >&2
  echo "  gcloud iam service-accounts add-iam-policy-binding $TOOL_SERVICE_ACCOUNT --member=\"user:$CURRENT_USER\" --role=\"roles/iam.serviceAccountUser\" --project=$PROJECT_ID" >&2
  exit 1
fi

echo "✅ Deploy finished."

# Ensure the agent service account has service-level Run invoker on this service (idempotent)
# This is necessary for authenticated access from agents
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  echo "Granting roles/run.invoker to ${AGENT_SERVICE_ACCOUNT} on Cloud Run service ${SERVICE_NAME} (region ${REGION})"
  gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
    --member="serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
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
