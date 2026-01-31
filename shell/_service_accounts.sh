#!/usr/bin/env bash
set -euo pipefail

# Common helper to reset IAM roles for tool, agent, and app service accounts and apply required roles.
# Expects the following environment variables to be set prior to invocation:
# - PROJECT_ID
# - TOOL_SERVICE_ACCOUNT  (email of the tool service account)
# - AGENT_SERVICE_ACCOUNT (email of the agent service account)
# - LUMOS_APP_SERVICE_ACCOUNT (email of the Lumos App service account)
# Optional (used to configure Cloud Run service-level invoker bindings):
# - REGION
# - TOOL_LUMOSDB_SERVICE_NAME
# - TOOL_LUMOSTRADE_SERVICE_NAME

: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${TOOL_SERVICE_ACCOUNT:?TOOL_SERVICE_ACCOUNT must be set}"

# Roles for tool service account
TOOL_REQUIRED_ROLES=(
  "roles/secretmanager.secretAccessor"
  "roles/cloudsql.client"
  "roles/aiplatform.user"
  "roles/datastore.user"
)

# Roles for agent service account
# Note roles/run.invoker is granted at the service level during deploy. Avoid here for least privelage.
AGENT_REQUIRED_ROLES=(
  "roles/aiplatform.user"
)

# Roles for Lumos App service account
# Note roles/run.invoker is granted at the service level during deploy. Avoid here for least privelage.
LUMOSAPP_REQUIRED_ROLES=(
  "roles/secretmanager.secretAccessor"
  "roles/cloudsql.client"
  "roles/datastore.user"
  "roles/aiplatform.user"
)

# Helper function to create service account if it doesn't exist
ensure_service_account_exists() {
  local sa_email="$1"
  local sa_name="${sa_email%%@*}"  # Extract name before @
  local display_name="$2"
  local description="$3"
  
  if ! gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "📝 Service account $sa_email does not exist. Creating..."
    gcloud iam service-accounts create "$sa_name" \
      --display-name="$display_name" \
      --description="$description" \
      --project="$PROJECT_ID"
    echo "✅ Created service account: $sa_email"
  else
    echo "✓ Service account $sa_email already exists"
    # Update description for existing account
    gcloud iam service-accounts update "$sa_email" \
      --description="$description" \
      --project="$PROJECT_ID" >/dev/null 2>&1 || true
  fi
}

# Helper functions to configure Cloud Run service IAM policies
has_run_invoker_binding() {
  local service_name="$1"
  local region="$2"
  local project_id="$3"
  local member="$4" # e.g. serviceAccount:foo@...

  local found
  found=$(gcloud run services get-iam-policy "$service_name" \
    --region "$region" \
    --platform managed \
    --project "$project_id" \
    --flatten="bindings[].members" \
    # Use ':' (contains) so this matches both:
    # - serviceAccount:foo@bar
    # - serviceAccount:foo@bar?uid=123...
    --filter="bindings.role=roles/run.invoker AND bindings.members:${member}" \
    --format="value(bindings.members)" 2>/dev/null || true)

  [ -n "$found" ]
}

cleanup_uid_invoker_duplicates() {
  local service_name="$1"
  local region="$2"
  local project_id="$3"
  local invoker_sa_email="$4"
  local base_member="serviceAccount:${invoker_sa_email}"

  local members
  members=$(gcloud run services get-iam-policy "$service_name" \
    --region "$region" \
    --platform managed \
    --project "$project_id" \
    --flatten="bindings[].members" \
    --filter="bindings.role=roles/run.invoker AND bindings.members:${base_member}" \
    --format="value(bindings.members)" 2>/dev/null || true)

  # Only remove uid-form entries if the plain email entry exists.
  # This avoids accidentally removing the only valid binding.
  if ! printf '%s\n' "$members" | grep -q "^${base_member}$"; then
    return 0
  fi

  while read -r m; do
    if [ -z "${m}" ]; then
      continue
    fi
    case "$m" in
      "${base_member}"\?uid=*)
        echo "Removing duplicate uid-form invoker binding: ${service_name} -> ${m}"
        gcloud run services remove-iam-policy-binding "$service_name" \
          --member="$m" \
          --role="roles/run.invoker" \
          --region "$region" \
          --platform managed \
          --project "$project_id" \
          --quiet >/dev/null 2>&1 || true
        ;;
    esac
  done <<< "$members"
}

