#!/usr/bin/env bash
set -euo pipefail

# Auth helper to set the current gcloud project and authenticate.
# Uses PROJECT_ID environment variable (for example, from config/development.env or config/production.env).
# If PROJECT_ID is not set, prompts user to select from available projects.

# Check if already authenticated with an active account
if [ -z "$(gcloud auth list --format='value(account)' 2>/dev/null | head -1)" ]; then
  echo "Authenticating with gcloud..."
  gcloud auth login
  echo ""
fi

# If PROJECT_ID is not set, prompt user to select from available projects
if [ -z "${PROJECT_ID:-}" ]; then
  echo "Fetching available GCP projects..."
  projects_json=$(gcloud projects list --format=json 2>/dev/null || echo "[]")
  projects=()
  
  if [ "$projects_json" != "[]" ] && [ -n "$projects_json" ]; then
    # Parse project IDs from JSON
    while IFS= read -r project_id; do
      if [ -n "$project_id" ]; then
        projects+=("$project_id")
      fi
    done < <(echo "$projects_json" | grep -o '"projectId": "[^"]*"' | cut -d'"' -f4)
  fi
  
  if [ ${#projects[@]} -gt 0 ]; then
    echo ""
    echo "Available GCP projects:"
    for i in "${!projects[@]}"; do
      echo "  $((i+1)). ${projects[$i]}"
    done
    echo ""
    
    # Get current default project if any
    default_project=$(gcloud config get-value project 2>/dev/null || echo "")
    default_selection=""
    
    if [ -n "$default_project" ]; then
      for i in "${!projects[@]}"; do
        if [ "${projects[$i]}" = "$default_project" ]; then
          default_selection=$((i+1))
          break
        fi
      done
      
      if [ -n "$default_selection" ]; then
        read -p "Select project (1-${#projects[@]}) [$default_selection]: " selection
        selection=${selection:-$default_selection}
      else
        read -p "Select project (1-${#projects[@]}): " selection
      fi
    else
      read -p "Select project (1-${#projects[@]}): " selection
    fi
    
    # Validate selection
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#projects[@]}" ]; then
      PROJECT_ID="${projects[$((selection-1))]}"
    else
      echo "Invalid selection." >&2
      exit 1
    fi
  else
    echo ""
    echo "No projects found. Please enter a project ID manually:"
    read -p "GCP Project ID: " PROJECT_ID
    
    if [ -z "$PROJECT_ID" ]; then
      echo "Error: Project ID is required." >&2
      exit 1
    fi
  fi
fi

echo ""
echo "Setting gcloud project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"
gcloud config get-value project

echo ""
echo "Setting up application-default credentials..."
echo "(This will open your browser again for API access authentication)"
echo ""
sleep 2
if gcloud auth application-default login; then
  echo ""
  echo "✓ Authentication complete for project: $PROJECT_ID"
else
  echo ""
  echo "⚠️  Application-default login failed."
  echo ""
  echo "This can happen if the browser authentication didn't complete properly."
  echo "You can try again later with: ./lumos auth login"
  echo ""
  echo "For now, you can still use gcloud CLI commands."
  echo "Application-default credentials are needed for API access from applications."
  exit 1
fi
