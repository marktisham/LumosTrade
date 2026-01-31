#!/usr/bin/env bash
set -euo pipefail

# Update Google Secret Manager with secrets from environment-specific secrets file
# Usage: Called via ./lumos secrets upload

: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${LUMOS_ENVIRONMENT:?LUMOS_ENVIRONMENT must be set}"
: "${SECRETS_FILE:?SECRETS_FILE must be set}"
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set}"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "================================================" >&2
  echo "ERROR: Secrets file not found" >&2
  echo "================================================" >&2
  echo "Expected file: $SECRETS_FILE" >&2
  echo >&2
  echo "To download the latest secrets from Google Secret Manager:" >&2
  echo "  LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos secrets download" >&2
  echo >&2
  echo "Or create the file manually using config/secrets.template.json as a reference." >&2
  echo "================================================" >&2
  exit 1
fi

echo "=================================================="
echo "Updating Google Secret Manager"
echo "=================================================="
echo "Environment: $LUMOS_ENVIRONMENT"
echo "Project:     $PROJECT_ID"
echo "Secret name: $LUMOS_SECRET_NAME"
echo "Secrets:     $SECRETS_FILE"
echo

# Check if secret exists
if gcloud secrets describe "$LUMOS_SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "✓ Secret '$LUMOS_SECRET_NAME' exists"
else
  echo "📝 Creating secret '$LUMOS_SECRET_NAME'..."
  gcloud secrets create "$LUMOS_SECRET_NAME" \
    --replication-policy="automatic" \
    --project="$PROJECT_ID"
  echo "✅ Created secret '$LUMOS_SECRET_NAME'"
fi

# Add new version with contents from secrets file
echo "📝 Adding new version to secret '$LUMOS_SECRET_NAME'..."
gcloud secrets versions add "$LUMOS_SECRET_NAME" \
  --data-file="$SECRETS_FILE" \
  --project="$PROJECT_ID"

echo "✅ Successfully updated secret '$LUMOS_SECRET_NAME' in project $PROJECT_ID"
echo

# Get latest version info
LATEST_VERSION=$(gcloud secrets versions list "$LUMOS_SECRET_NAME" \
  --project="$PROJECT_ID" \
  --limit=1 \
  --format="value(name)")

echo "Latest version: $LATEST_VERSION"
echo
echo "⚠️  IMPORTANT SECURITY REMINDER ⚠️"
echo "================================================"
echo "The secrets file is now uploaded to Google Secret Manager."
echo "File: $SECRETS_FILE"
echo
echo "🚫 DO NOT commit this file to git!"
echo "   (It should already be in .gitignore)"
echo
echo "💡 You can safely delete the local file after upload:"
echo "   rm \"$SECRETS_FILE\""
echo
echo "To download secrets again later, use:"
echo "   LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos secrets download"
echo "================================================"
echo
echo "For security, it is recommended to delete the local secrets file now."
read -r -p "Delete the local secrets file '$SECRETS_FILE' now? [y/N] " delete_local
if [[ "${delete_local}" =~ ^[Yy]$ ]]; then
  if rm -f "$SECRETS_FILE"; then
    echo "✓ Local secrets file deleted"
  else
    echo "⚠️  Failed to delete $SECRETS_FILE"
  fi
else
  echo "⚠️  Remember to delete $SECRETS_FILE when you no longer need it."
  echo "   You can always download it again with: ./lumos secrets download"
fi

echo "To access this secret from code, use the SecretManager utility class."
echo "Service accounts need 'roles/secretmanager.secretAccessor' role."