ensure_run_invoker_binding() {
  local service_name="$1"
  local region="$2"
  local project_id="$3"
  local invoker_sa_email="$4"
  local member="serviceAccount:${invoker_sa_email}"

  if has_run_invoker_binding "$service_name" "$region" "$project_id" "$member"; then
    echo "✓ ${service_name}: invoker binding already present for ${member}"
    return 0
  fi

  echo "Adding Cloud Run invoker binding: ${service_name} -> ${member}"
  gcloud run services add-iam-policy-binding "$service_name" \
    --member="$member" \
    --role="roles/run.invoker" \
    --region "$region" \
    --platform managed \
    --project "$project_id" \
    --quiet || true

  cleanup_uid_invoker_duplicates "$service_name" "$region" "$project_id" "$invoker_sa_email"
}

remove_public_run_invoker_bindings() {
  local service_name="$1"
  local region="$2"
  local project_id="$3"

  # Defensive cleanup: ensure the service isn't accidentally public.
  # Ignore failures so this remains idempotent.
  gcloud run services remove-iam-policy-binding "$service_name" \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region "$region" \
    --platform managed \
    --project "$project_id" \
    --quiet >/dev/null 2>&1 || true

  gcloud run services remove-iam-policy-binding "$service_name" \
    --member="allAuthenticatedUsers" \
    --role="roles/run.invoker" \
    --region "$region" \
    --platform managed \
    --project "$project_id" \
    --quiet >/dev/null 2>&1 || true
}

# --- Ensure all service accounts exist ---
echo "🔍 Checking service accounts..."
ensure_service_account_exists "$TOOL_SERVICE_ACCOUNT" "Lumos Tool Service Account" "Service Account for Lumos AI Tool Cloud Run Services"
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  ensure_service_account_exists "$AGENT_SERVICE_ACCOUNT" "Lumos Agent Service Account" "Service Account for Lumos AI Agent Cloud Run Services"
fi
if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
  ensure_service_account_exists "$LUMOS_APP_SERVICE_ACCOUNT" "Lumos App Service Account" "Service Account for Lumos Web Application"
fi

# --- Process TOOL_SERVICE_ACCOUNT ---

echo "🔑 Configuring IAM bindings for tool service account: ${TOOL_SERVICE_ACCOUNT} on project ${PROJECT_ID}"

