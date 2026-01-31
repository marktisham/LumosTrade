#!/usr/bin/env bash
set -euo pipefail

# Download secrets from Google Secret Manager to local file
# Usage: Called via ./lumos secrets download

: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${LUMOS_ENVIRONMENT:?LUMOS_ENVIRONMENT must be set}"
: "${SECRETS_FILE:?SECRETS_FILE must be set}"
: "${LUMOS_SECRET_NAME:?LUMOS_SECRET_NAME must be set}"

echo "=================================================="
echo "Downloading Secrets from Google Secret Manager"
echo "=================================================="
echo "Environment: $LUMOS_ENVIRONMENT"
echo "Project:     $PROJECT_ID"
echo "Secret name: $LUMOS_SECRET_NAME"
echo "Target file: $SECRETS_FILE"
echo

# Check if secret exists
if ! gcloud secrets describe "$LUMOS_SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "⚠️  Secret '$LUMOS_SECRET_NAME' does not exist in project $PROJECT_ID"
  echo
  
  # Automatically copy template file
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TEMPLATE_FILE="$SCRIPT_DIR/../config/secrets.template.json"
  
  if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "❌ ERROR: Template file not found at $TEMPLATE_FILE" >&2
    exit 1
  fi
  
  # Create directory if it doesn't exist
  SECRETS_DIR="$(dirname "$SECRETS_FILE")"
  mkdir -p "$SECRETS_DIR"
  
  echo "📋 Creating secrets file from template..."
  
  # Copy template and update with environment-specific values
  echo "Copying template file..."
  if ! cp "$TEMPLATE_FILE" "$SECRETS_FILE"; then
    echo "❌ ERROR: Failed to copy template file" >&2
    exit 1
  fi
  echo "✓ Template copied"
  
  if command -v jq >/dev/null 2>&1; then
    echo "Updating comment fields with jq..."
    # Use jq to update comment fields only
    TEMP_FILE=$(mktemp)
    if ! jq --arg env "$LUMOS_ENVIRONMENT" \
       '._comment = ("Lumos Secrets for " + $env + " environment") |
        ._comment2 = "To update these secrets, edit this file and run: ./lumos secrets upload" |
        ._comment3 = "To download latest from Secret Manager: ./lumos secrets download" |
        if has("_comment4") then del(._comment4) else . end |
        if has("_comment5") then del(._comment5) else . end |
        if has("_comment6") then del(._comment6) else . end |
        .Brokers._comment = "Broker credentials can be added later and updated with: ./lumos secrets upload"' \
       "$SECRETS_FILE" > "$TEMP_FILE"; then
      echo "❌ ERROR: jq command failed" >&2
      cat "$TEMP_FILE" >&2
      rm -f "$TEMP_FILE"
      exit 1
    fi
    if ! mv "$TEMP_FILE" "$SECRETS_FILE"; then
      echo "❌ ERROR: Failed to move temporary file" >&2
      exit 1
    fi
    echo "✓ Comments updated with jq"
  else
    # Fallback: use sed for basic replacements (less reliable but works without jq)
    sed -i.bak \
      -e "s/\"_comment\": \".*\"/\"_comment\": \"Lumos Secrets for ${LUMOS_ENVIRONMENT} environment\"/" \
      -e "s/\"_comment2\": \".*\"/\"_comment2\": \"To update these secrets, edit this file and run: .\/lumos secrets upload\"/" \
      -e "s/\"_comment3\": \".*\"/\"_comment3\": \"To download latest from Secret Manager: .\/lumos secrets download\"/" \
      -e "/\"_comment4\":/d" \
      -e "/\"_comment5\":/d" \
      -e "/\"_comment6\":/d" \
      "$SECRETS_FILE"
    rm -f "${SECRETS_FILE}.bak"
    echo "✓ Comments updated with sed"
  fi
  
  echo "✅ Secrets file created from template!"
  echo
  echo "📝 Next steps:"
  echo "  1. Review/edit $SECRETS_FILE and add actual values"
  echo "  2. Add broker credentials (optional - can be done later)"
  echo "  3. Upload to Secret Manager: ./lumos secrets upload"
  echo "  4. Delete the local file: rm $SECRETS_FILE"
  echo
  exit 0
fi

# Create directory if it doesn't exist
SECRETS_DIR="$(dirname "$SECRETS_FILE")"
mkdir -p "$SECRETS_DIR"

# Download the latest version
echo "📥 Downloading latest version of secret '$LUMOS_SECRET_NAME'..."
if ! gcloud secrets versions access latest \
  --secret="$LUMOS_SECRET_NAME" \
  --project="$PROJECT_ID" > "$SECRETS_FILE"; then
  echo "❌ ERROR: Failed to download secret" >&2
  exit 1
fi

echo "✅ Successfully downloaded secret to: $SECRETS_FILE"
echo

# Get latest version info
LATEST_VERSION=$(gcloud secrets versions list "$LUMOS_SECRET_NAME" \
  --project="$PROJECT_ID" \
  --limit=1 \
  --format="value(name)")

echo "Downloaded version: $LATEST_VERSION"
echo

echo "⚠️  IMPORTANT SECURITY REMINDER ⚠️"
echo "================================================"
echo "🚨 DO NOT commit this file to git!"
echo "   (It should already be in .gitignore)"
echo
echo "📝 This file contains sensitive secrets and should only be:"
echo "   • Kept locally for reference"
echo "   • Deleted after viewing/editing"
echo "   • Stored in a password manager"
echo
echo "💡 After editing, upload changes with:"
echo "   LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos secrets upload"
echo
echo "🗑️  To delete after viewing:"
echo "   rm \"$SECRETS_FILE\""
echo "================================================"
