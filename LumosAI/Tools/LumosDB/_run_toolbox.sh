#!/usr/bin/env bash
set -euo pipefail

# Toolbox runner intended to be invoked via the ./lumos launcher
# Requires LUMOS_ENVIRONMENT to be set by the launcher
# Ensure echo_err is available (imported from invoker) otherwise provide a minimal fallback
if ! declare -F echo_err >/dev/null 2>&1; then
  echo_err() {
    printf '%s\n' "$1" >&2
  }
fi

if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo_err "ERROR: Do not call this script directly."
  echo "Use: './lumos run lumosdb' from the repository root." >&2
  exit 1
fi

: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${TOOL_SERVICE_ACCOUNT:?TOOL_SERVICE_ACCOUNT must be set}"
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set}"

# Fetch database secrets from Google Secret Manager
echo "🔐 Fetching database secrets from Google Secret Manager..."
LUMOS_SECRETS=$(gcloud secrets versions access latest --secret="$LUMOS_SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null || echo "")

if [ -z "$LUMOS_SECRETS" ]; then
  echo_err "ERROR: Failed to fetch secrets from '$LUMOS_SECRET_NAME' in Secret Manager."
  echo "Ensure:" >&2
  echo "  1. Secrets have been uploaded via './dev secrets upload' or './prod secrets upload'" >&2
  echo "  2. Secret '$LUMOS_SECRET_NAME' exists in project $PROJECT_ID" >&2
  echo "  3. You have roles/secretmanager.secretAccessor permission" >&2
  exit 1
fi

# Parse JSON secrets into environment variables using jq
if ! command -v jq >/dev/null 2>&1; then
  echo_err "ERROR: jq is not installed. Install it with: brew install jq (macOS) or apt-get install jq (Linux)"
  exit 1
fi

# Extract SQL credentials from secrets (only user and password)
export SQL_USER=$(echo "$LUMOS_SECRETS" | jq -r '.database.user // empty')
export SQL_PASSWORD=$(echo "$LUMOS_SECRETS" | jq -r '.database.password // empty')

# Use environment variables for database connection metadata
export SQL_PROJECT="${PROJECT_ID}"
export SQL_REGION="${SQL_REGION:-${REGION}}"
export SQL_INSTANCE="${SQL_INSTANCE}"
export SQL_DATABASE="${SQL_DATABASE:-lumos}"

# Validate required SQL fields
REQUIRED_SQL_VARS=(SQL_PROJECT SQL_REGION SQL_INSTANCE SQL_DATABASE SQL_USER SQL_PASSWORD)
for v in "${REQUIRED_SQL_VARS[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo_err "ERROR: Missing required variable $v. Database connection metadata should be set in environment (PROJECT_ID, REGION, SQL_INSTANCE, SQL_DATABASE), credentials should be in secrets."
    exit 1
  fi
done

echo "✓ Successfully loaded database configuration from environment and secrets"

# Resolve paths relative to current working dir or script dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -x "${PWD}/toolbox" ] && [ -f "${PWD}/tools.yaml" ]; then
  BASE_DIR="${PWD}"
elif [ -x "${SCRIPT_DIR}/toolbox" ] && [ -f "${SCRIPT_DIR}/tools.yaml" ]; then
  BASE_DIR="${SCRIPT_DIR}"
else
  echo_err "ERROR: Could not find 'toolbox' binary and 'tools.yaml' in either the current directory or ${SCRIPT_DIR}."
  echo "Place both files in the same folder as this script or run the invoker from a directory that contains them." >&2
  exit 1
fi

echo "Starting toolbox (tools.yaml from ${BASE_DIR}) in environment: ${LUMOS_ENVIRONMENT}"

# Attempt impersonation of TOOL_SERVICE_ACCOUNT to verify perms locally.
# This uses gcloud to obtain a short-lived access token for the service account
# and exports it for child processes. Your user must have
# roles/iam.serviceAccountTokenCreator on the TOOL_SERVICE_ACCOUNT to succeed.
echo "Attempting to impersonate service account: ${TOOL_SERVICE_ACCOUNT}"
if token=$(gcloud auth print-access-token --impersonate-service-account="${TOOL_SERVICE_ACCOUNT}" 2>/dev/null); then
  export IMPERSONATED_ACCESS_TOKEN="$token"
  echo "Impersonation access token obtained. Proceeding to launch toolbox."
else
  echo_err "ERROR: failed to impersonate ${TOOL_SERVICE_ACCOUNT}. Ensure caller has 'roles/iam.serviceAccountTokenCreator' on that account." 

  # Log caller identity to help debug permission issues
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
  echo "Caller (gcloud active account): ${CURRENT_ACCOUNT}"

  echo "Active authenticated accounts (gcloud auth list):"
  gcloud auth list --filter=status:ACTIVE --format="value(account)" || true

  echo "IAM policy for ${TOOL_SERVICE_ACCOUNT}:"
  gcloud iam service-accounts get-iam-policy "${TOOL_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format="yaml" || true

  echo_err "To grant the required role for the caller, run:"
  echo ========================================================================
  echo "gcloud iam service-accounts add-iam-policy-binding \"${TOOL_SERVICE_ACCOUNT}\" --member=\"user:${CURRENT_ACCOUNT}\" --role=\"roles/iam.serviceAccountTokenCreator\" --project=\"${PROJECT_ID}\""
  echo ========================================================================
  exit 1
fi


cd "${BASE_DIR}"
"${BASE_DIR}/toolbox" --tools-file "tools.yaml" --log-level debug --ui
