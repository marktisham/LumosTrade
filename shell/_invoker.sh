#!/usr/bin/env bash
set -euo pipefail

# Common invoker for environment operations
# Expects environment variables to already be loaded by the caller (dev/prod launcher)

# Resolve base directories once and reuse. This keeps path logic consistent
# when the shell folder is moved relative to the repository root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LUMOSAI_DIR="$(cd "$SCRIPT_DIR/../LumosAI" && pwd)"
LUMOSAPP_DIR="$(cd "$SCRIPT_DIR/../LumosApp" && pwd)"

show_help() {
  ENV_NAME="${LUMOS_ENVIRONMENT:-(not set)}"
  SQL_CONN="${SQL_PROJECT:-<SQL_PROJECT>}:${SQL_REGION:-<SQL_REGION>}:${SQL_INSTANCE:-<SQL_INSTANCE>}"
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  APP_URL_DISPLAY="${LUMOS_APP_SERVICE_URL:-}"
  if [ -z "$APP_URL_DISPLAY" ]; then
    APP_URL_DISPLAY="(not set)"
  fi

  if [ "$ENV_NAME" = "(not set)" ]; then
    ENV_CONFIG_PATH="(not set)"
  else
    ENV_CONFIG_PATH="$ROOT_DIR/config/${ENV_NAME}.env"
  fi

  echo
  echo "Lumos Environment Utility Launcher"
  echo "---------------------------------"
  echo "Current environment: ${ENV_NAME}"
  echo "Lumos Application: ${APP_URL_DISPLAY}"
  echo "Lumos Config: ${ENV_CONFIG_PATH}"

  echo
  echo "Usage: ./lumos <action> [target]"
  echo
  printf "%-10s | %-42s | %s\n" "Action" "Target" "Description"
  printf "%-10s-+-%-42s-+-%s\n" "----------" "------------------------------------------" "----------------------------------------"
  printf "%-10s | %-42s | %s\n" "auth" "login, logout" "Authenticate or revoke gcloud CLI"
  printf "%-10s | %-42s | %s\n" "build" "clean, watch, lumostradetool" "Build helpers and tools"
  printf "%-10s | %-42s | %s\n" "deploy" "all, allparallel, lumosapp, lumosagents," "Deploy services for the ${ENV_NAME} environment"
  printf "%-10s | %-42s | %s\n" "" "lumosdb, lumostradetool" ""
  printf "%-10s | %-42s | %s\n" "env" "set, list, validate, show, update, delete" "Manage environment configuration:"
  printf "%-10s | %-42s | %s\n" "" "" "  set - Switch to or create environment"
  printf "%-10s | %-42s | %s\n" "" "" "  Or use: ./lumos <environment> as shortcut"
  printf "%-10s | %-42s | %s\n" "" "" "  list - Show all available environments"
  printf "%-10s | %-42s | %s\n" "" "" "  validate - Check environment is valid"
  printf "%-10s | %-42s | %s\n" "" "" "  show - Display all environment variables"
  printf "%-10s | %-42s | %s\n" "" "" "  update - Regenerate expanded env file"
  printf "%-10s | %-42s | %s\n" "" "" "  delete - Delete an environment"
  printf "%-10s | %-42s | %s\n" "install" "-" "Install all GCP resources for Lumos"
  printf "%-10s | %-42s | %s\n" "run" "lumosagents, lumosdb, lumosdb-agent," "Run local tools and agents"
  printf "%-10s | %-42s | %s\n" "" "lumostradetool, lumostradetool-agent" ""
  printf "%-10s | %-42s | %s\n" "secrets" "download, upload" "Manage Google Secret Manager secrets"
  printf "%-10s | %-42s | %s\n" "service" "test, update" "Manage service accounts and permissions"
  printf "%-10s | %-42s | %s\n" "sql" "-" "Start Cloud SQL Proxy"
  echo
  echo "Examples:"
  echo "  ./lumos auth"
  echo "  ./lumos build clean"
  echo "  ./lumos development                    # Quick environment switch"
  echo "  ./lumos env set development"
  echo "  ./lumos env show"
  echo "  ./lumos env update"
  echo "  ./lumos install"
  echo "  ./lumos sql"
  echo

}


