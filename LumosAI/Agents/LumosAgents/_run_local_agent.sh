#!/usr/bin/env bash
set -euo pipefail

# Agent runner intended to be invoked via the ./lumos launcher
# Requires LUMOS_ENVIRONMENT to be set by the launcher
# Ensure echo_err is available (imported from invoker) otherwise provide a minimal fallback
if ! declare -F echo_err >/dev/null 2>&1; then
  echo_err() {
    printf '%s\n' "$1" >&2
  }
fi

if [ -z "${LUMOS_ENVIRONMENT:-}" ]; then
  echo_err "ERROR: Do not call this script directly."
  echo "Use: './lumos run lumosagents' from the repository root." >&2
  exit 1
fi

: "${AGENT_SERVICE_ACCOUNT:?AGENT_SERVICE_ACCOUNT must be set}"
: "${PROJECT_ID:?PROJECT_ID must be set}"

echo "Starting local LumosChat agent in environment: ${LUMOS_ENVIRONMENT}"

# Attempt impersonation of AGENT_SERVICE_ACCOUNT to verify perms locally.
# This uses gcloud to obtain a short-lived access token for the service account
# and exports it for child processes. Your user must have
# roles/iam.serviceAccountTokenCreator on the AGENT_SERVICE_ACCOUNT to succeed.
echo "Attempting to impersonate service account: ${AGENT_SERVICE_ACCOUNT}"
if token=$(gcloud auth print-access-token --impersonate-service-account="${AGENT_SERVICE_ACCOUNT}" 2>/dev/null); then
  export IMPERSONATED_ACCESS_TOKEN="$token"
  echo "Impersonation access token obtained. Proceeding to launch agent."
else
  echo_err "ERROR: failed to impersonate ${AGENT_SERVICE_ACCOUNT}. Ensure caller has 'roles/iam.serviceAccountTokenCreator' on that account." 

  # Log caller identity to help debug permission issues
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
  echo "Caller (gcloud active account): ${CURRENT_ACCOUNT}"

  echo "Active authenticated accounts (gcloud auth list):"
  gcloud auth list --filter=status:ACTIVE --format="value(account)" || true

  echo "IAM policy for ${AGENT_SERVICE_ACCOUNT}:"
  gcloud iam service-accounts get-iam-policy "${AGENT_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format="yaml" || true

  echo_err "To grant the required role for the caller, run:"
  echo ========================================================================
  echo "gcloud iam service-accounts add-iam-policy-binding \"${AGENT_SERVICE_ACCOUNT}\" --member=\"user:${CURRENT_ACCOUNT}\" --role=\"roles/iam.serviceAccountTokenCreator\" --project=\"${PROJECT_ID}\""
  echo ========================================================================
  exit 1
fi

echo "Load ADK web interface at http://127.0.0.1:8000"
adk web