# Get existing roles for this service account
existing_roles=$(gcloud projects get-iam-policy "${PROJECT_ID}" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${TOOL_SERVICE_ACCOUNT}" \
  --format="value(bindings.role)" || true)
if [ -n "${existing_roles}" ]; then
  existing_roles=$(printf '%s\n' "${existing_roles}" | sort -u)
fi

# Determine which roles need to be added
roles_to_add=()
for r in "${TOOL_REQUIRED_ROLES[@]}"; do
  if ! printf '%s\n' "${existing_roles}" | grep -qxF "${r}"; then
    roles_to_add+=("${r}")
  fi
done

# Determine which roles need to be removed
roles_to_remove=()
if [ -n "${existing_roles}" ]; then
  while read -r role; do
    if [ -n "${role}" ]; then
      # Check if this role is in the required list
      is_required=false
      for r in "${TOOL_REQUIRED_ROLES[@]}"; do
        if [ "${role}" = "${r}" ]; then
          is_required=true
          break
        fi
      done
      if [ "${is_required}" = "false" ]; then
        roles_to_remove+=("${role}")
      fi
    fi
  done <<< "${existing_roles}"
fi

# Remove roles that shouldn't be there
if [ ${#roles_to_remove[@]} -gt 0 ]; then
  echo "Removing ${#roles_to_remove[@]} unnecessary role(s):"
  for role in "${roles_to_remove[@]}"; do
    echo "  Removing: ${role} -> ${TOOL_SERVICE_ACCOUNT}"
    gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${TOOL_SERVICE_ACCOUNT}" \
      --role="${role}" --quiet >/dev/null 2>&1 || true
  done
else
  echo "✓ No unnecessary roles to remove"
fi

# Add required roles that are missing
if [ ${#roles_to_add[@]} -gt 0 ]; then
  echo "Adding ${#roles_to_add[@]} missing role(s):"
  for r in "${roles_to_add[@]}"; do
    echo "  Adding: ${r} -> ${TOOL_SERVICE_ACCOUNT}"
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${TOOL_SERVICE_ACCOUNT}" \
      --role="${r}" --quiet
  done
else
  echo "✓ All required roles already present"
fi

# Print resulting roles for confirmation
echo "Resulting roles for ${TOOL_SERVICE_ACCOUNT}:"
gcloud projects get-iam-policy "${PROJECT_ID}" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${TOOL_SERVICE_ACCOUNT}" \
  --format="table(bindings.role)"

# Grant the current gcloud user permission to impersonate the tool service account (for local testing)
CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
if [ -n "${CURRENT_ACCOUNT}" ]; then
  echo "Granting user ${CURRENT_ACCOUNT} permission to impersonate ${TOOL_SERVICE_ACCOUNT} (roles/iam.serviceAccountTokenCreator)"
  gcloud iam service-accounts add-iam-policy-binding "${TOOL_SERVICE_ACCOUNT}" \
    --member="user:${CURRENT_ACCOUNT}" \
    --role="roles/iam.serviceAccountTokenCreator" --project="${PROJECT_ID}" --quiet || true
else
  echo "Could not determine current gcloud account; skipping user impersonation grant for ${TOOL_SERVICE_ACCOUNT}."
fi

# --- Process AGENT_SERVICE_ACCOUNT (optional) ---
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  echo "🔑 Configuring IAM bindings for agent service account: ${AGENT_SERVICE_ACCOUNT} on project ${PROJECT_ID}"

  # Get existing roles for this service account
  existing_roles=$(gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
    --format="value(bindings.role)" || true)
  if [ -n "${existing_roles}" ]; then
    existing_roles=$(printf '%s\n' "${existing_roles}" | sort -u)
  fi

  # Determine which roles need to be added
  roles_to_add=()
  for r in "${AGENT_REQUIRED_ROLES[@]}"; do
    if ! printf '%s\n' "${existing_roles}" | grep -qxF "${r}"; then
      roles_to_add+=("${r}")
    fi
  done

  # Determine which roles need to be removed
  roles_to_remove=()
  if [ -n "${existing_roles}" ]; then
    while read -r role; do
      if [ -n "${role}" ]; then
        # Check if this role is in the required list
        is_required=false
        for r in "${AGENT_REQUIRED_ROLES[@]}"; do
          if [ "${role}" = "${r}" ]; then
            is_required=true
            break
          fi
        done
        if [ "${is_required}" = "false" ]; then
          roles_to_remove+=("${role}")
        fi
      fi
    done <<< "${existing_roles}"
  fi

  # Remove roles that shouldn't be there
  if [ ${#roles_to_remove[@]} -gt 0 ]; then
    echo "Removing ${#roles_to_remove[@]} unnecessary role(s):"
    for role in "${roles_to_remove[@]}"; do
      echo "  Removing: ${role} -> ${AGENT_SERVICE_ACCOUNT}"
      gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
        --role="${role}" --quiet >/dev/null 2>&1 || true
    done
  else
    echo "✓ No unnecessary roles to remove"
  fi

  # Add required roles that are missing
  if [ ${#roles_to_add[@]} -gt 0 ]; then
    echo "Adding ${#roles_to_add[@]} missing role(s):"
    for r in "${roles_to_add[@]}"; do
      echo "  Adding: ${r} -> ${AGENT_SERVICE_ACCOUNT}"
      gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
        --role="${r}" --quiet
    done
  else
    echo "✓ All required roles already present"
  fi

  # Print resulting roles for confirmation
echo "Resulting roles for ${AGENT_SERVICE_ACCOUNT}:"
gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${AGENT_SERVICE_ACCOUNT}" \
    --format="table(bindings.role)"

  # Grant the current gcloud user permission to impersonate the agent service account (for local testing)
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
  if [ -n "${CURRENT_ACCOUNT}" ]; then
    echo "Granting user ${CURRENT_ACCOUNT} permission to impersonate ${AGENT_SERVICE_ACCOUNT} (roles/iam.serviceAccountTokenCreator)"
    gcloud iam service-accounts add-iam-policy-binding "${AGENT_SERVICE_ACCOUNT}" \
      --member="user:${CURRENT_ACCOUNT}" \
      --role="roles/iam.serviceAccountTokenCreator" --project="${PROJECT_ID}" --quiet || true
  else
    echo "Could not determine current gcloud account; skipping user impersonation grant for ${AGENT_SERVICE_ACCOUNT}."
  fi
else
  echo "AGENT_SERVICE_ACCOUNT not set; skipping agent account role configuration."
fi

# --- Cloud Run invoker bindings for tool services (LumosDB + LumosTradeTool) ---
# Keep this near the tool-related logic so it's easy to extend as new tool services are added.
if [ -n "${REGION:-}" ] && [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  if [ -n "${TOOL_LUMOSDB_SERVICE_NAME:-}" ]; then
    echo "🔐 Ensuring LumosDB Cloud Run invoker bindings"
    ensure_run_invoker_binding "${TOOL_LUMOSDB_SERVICE_NAME}" "${REGION}" "${PROJECT_ID}" "${AGENT_SERVICE_ACCOUNT}"
    remove_public_run_invoker_bindings "${TOOL_LUMOSDB_SERVICE_NAME}" "${REGION}" "${PROJECT_ID}"
  fi

  if [ -n "${TOOL_LUMOSTRADE_SERVICE_NAME:-}" ]; then
    echo "🔐 Ensuring LumosTradeTool Cloud Run invoker bindings"
    ensure_run_invoker_binding "${TOOL_LUMOSTRADE_SERVICE_NAME}" "${REGION}" "${PROJECT_ID}" "${AGENT_SERVICE_ACCOUNT}"
    remove_public_run_invoker_bindings "${TOOL_LUMOSTRADE_SERVICE_NAME}" "${REGION}" "${PROJECT_ID}"
  fi
else
  echo "REGION and/or AGENT_SERVICE_ACCOUNT not set; skipping Cloud Run invoker binding configuration for tool services."
fi

# --- Process LUMOS_APP_SERVICE_ACCOUNT (optional) ---
if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
  echo "🔑 Configuring IAM bindings for Lumos App service account: ${LUMOS_APP_SERVICE_ACCOUNT} on project ${PROJECT_ID}"

  # Get existing roles for this service account
  existing_roles=$(gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}" \
    --format="value(bindings.role)" || true)
  if [ -n "${existing_roles}" ]; then
    existing_roles=$(printf '%s\n' "${existing_roles}" | sort -u)
  fi

  # Determine which roles need to be added
  roles_to_add=()
  for r in "${LUMOSAPP_REQUIRED_ROLES[@]}"; do
    if ! printf '%s\n' "${existing_roles}" | grep -qxF "${r}"; then
      roles_to_add+=("${r}")
    fi
  done

  # Determine which roles need to be removed
  roles_to_remove=()
  if [ -n "${existing_roles}" ]; then
    while read -r role; do
      if [ -n "${role}" ]; then
        # Check if this role is in the required list
        is_required=false
        for r in "${LUMOSAPP_REQUIRED_ROLES[@]}"; do
          if [ "${role}" = "${r}" ]; then
            is_required=true
            break
          fi
        done
        if [ "${is_required}" = "false" ]; then
          roles_to_remove+=("${role}")
        fi
      fi
    done <<< "${existing_roles}"
  fi

  # Remove roles that shouldn't be there
  if [ ${#roles_to_remove[@]} -gt 0 ]; then
    echo "Removing ${#roles_to_remove[@]} unnecessary role(s):"
    for role in "${roles_to_remove[@]}"; do
      echo "  Removing: ${role} -> ${LUMOS_APP_SERVICE_ACCOUNT}"
      gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}" \
        --role="${role}" --quiet >/dev/null 2>&1 || true
    done
  else
    echo "✓ No unnecessary roles to remove"
  fi

  # Add required roles that are missing
  if [ ${#roles_to_add[@]} -gt 0 ]; then
    echo "Adding ${#roles_to_add[@]} missing role(s):"
    for r in "${roles_to_add[@]}"; do
      echo "  Adding: ${r} -> ${LUMOS_APP_SERVICE_ACCOUNT}"
      gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
        --member="serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}" \
        --role="${r}" --quiet
    done
  else
    echo "✓ All required roles already present"
  fi

  # Print resulting roles for confirmation
  echo "Resulting roles for ${LUMOS_APP_SERVICE_ACCOUNT}:"
  gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}" \
    --format="table(bindings.role)"

  # Grant the current gcloud user permission to impersonate the Lumos App service account (for local testing)
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "")
  if [ -n "${CURRENT_ACCOUNT}" ]; then
    echo "Granting user ${CURRENT_ACCOUNT} permission to impersonate ${LUMOS_APP_SERVICE_ACCOUNT} (roles/iam.serviceAccountTokenCreator)"
    gcloud iam service-accounts add-iam-policy-binding "${LUMOS_APP_SERVICE_ACCOUNT}" \
      --member="user:${CURRENT_ACCOUNT}" \
      --role="roles/iam.serviceAccountTokenCreator" --project="${PROJECT_ID}" --quiet || true
  else
    echo "Could not determine current gcloud account; skipping user impersonation grant for ${LUMOS_APP_SERVICE_ACCOUNT}."
  fi
else
  echo "LUMOS_APP_SERVICE_ACCOUNT not set; skipping Lumos App account role configuration."
fi

# Summary: show impersonation grants for verification
CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || echo "(unknown)")
echo "\n--- Impersonation grants summary ---"
echo "Active caller: ${CURRENT_ACCOUNT}"
if [ -n "${TOOL_SERVICE_ACCOUNT:-}" ]; then
  echo "\nTool service account: ${TOOL_SERVICE_ACCOUNT}"
  gcloud iam service-accounts get-iam-policy "${TOOL_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format="table(bindings.role, bindings.members)" || true
fi
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  echo "\nAgent service account: ${AGENT_SERVICE_ACCOUNT}"
  gcloud iam service-accounts get-iam-policy "${AGENT_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format="table(bindings.role, bindings.members)" || true
fi
if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
  echo "\nLumos App service account: ${LUMOS_APP_SERVICE_ACCOUNT}"
  gcloud iam service-accounts get-iam-policy "${LUMOS_APP_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" --format="table(bindings.role, bindings.members)" || true
fi

echo "--- End summary ---\n"

# --- Ensure secret accessor binding for necessary service accounts ---
ensure_secret_accessor_binding() {
  local secret_name="$1"
  local sa_email="$2"

  if [ -z "${sa_email:-}" ]; then
    return 0
  fi

  existing_binding=$(gcloud secrets get-iam-policy "$secret_name" --project="${PROJECT_ID}" --format="json" 2>/dev/null | \
    jq -r ".bindings[]? | select(.role==\"roles/secretmanager.secretAccessor\") | .members[]? | select(. == \"serviceAccount:${sa_email}\")" 2>/dev/null || true)

  if [ -n "${existing_binding}" ]; then
    echo "✓ ${sa_email} already has roles/secretmanager.secretAccessor on ${secret_name}"
  else
    echo "Adding roles/secretmanager.secretAccessor -> ${sa_email} on ${secret_name}"
    gcloud secrets add-iam-policy-binding "$secret_name" \
      --member="serviceAccount:${sa_email}" \
      --role="roles/secretmanager.secretAccessor" --project="${PROJECT_ID}" --quiet
    echo "✅ Bound ${sa_email} to ${secret_name}"
  fi
}

# Bind the lumos secret to tool/agent/app service accounts
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set}"
ensure_secret_accessor_binding "$LUMOS_SECRET_NAME" "${TOOL_SERVICE_ACCOUNT}"
if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
  ensure_secret_accessor_binding "$LUMOS_SECRET_NAME" "${AGENT_SERVICE_ACCOUNT}"
fi
if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
  ensure_secret_accessor_binding "$LUMOS_SECRET_NAME" "${LUMOS_APP_SERVICE_ACCOUNT}"
fi

echo "✅ IAM roles reset and applied successfully."