# Helper to print red error messages to stderr (exported for child scripts)
echo_err() {
  if [ -t 2 ]; then
    if command -v tput >/dev/null 2>&1; then
      red=$(tput setaf 1)
      reset=$(tput sgr0)
    else
      red='\033[31m'
      reset='\033[0m'
    fi
    printf '%b
' "${red}$1${reset}" >&2
  else
    printf '%s
' "$1" >&2
  fi
}

# Export helper so child bash scripts can use it (requires bash)
export -f echo_err || true

# If no args: show help
if [ "$#" -eq 0 ]; then
  show_help
  exit 0
fi

operation="$1"
shift || true

targets_for_operation() {
  case "$1" in
    # Future operations that require targets can be enumerated here
    *)
      echo "No targets available for operation: $1"
      ;;
  esac
}

case "$operation" in
  secrets)
    # Secrets operations with targets (download, update)
    if [ "$#" -eq 0 ]; then
      echo "Available secrets targets:"
      echo "  download  Download secrets from Google Secret Manager to local file"
      echo "  upload    Upload secrets to Google Secret Manager from local file"
      exit 0
    fi

    target="$1"
    case "$target" in
      download)
        # Call the download secrets script in shell folder
        SECRETS_SCRIPT="$SCRIPT_DIR/_download_secrets.sh"
        if [ ! -f "$SECRETS_SCRIPT" ]; then
          echo "Error: secrets script not found at $SECRETS_SCRIPT" >&2
          exit 1
        fi

        echo "Secrets target: download -> invoking $SECRETS_SCRIPT"
        bash "$SECRETS_SCRIPT"
        ;;

      upload)
        # Call the update secrets script in shell folder
        SECRETS_SCRIPT="$SCRIPT_DIR/_update_secrets.sh"
        if [ ! -f "$SECRETS_SCRIPT" ]; then
          echo "Error: secrets script not found at $SECRETS_SCRIPT" >&2
          exit 1
        fi

        echo "Secrets target: upload -> invoking $SECRETS_SCRIPT"
        bash "$SECRETS_SCRIPT"
        ;;

      *)
        echo "Unknown secrets target: $target" >&2
        echo "Available secrets targets:"
        echo "  download"
        echo "  upload"
        exit 2
        ;;
    esac
    ;;

  service)
    # Service operations with targets (update, test)
    if [ "$#" -eq 0 ]; then
      echo "Available service targets:"
      echo "  test      Run tests for service account permissions (placeholder)"
      echo "  update    Update or (re)initialize service account permissions"
      exit 0
    fi

    target="$1"
    case "$target" in
      test)
        # Invoke the test script (placeholder)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        TEST_SCRIPT="$SCRIPT_DIR/_test_service_accounts.sh"
        if [ ! -f "$TEST_SCRIPT" ]; then
          echo "Error: test script not found at $TEST_SCRIPT" >&2
          exit 1
        fi

        echo "Service target: test -> invoking $TEST_SCRIPT"
        bash "$TEST_SCRIPT"
        ;;

      update)
        # Call the service accounts script _service_accounts.sh in this shell folder
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        SERVICE_SCRIPT="$SCRIPT_DIR/_service_accounts.sh"
        if [ ! -f "$SERVICE_SCRIPT" ]; then
          echo "Error: service accounts script not found at $SERVICE_SCRIPT" >&2
          exit 1
        fi

        echo "Service target: update -> invoking $SERVICE_SCRIPT"
        bash "$SERVICE_SCRIPT"
        ;;

      *)
        echo "Unknown service target: $target" >&2
        echo "Available service targets:"
        echo "  test"
        echo "  update"
        exit 2
        ;;
    esac
    ;;

  deploy)
    # Deploy operations with targets (e.g., lumosdb)
    if [ "$#" -eq 0 ]; then
      echo "Available deploy targets:"
      echo "  all          Deploy all services sequentially (LumosDB -> LumosTradeTool -> LumosAgents -> LumosApp)"
      echo "  allparallel  Deploy all services in parallel (each in a new terminal window)"
      echo "  lumosapp     Deploy the Lumos App (Web UI)"
      echo "  lumosagents    Deploy the Lumos Agents"
      echo "  lumosdb      Deploy the Lumos DB service"
      echo "  lumostradetool Deploy the Lumos Trade MCP Tool service"
      exit 0
    fi

    target="$1"
    case "$target" in
      all)
        echo "Deploy target: all -> deploying lumosdb, lumostradetool, lumoschat, lumosapp sequentially"

        # 1. LumosDB
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosDB/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Step 1/4: Deploying lumosdb..."
        bash "$DEPLOY_SCRIPT"

        # 2. LumosTradeTool
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosTradeTool/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Step 2/4: Deploying lumostradetool..."
        bash "$DEPLOY_SCRIPT"

        # 3. LumosAgents
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Agents/LumosAgents/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Step 3/4: Deploying lumosagents..."
        bash "$DEPLOY_SCRIPT"

        # 4. LumosApp
        DEPLOY_SCRIPT="$LUMOSAPP_DIR/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Step 4/4: Deploying lumosapp..."
        bash "$DEPLOY_SCRIPT"
        ;;
      allparallel)
        echo "Deploy target: allparallel -> launching all deployments in parallel terminal windows"
        
        # Get the absolute path to the repo root
        REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
        
        # Open new terminal windows for each deployment
        # macOS: use osascript to open Terminal with commands
        if [[ "$OSTYPE" == "darwin"* ]]; then
          echo "Opening terminal for lumosdb deployment..."
          osascript -e "tell application \"Terminal\" to do script \"cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosdb\"" >/dev/null
          
          echo "Opening terminal for lumostradetool deployment..."
          osascript -e "tell application \"Terminal\" to do script \"cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumostradetool\"" >/dev/null
          
          echo "Opening terminal for lumosagents deployment..."
          osascript -e "tell application \"Terminal\" to do script \"cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosagents\"" >/dev/null
          
          echo "Opening terminal for lumosapp deployment..."
          osascript -e "tell application \"Terminal\" to do script \"cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosapp\"" >/dev/null
          
          echo "All deployments launched in parallel terminal windows."
        else
          # Linux/other: try gnome-terminal or xterm
          if command -v gnome-terminal >/dev/null 2>&1; then
            gnome-terminal -- bash -c "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosdb; exec bash" &
            gnome-terminal -- bash -c "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumostradetool; exec bash" &
            gnome-terminal -- bash -c "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosagents; exec bash" &
            gnome-terminal -- bash -c "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosapp; exec bash" &
            echo "All deployments launched in parallel terminal windows."
          elif command -v xterm >/dev/null 2>&1; then
            xterm -e "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosdb; exec bash" &
            xterm -e "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumostradetool; exec bash" &
            xterm -e "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosagents; exec bash" &
            xterm -e "cd '$REPO_ROOT' && LUMOS_ENVIRONMENT=${LUMOS_ENVIRONMENT} ./lumos deploy lumosapp; exec bash" &
            echo "All deployments launched in parallel terminal windows."
          else
            echo_err "Error: Cannot open new terminal windows. No suitable terminal emulator found."
            echo_err "Please install gnome-terminal or xterm, or run deployments manually."
            exit 1
          fi
        fi
        ;;
      lumosapp)
        # Deploy LumosApp web UI
        DEPLOY_SCRIPT="$LUMOSAPP_DIR/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Deploy target: lumosapp -> invoking $DEPLOY_SCRIPT"
        bash "$DEPLOY_SCRIPT"
        ;;
      lumosagents)
        # (SCRIPT_DIR already resolved above)
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Agents/LumosAgents/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Deploy target: lumosagents -> invoking $DEPLOY_SCRIPT"
        bash "$DEPLOY_SCRIPT"
        ;;
      lumosdb)
        # (SCRIPT_DIR already resolved above)
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosDB/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Deploy target: lumosdb -> invoking $DEPLOY_SCRIPT"
        bash "$DEPLOY_SCRIPT"
        ;;
      lumostradetool)
        DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosTradeTool/_deploy.sh"
        if [ ! -f "$DEPLOY_SCRIPT" ]; then
          echo "Error: deploy script not found at $DEPLOY_SCRIPT" >&2
          exit 1
        fi
        echo "Deploy target: lumostradetool -> invoking $DEPLOY_SCRIPT"
        bash "$DEPLOY_SCRIPT"
        ;;
      *)
        echo "Unknown deploy target: $target" >&2
        echo "Available deploy targets:"
        echo "  all"
        echo "  allparallel"
        echo "  lumosapp"
        echo "  lumosagents"
        echo "  lumosdb"
        echo "  lumostradetool"
        exit 2
        ;;
    esac
    ;;

  env)
    ENV_SOURCE="$(cd "$SCRIPT_DIR/.." && pwd)/config/${LUMOS_ENVIRONMENT}.env"
    ENV_EXPANDED="$(cd "$SCRIPT_DIR/.." && pwd)/config/${LUMOS_ENVIRONMENT}.expanded.env"

    target="${1:-show}"
    
    case "$target" in
      show)
        echo
        echo "===================================================================="
        echo "SOURCE ENVIRONMENT FILE: ${ENV_SOURCE}"
        echo "===================================================================="
        if [ -f "${ENV_SOURCE}" ]; then
          # Show only variable declarations, strip comments and empty lines
          grep -E '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "${ENV_SOURCE}" \
            | sed 's/^[[:space:]]*export[[:space:]]\+//; s/^[[:space:]]*//; s/[[:space:]]*$//' \
            | sort
        else
          echo "(source file not found: ${ENV_SOURCE})"
        fi

        echo
        echo "===================================================================="
        echo "EXPANDED ENVIRONMENT FILE: ${ENV_EXPANDED}"
        echo "===================================================================="
        if [ -f "${ENV_EXPANDED}" ]; then
          # Show only variable declarations
          grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ENV_EXPANDED}" \
            | sort
        else
          echo "(expanded file not found: ${ENV_EXPANDED})"
          echo "Run './lumos env update' to generate it."
        fi

        echo
        echo "===================================================================="
        echo "CURRENT SHELL ENVIRONMENT VARIABLES"
        echo "===================================================================="
        # Print exported variables visible to this shell; remove function bodies,
        # exclude exported function names, then sort for readability
        env | sed '/^[[:space:]]/d' \
            | grep -v -E '^[^=]+\(\)=' \
            | grep -v -E '^BASH_FUNC_' \
            | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' \
            | sort
        ;;

      update)
        echo "Regenerating expanded environment file..."
        bash "$SCRIPT_DIR/_expand_env.sh"
        
        if [ -f "${ENV_EXPANDED}" ]; then
          echo
          echo "Reloading environment variables from ${ENV_EXPANDED}..."
          set -a
          # shellcheck disable=SC1090
          source "${ENV_EXPANDED}"
          set +a
          echo "Environment variables updated in current shell."
          echo
          echo "Note: This only affects the current terminal session."
          echo "VS Code launch configurations will use the updated file automatically."
        else
          echo_err "Error: Failed to generate ${ENV_EXPANDED}"
          exit 1
        fi
        ;;

      set|list|validate)
        echo_err "Error: The 'env $target' command should be handled by the main ./lumos script."
        echo_err "Please use: ./lumos env $target"
        exit 1
        ;;

      *)
        echo_err "Unknown env target: $target"
        echo "Available env targets:"
        echo "  show     - Display source, expanded, and current environment variables"
        echo "  update   - Regenerate expanded env file and reload variables"
        echo "  set      - Set or create environment (use: ./lumos env set)"
        echo "  list     - List available environments (use: ./lumos env list)"
        echo "  validate - Validate environment configuration (use: ./lumos env validate)"
        exit 1
        ;;
    esac
    ;;

  run)
    # Run operations with targets (e.g., lumosdb)
    if [ "$#" -eq 0 ]; then
      echo "Available run targets:"
      echo "  lumosagents      Run the local agent (ADK web) for LumosAgents"
      echo "  lumosdb          Run the toolbox instance for Lumos DB"
      echo "  lumosdb-agent    Run the local agent (ADK web) for Lumos DB"
      echo "  lumostradetool   Run the local LumosTradeTool MCP server"
      echo "  lumostradetool-agent Run the local test agent (ADK web) for LumosTradeTool"
      exit 0
    fi

    target="$1"
    case "$target" in
      lumosdb)
        # (SCRIPT_DIR already resolved above)
        TOOLBOX_SCRIPT="$LUMOSAI_DIR/Tools/LumosDB/_run_toolbox.sh"
        if [ ! -f "$TOOLBOX_SCRIPT" ]; then
          echo "Error: toolbox script not found at $TOOLBOX_SCRIPT" >&2
          exit 1
        fi
        echo "Run target: lumosdb -> invoking $TOOLBOX_SCRIPT"
        bash "$TOOLBOX_SCRIPT"
        ;;
      lumosdb-agent)
        # (SCRIPT_DIR already resolved above)
        TARGET_DIR="$LUMOSAI_DIR/Tools/LumosDB"
        AGENT_SCRIPT="$TARGET_DIR/_run_local_agent.sh"
        if [ ! -f "$AGENT_SCRIPT" ]; then
          echo "Error: agent script not found at $AGENT_SCRIPT" >&2
          exit 1
        fi
        echo "Run target: lumosdb-agent -> invoking $AGENT_SCRIPT from $TARGET_DIR"
        (cd "$TARGET_DIR" && bash "$AGENT_SCRIPT")
        ;;
      lumosagents)
        # (SCRIPT_DIR already resolved above)
        TARGET_DIR="$LUMOSAI_DIR/Agents/LumosAgents"
        AGENT_SCRIPT="$TARGET_DIR/_run_local_agent.sh"
        if [ ! -f "$AGENT_SCRIPT" ]; then
          echo "Error: agent script not found at $AGENT_SCRIPT" >&2
          exit 1
        fi
        echo "Run target: lumosagents -> invoking $AGENT_SCRIPT from $TARGET_DIR"
        (cd "$TARGET_DIR" && bash "$AGENT_SCRIPT")
        ;;
      lumostradetool)
        TARGET_DIR="$LUMOSAI_DIR/Tools/LumosTradeTool"
        TOOL_SCRIPT="$TARGET_DIR/_run_tool.sh"
        if [ ! -f "$TOOL_SCRIPT" ]; then
          echo "Error: tool script not found at $TOOL_SCRIPT" >&2
          exit 1
        fi
        echo "Run target: lumostradetool -> invoking $TOOL_SCRIPT from $TARGET_DIR"
        (cd "$TARGET_DIR" && bash "$TOOL_SCRIPT")
        ;;
      lumostradetool-agent)
        TARGET_DIR="$LUMOSAI_DIR/Tools/LumosTradeTool"
        AGENT_SCRIPT="$TARGET_DIR/_run_local_agent.sh"
        if [ ! -f "$AGENT_SCRIPT" ]; then
          echo "Error: agent script not found at $AGENT_SCRIPT" >&2
          exit 1
        fi
        echo "Run target: lumostradetool-agent -> invoking $AGENT_SCRIPT from $TARGET_DIR"
        (cd "$TARGET_DIR" && bash "$AGENT_SCRIPT")
        ;;
      *)
        echo "Unknown run target: $target" >&2
        echo "Available run targets:"
        echo "  lumosdb"
        echo "  lumosdb-agent"
        echo "  lumosagents"
        echo "  lumostradetool"
        echo "  lumostradetool-agent"
        exit 2
        ;;
    esac
    ;;

  sql)
    # Start Cloud SQL Proxy for the selected environment
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    SQL_SCRIPT="$SCRIPT_DIR/_sql_proxy.sh"
    if [ ! -f "$SQL_SCRIPT" ]; then
      echo "Error: sql proxy script not found at $SQL_SCRIPT" >&2
      exit 1
    fi

    echo "SQL operation -> invoking $SQL_SCRIPT"
    bash "$SQL_SCRIPT"
    ;;

  auth)
    # Authenticate or logout of gcloud CLI
    if [ "$#" -eq 0 ]; then
      echo "Available auth targets:"
      echo "  login     Authenticate with Google Cloud (default)"
      echo "  logout    Revoke Google Cloud authentication"
      exit 0
    fi

    target="$1"
    case "$target" in
      login)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        AUTH_SCRIPT="$SCRIPT_DIR/_auth_gcp.sh"
        if [ ! -f "$AUTH_SCRIPT" ]; then
          echo "Error: auth script not found at $AUTH_SCRIPT" >&2
          exit 1
        fi

        echo "Auth target: login -> invoking $AUTH_SCRIPT"
        bash "$AUTH_SCRIPT"
        ;;

      logout)
        echo "Auth target: logout -> revoking gcloud authentication"
        echo ""
        
        # Check for regular gcloud accounts
        ACCOUNTS=$(gcloud auth list --format='value(account)' 2>/dev/null)
        
        # Check for application-default credentials
        HAS_APP_DEFAULT=false
        if gcloud auth application-default print-access-token &>/dev/null; then
          HAS_APP_DEFAULT=true
        fi

        if [ -n "$ACCOUNTS" ] || [ "$HAS_APP_DEFAULT" = true ]; then
          # Revoke regular accounts if any exist
          if [ -n "$ACCOUNTS" ]; then
            echo "Revoking authenticated accounts..."
            gcloud auth revoke --all
          fi
          
          # Revoke application-default credentials if they exist
          if [ "$HAS_APP_DEFAULT" = true ]; then
            echo "Revoking application-default credentials..."
            gcloud auth application-default revoke
          fi
          
          echo ""
          echo "✓ Successfully logged out of Google Cloud"
        else
          echo "✓ No authenticated accounts found. Already logged out."
        fi
        ;;

      *)
        echo "Unknown auth target: $target" >&2
        echo "Available auth targets:"
        echo "  login"
        echo "  logout"
        exit 2
        ;;
    esac
    ;;

  install)
    # Install all GCP resources for Lumos
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    INSTALL_SCRIPT="$SCRIPT_DIR/_install.sh"
    if [ ! -f "$INSTALL_SCRIPT" ]; then
      echo "Error: install script not found at $INSTALL_SCRIPT" >&2
      exit 1
    fi

    echo "Install operation -> invoking $INSTALL_SCRIPT"
    bash "$INSTALL_SCRIPT"
    ;;

  build)
    # Build helpers with targets (clean, watch)
    if [ "$#" -eq 0 ]; then
      echo "Available build targets:"
      echo "  clean    Remove artifacts and rebuild all packages"
      echo "  watch    Start typescript watchers for local dev"
      echo "  lumostradetool  Build the LumosTradeTool TypeScript MCP server"
      exit 0
    fi

    target="$1"
    case "$target" in
      clean)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        CLEAN_SCRIPT="$SCRIPT_DIR/_clean_rebuild.sh"
        if [ ! -f "$CLEAN_SCRIPT" ]; then
          echo "Error: clean script not found at $CLEAN_SCRIPT" >&2
          exit 1
        fi

        echo "Build target: clean -> invoking $CLEAN_SCRIPT"
        bash "$CLEAN_SCRIPT"
        ;;
      watch)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        WATCH_SCRIPT="$SCRIPT_DIR/_watch_all.sh"
        if [ ! -f "$WATCH_SCRIPT" ]; then
          echo "Error: watch script not found at $WATCH_SCRIPT" >&2
          exit 1
        fi

        echo "Build target: watch -> invoking $WATCH_SCRIPT"
        bash "$WATCH_SCRIPT"
        ;;
      lumostradetool)
        BUILD_SCRIPT="$LUMOSAI_DIR/Tools/LumosTradeTool/_build.sh"
        if [ ! -f "$BUILD_SCRIPT" ]; then
          echo "Error: build script not found at $BUILD_SCRIPT" >&2
          exit 1
        fi
        echo "Build target: lumostradetool -> invoking $BUILD_SCRIPT"
        bash "$BUILD_SCRIPT"
        ;;
      *)
        echo "Unknown build target: $target" >&2
        echo "Available build targets: clean, watch, lumostradetool"
        exit 2
        ;;
    esac
    ;;
  *)
    echo "Unknown operation: $operation" >&2
    show_help
    exit 2
    ;;
esac
