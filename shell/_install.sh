#!/usr/bin/env bash
set -euo pipefail

# Lumos Installation Script
# Installs all required GCP resources for running Lumos
# This script is designed to be safely re-runnable

# Fallback if invoked directly (echo_err is exported by shell/_invoker.sh)
if ! declare -F echo_err >/dev/null 2>&1; then
	echo_err() {
		if [ -t 2 ]; then
			if command -v tput >/dev/null 2>&1; then
				red=$(tput setaf 1)
				reset=$(tput sgr0)
			else
				red='\033[31m'
				reset='\033[0m'
			fi
			printf '%b\n' "${red}$1${reset}" >&2
		else
			printf '%s\n' "$1" >&2
		fi
	}
fi

# Helper for green success messages
echo_success() {
	if [ -t 1 ]; then
		if command -v tput >/dev/null 2>&1; then
			green=$(tput setaf 2)
			reset=$(tput sgr0)
		else
			green='\033[32m'
			reset='\033[0m'
		fi
		printf '%b\n' "${green}$1${reset}"
	else
		printf '%s\n' "$1"
	fi
}

# Helper for yellow warning messages
echo_warn() {
	if [ -t 1 ]; then
		if command -v tput >/dev/null 2>&1; then
			yellow=$(tput setaf 3)
			reset=$(tput sgr0)
		else
			yellow='\033[33m'
			reset='\033[0m'
		fi
		printf '%b\n' "${yellow}$1${reset}"
	else
		printf '%s\n' "$1"
	fi
}

# Spinner helpers for updating status on single line
spinner_update() {
	local message="$1"
	printf "\r\033[K%s" "$message"
}

spinner_done() {
	local message="$1"
	printf "\r\033[K%s\n" "$message"
}

# Helper for section headers
banner() {
	printf '\n============================================================\n'
	printf '%s\n' "$1"
	printf '============================================================\n\n'
}

# Helper to prompt for yes/no
prompt_yes_no() {
	local prompt="$1"
	local default="${2:-}"
	local response
	local prompt_suffix="(y/n)"
	
	if [ -n "$default" ]; then
		if [ "$default" = "y" ]; then
			prompt_suffix="(Y/n)"
		else
			prompt_suffix="(y/N)"
		fi
	fi
	
	while true; do
		read -p "$prompt $prompt_suffix: " response
		
		# Use default if response is empty
		if [ -z "$response" ] && [ -n "$default" ]; then
			response="$default"
		fi
		
		case "$response" in
			[Yy]* ) return 0;;
			[Nn]* ) return 1;;
			* ) echo "Please answer y or n.";;
		esac
	done
}

# Helper to generate secure random password
generate_password() {
	openssl rand -base64 16 | tr -d "=+/" | cut -c1-16
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LUMOSAI_DIR="$REPO_ROOT/LumosAI"
LUMOSAPP_DIR="$REPO_ROOT/LumosApp"

# ============================================================
# INITIAL VALIDATION: Environment variables
# ============================================================
echo
echo "Validating environment configuration..."
echo

# First, expand the environment file to ensure we have the latest values
if [ -n "${LUMOS_ENVIRONMENT:-}" ]; then
	echo "Refreshing environment variables for ${LUMOS_ENVIRONMENT}..."
	EXPAND_SCRIPT="$SCRIPT_DIR/_expand_env.sh"
	EXPANDED_ENV_FILE="$REPO_ROOT/config/${LUMOS_ENVIRONMENT}.expanded.env"
	
	if [ -f "$EXPAND_SCRIPT" ]; then
		bash "$EXPAND_SCRIPT" >/dev/null 2>&1 || true
		
		# Source the expanded file to load the new values
		if [ -f "$EXPANDED_ENV_FILE" ]; then
			set -a
			# shellcheck disable=SC1090
			source "$EXPANDED_ENV_FILE"
			set +a
		fi
		echo "✓ Environment variables refreshed"
	fi
fi
echo

if [ -z "${PROJECT_ID:-}" ]; then
	echo_err "ERROR: PROJECT_ID environment variable is not set."
	echo_err "Please set up your environment first:"
	echo_err "  ./lumos env set <environment>"
	exit 1
fi

if [ -z "${PROJECT_NUMBER:-}" ]; then
	echo_err "ERROR: PROJECT_NUMBER environment variable is not set."
	echo_err "Please update your environment configuration file:"
	echo_err "  config/${LUMOS_ENVIRONMENT}.env"
	exit 1
fi

if [ -z "${REGION:-}" ]; then
	echo_err "ERROR: REGION environment variable is not set."
	echo_err "Please update your environment configuration file:"
	echo_err "  config/${LUMOS_ENVIRONMENT}.env"
	exit 1
fi

# ============================================================
# PROJECT AND RESOURCES OVERVIEW
# ============================================================
banner "Lumos GCP Resources Installation"

cat << EOF
╔════════════════════════════════════════════════════════════════╗
║            Lumos GCP Infrastructure Setup                      ║
╚════════════════════════════════════════════════════════════════╝

This script will install Lumos in your Google Cloud Platform project:

  📦 PROJECT_ID:     ${PROJECT_ID}
  🌍 REGION:         ${REGION}
  🏷️  ENVIRONMENT:    ${LUMOS_ENVIRONMENT}

📋 RESOURCES TO BE CREATED:
   • Cloud SQL MySQL 8.4 instance (~\$7-15/month for db-f1-micro)
   • Firestore in Datastore mode (minimal cost for small datasets)
   • Cloud Run services (pay per request + resource usage)
   • Secret Manager (minimal cost)
   • Cloud Build executions (pay per build minute)
   • Cloud Scheduler cron job (optional daily automation)

IMPORTANT NOTES:
   ✓ This script is re-runnable and will skip existing resources
   ✓ Resources created will incur GCP billing charges
   ✓ Recommended: Use a dedicated GCP project for Lumos to:
     • Isolate resources and billing
     • Simplify cleanup (delete entire project if needed)
     • Avoid conflicts with existing resources
     • Better track Lumos-specific costs

🔧 To use a different project or environment:
   1. Exit this script (press 'n' below)
   2. Create a new environment:
      ./lumos env set
   3. Edit the generated config file with your project details:
      config/<environment-name>.env
   4. Re-run this script:
      ./lumos install

EOF
echo
echo "Current environment: ${LUMOS_ENVIRONMENT}"
echo

if ! prompt_yes_no "Is '${PROJECT_ID}' the correct project for this installation?"; then
	echo
	echo "Installation cancelled."
	echo
	echo "To create a new environment:"
	echo "  ./lumos env set"
	echo
	echo "To switch to an existing environment:"
	echo "  ./lumos env set"
	echo
	echo "Available environments:"
	find "$REPO_ROOT/config" -name "*.env" -not -name "template.env" -not -name "*.expanded.env" -exec basename {} .env \; 2>/dev/null | sed 's/^/  • /'
	echo
	exit 0
fi

echo
echo "Proceeding with installation..."
echo

# ============================================================
# STEP 1: Validate environment configuration
# ============================================================
banner "Step 1: Validating Environment Configuration"

echo_success "✓ Environment variables validated:"
echo "  PROJECT_ID:     $PROJECT_ID"
echo "  PROJECT_NUMBER: $PROJECT_NUMBER"
echo "  REGION:         $REGION"
echo

# ============================================================
# STEP 2: Verify prerequisites (gcloud, auth, APIs)
# ============================================================
banner "Step 2: Checking Prerequisites"

# Check gcloud CLI
if ! command -v gcloud >/dev/null 2>&1; then
	echo_err "ERROR: gcloud CLI is not installed."
	echo
	echo "The gcloud CLI is required to manage Google Cloud resources."
	echo
	echo "Installation instructions:"
	echo "  macOS:   https://cloud.google.com/sdk/docs/install-sdk#mac"
	echo "  Linux:   https://cloud.google.com/sdk/docs/install-sdk#linux"
	echo "  Windows: https://cloud.google.com/sdk/docs/install-sdk#windows"
	echo
	echo "Quick install for macOS (using Homebrew):"
	echo "  brew install --cask google-cloud-sdk"
	echo
	echo "After installation, run this script again."
	exit 1
fi
echo_success "✓ gcloud CLI is installed"

# Check authentication
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
	echo_warn "⚠️  You are not authenticated with gcloud."
	echo
	if prompt_yes_no "Run './lumos auth' to authenticate?"; then
		AUTH_SCRIPT="$SCRIPT_DIR/_auth_gcp.sh"
		bash "$AUTH_SCRIPT"
		echo
	else
		echo_err "ERROR: Authentication required to continue."
		echo_err "Run './lumos auth' and then re-run this script."
		exit 1
	fi
fi
echo_success "✓ gcloud authentication verified"

# Verify authentication to the specific project
echo
echo "Verifying project access..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
	echo "Setting active project to $PROJECT_ID..."
	if gcloud config set project "$PROJECT_ID" 2>/dev/null; then
		echo_success "✓ Active project set to $PROJECT_ID"
	else
		echo_err "ERROR: Failed to set active project."
		echo_err "You may need to authenticate to this specific project."
		echo
		if prompt_yes_no "Authenticate to project $PROJECT_ID now?"; then
			gcloud auth login --project="$PROJECT_ID"
			gcloud auth application-default login
			gcloud config set project "$PROJECT_ID"
			echo_success "✓ Authenticated to project $PROJECT_ID"
		else
			echo_err "ERROR: Project authentication required."
			exit 1
		fi
	fi
else
	echo_success "✓ Authenticated to project $PROJECT_ID"
fi

# Check and enable required APIs
echo
echo "Checking required GCP APIs..."
REQUIRED_APIS=(
	"sqladmin.googleapis.com"
	"run.googleapis.com"
	"cloudbuild.googleapis.com"
	"secretmanager.googleapis.com"
	"iam.googleapis.com"
	"cloudresourcemanager.googleapis.com"
	"servicenetworking.googleapis.com"
	"compute.googleapis.com"
	"aiplatform.googleapis.com"
	"firestore.googleapis.com"
	"datastore.googleapis.com"
)

MISSING_APIS=()
for api in "${REQUIRED_APIS[@]}"; do
	if gcloud services list --enabled --project="$PROJECT_ID" --filter="name:$api" --format="value(name)" | grep -q "$api"; then
		echo "  ✓ $api"
	else
		echo "  ✗ $api (not enabled)"
		MISSING_APIS+=("$api")
	fi
done

if [ ${#MISSING_APIS[@]} -gt 0 ]; then
	echo
	echo_warn "⚠️  Some required APIs are not enabled."
	echo
	if prompt_yes_no "Enable missing APIs now?"; then
		echo
		for api in "${MISSING_APIS[@]}"; do
			echo "Enabling $api..."
			if gcloud services enable "$api" --project="$PROJECT_ID"; then
				echo_success "  ✓ Enabled $api"
			else
				echo_err "  ✗ Failed to enable $api"
				echo_err ""
				echo_err "You may need additional permissions. Enable manually or contact your GCP admin."
				echo_err "You can re-run this script once the APIs are enabled."
				exit 1
			fi
		done
	else
		echo_err "ERROR: Required APIs must be enabled to continue."
		echo_err "Enable them manually in the GCP Console or with:"
		for api in "${MISSING_APIS[@]}"; do
			echo_err "  gcloud services enable $api --project=$PROJECT_ID"
		done
		echo_err ""
		echo_err "Then re-run this script."
		exit 1
	fi
fi
echo_success "✓ All required APIs are enabled"

# ============================================================
# STEP 3: Create Cloud SQL instance
# ============================================================
banner "Step 3: Cloud SQL MySQL Instance"

SQL_INSTANCE="${SQL_INSTANCE:-lumos-${LUMOS_ENVIRONMENT}}"
SQL_DATABASE="${SQL_DATABASE:-lumos}"
SQL_REGION="${SQL_REGION:-$REGION}"

echo "Configuration:"
echo "  Instance: $SQL_INSTANCE"
echo "  Database: $SQL_DATABASE"
echo "  Region:   $SQL_REGION"
echo

# Check if instance already exists
if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
	echo_success "✓ Cloud SQL instance '$SQL_INSTANCE' already exists."
	echo "  Skipping creation..."
	echo
else
	echo "Cloud SQL instance '$SQL_INSTANCE' does not exist."
	echo
	echo "You can create the instance now with customizable configuration options."
	echo
	
	echo "Choose an option:"
	echo "1. Create Cloud SQL instance now (recommended settings)"
	echo "2. I've already created a Cloud SQL instance"
	echo "3. I want to create the instance outside this script"
	echo
	read -p "Select option (1, 2, or 3): " creation_option
	
	if [ "$creation_option" = "1" ]; then
		echo
		echo_warn "⚠️  COST WARNING: Cloud SQL instances incur charges (~\$7-15/month for db-f1-micro)"
		echo
		echo "Recommended lowest-cost configuration:"
		echo "  • Database version: MySQL 8.4"
		echo "  • Edition: Enterprise (standard edition)"
		echo "  • Tier: db-f1-micro (cheapest option, ~\$7-15/month)"
		echo "  • Public IP: Enabled (simpler setup, no VPC connector needed)"
		echo "  • Region: $SQL_REGION"
		echo
		echo "Creating Cloud SQL instance with recommended settings..."
		echo
		echo_warn "⏱️  This will take 10-15 minutes or longer."
		echo "You can:"
		echo "  • Wait here (safe to leave and come back)"
		echo "  • Cancel (Ctrl+C) and re-run this script when creation completes"
		echo
		echo "To check creation status:"
		echo "  gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID --format='value(state)'"
		echo "  OR visit: https://console.cloud.google.com/sql/instances?project=$PROJECT_ID"
		echo "  (Status should be 'RUNNABLE' when ready)"
		echo
		
		if gcloud sql instances create "$SQL_INSTANCE" \
			--database-version=MYSQL_8_4 \
			--edition=ENTERPRISE \
			--tier=db-f1-micro \
			--region="$SQL_REGION" \
			--enable-bin-log \
			--backup-start-time=03:00 \
			--project="$PROJECT_ID"; then
			echo_success "✓ Cloud SQL instance created successfully"
		else
			echo_err "ERROR: Failed to create Cloud SQL instance."
			echo_err ""
			echo_err "Common issues:"
			echo_err "  • Insufficient permissions (need Cloud SQL Admin role)"
			echo_err "  • Region not available for Cloud SQL"
			echo_err "  • Quota limits exceeded"
			echo_err ""
			echo_err "You can:"
			echo_err "  1. Create the instance manually in GCP Console"
			echo_err "  2. Fix the issue and re-run this script"
			echo_err ""
			exit 1
		fi
	elif [ "$creation_option" = "3" ]; then
		echo
		echo "To create a Cloud SQL instance manually:"
		echo
		echo "Recommended configuration:"
		echo "  • Instance name: $SQL_INSTANCE (or your preferred name)"
		echo "  • Database version: MySQL 8.4"
		echo "  • Edition: Enterprise (standard edition, not Enterprise Plus)"
		echo "  • Region: $SQL_REGION"
		echo "  • Tier: db-f1-micro (lowest cost, ~\$7-15/month)"
		echo "  • Public IP: Enabled (simpler setup)"
		echo "  • Binary logging: Enabled (for backups)"
		echo "  • Automated backups: Enabled (recommended start time: 03:00)"
		echo
		echo "Create via GCP Console:"
		echo "  https://console.cloud.google.com/sql/instances?project=$PROJECT_ID"
		echo
		echo "Or via gcloud command:"
		echo "  gcloud sql instances create $SQL_INSTANCE \\"
		echo "    --database-version=MYSQL_8_4 \\"
		echo "    --edition=ENTERPRISE \\"
		echo "    --tier=db-f1-micro \\"
		echo "    --region=$SQL_REGION \\"
		echo "    --enable-bin-log \\"
		echo "    --backup-start-time=03:00 \\"
		echo "    --project=$PROJECT_ID"
		echo
		echo "After creating the instance, re-run this script:"
		echo "  ./lumos install"
		echo
		exit 0
	elif [ "$creation_option" = "2" ]; then
		echo
		# Loop until we get a valid instance
		while true; do
			read -p "Enter your Cloud SQL instance name: " custom_instance
			
			if [ -z "$custom_instance" ]; then
				echo_warn "Instance name cannot be empty. Please try again."
				continue
			fi
			
			SQL_INSTANCE="$custom_instance"
			
			echo "Verifying instance '$SQL_INSTANCE'..."
			
			# Check if instance exists
			if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
				echo_err "ERROR: Instance '$SQL_INSTANCE' not found in project $PROJECT_ID"
				echo
				if prompt_yes_no "Try a different instance name?"; then
					continue
				else
					echo "Exiting. Create the instance and re-run this script."
					exit 1
				fi
			fi
			
			# Check if instance is runnable
			INSTANCE_STATE=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format="value(state)" 2>/dev/null)
			
			if [ "$INSTANCE_STATE" != "RUNNABLE" ]; then
				echo_err "ERROR: Instance '$SQL_INSTANCE' is not running (current state: $INSTANCE_STATE)"
				echo
				echo "The instance may still be initializing. This can take 5-10 minutes."
				echo
				if prompt_yes_no "Try a different instance name?"; then
					continue
				else
					echo
					echo "Please wait for the instance to reach RUNNABLE state."
					echo "Check status at: https://console.cloud.google.com/sql/instances?project=$PROJECT_ID"
					echo "Then re-run this script."
					exit 1
				fi
			fi
			
			# Instance is valid and runnable
			echo_success "✓ Instance '$SQL_INSTANCE' is valid and running"
			
			# Prompt for database name
			read -p "Enter your database name (or press Enter to use '$SQL_DATABASE'): " custom_database
			if [ -n "$custom_database" ]; then
				SQL_DATABASE="$custom_database"
			fi
			
			# Update environment file if values changed
			ENV_FILE="$REPO_ROOT/config/${LUMOS_ENVIRONMENT}.env"
			if [ "$SQL_INSTANCE" != "lumos-${LUMOS_ENVIRONMENT}" ] || [ "$SQL_DATABASE" != "lumos" ]; then
				echo
				echo "Updating environment file with your instance details..."
				if [ -f "$ENV_FILE" ]; then
					sed -i.bak "s/^SQL_INSTANCE=.*/SQL_INSTANCE=$SQL_INSTANCE/" "$ENV_FILE"
					sed -i.bak "s/^SQL_DATABASE=.*/SQL_DATABASE=$SQL_DATABASE/" "$ENV_FILE"
					rm -f "${ENV_FILE}.bak"
					echo_success "✓ Environment file updated"
				fi
			fi
			echo
			break
		done
	else
		echo_err "Invalid option. Exiting."
		exit 1
	fi
fi

# ============================================================
# STEP 4: Check instance status
# ============================================================
banner "Step 4: Verifying Cloud SQL Instance Status"

echo "Checking if instance '$SQL_INSTANCE' is running..."
INSTANCE_STATE=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format="value(state)" 2>/dev/null || echo "NOT_FOUND")

if [ "$INSTANCE_STATE" != "RUNNABLE" ]; then
	echo_warn "⚠️  Cloud SQL instance is not yet running (current state: $INSTANCE_STATE)"
	echo
	echo "The instance may still be initializing. This can take 5-10 minutes."
	echo
	echo "Check status in GCP Console:"
	echo "  https://console.cloud.google.com/sql/instances?project=$PROJECT_ID"
	echo
	echo "Or use gcloud:"
	echo "  gcloud sql instances describe \$SQL_INSTANCE --project=\$PROJECT_ID --format='value(state)'"
	echo
	echo_err "Please wait for the instance to reach RUNNABLE state, then re-run this script."
	exit 1
fi

echo_success "✓ Cloud SQL instance is running"

# ============================================================
# STEP 5: Create database
# ============================================================
echo
echo "Checking database '$SQL_DATABASE'..."
if gcloud sql databases describe "$SQL_DATABASE" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
	echo_success "✓ Database '$SQL_DATABASE' already exists"
	DB_WAS_PREEXISTING=true
else
	DB_WAS_PREEXISTING=false
	echo "Database '$SQL_DATABASE' does not exist on instance '$SQL_INSTANCE'."
	echo
	
	if prompt_yes_no "Create database '$SQL_DATABASE' now?"; then
		echo
		echo "Creating database '$SQL_DATABASE'..."
		if gcloud sql databases create "$SQL_DATABASE" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"; then
			echo_success "✓ Database created"
		else
			echo_err "ERROR: Failed to create database"
			echo_err "You can create it manually and re-run this script."
			exit 1
		fi
	else
		echo
		echo "To use a different database name:"
		echo "  1. Edit your environment configuration file:"
		echo "     config/${LUMOS_ENVIRONMENT}.env"
		echo "  2. Update the SQL_DATABASE variable to your preferred name"
		echo "  3. Re-run this script:"
		echo "     ./lumos install"
		echo
		echo "Alternatively, create the database '$SQL_DATABASE' manually:"
		echo "  gcloud sql databases create $SQL_DATABASE --instance=$SQL_INSTANCE --project=$PROJECT_ID"
		echo
		echo "Then re-run this script."
		echo
		exit 0
	fi
fi

# ============================================================
# STEP 5: Create database user
# ============================================================
banner "Step 5: Database User Setup"

DB_USER="lumosuser"
DB_PASSWORD=""

echo "Checking for database user '$DB_USER'..."

# Check if user exists
if gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --format="value(name)" | grep -q "^${DB_USER}$"; then
	echo_success "✓ Database user '$DB_USER' already exists"
	echo "  Skipping user creation..."
	echo
else
	echo "Database user '$DB_USER' does not exist."
	echo
	
	if prompt_yes_no "Create database user now?"; then
		echo
		
		# Generate secure password as default
		GENERATED_PASSWORD=$(generate_password)
		echo "Generated secure password: $GENERATED_PASSWORD"
		echo
		echo "You can use this generated password or enter your own."
		read -p "Enter password for user '$DB_USER' (or press Enter to use generated): " USER_INPUT_PASSWORD
		
		# Use generated password if user pressed Enter
		if [ -z "$USER_INPUT_PASSWORD" ]; then
			DB_PASSWORD="$GENERATED_PASSWORD"
			echo "Using generated password"
		else
			DB_PASSWORD="$USER_INPUT_PASSWORD"
			echo "Using custom password"
		fi
		echo
		
		echo "Creating database user..."
		if gcloud sql users create "$DB_USER" \
			--instance="$SQL_INSTANCE" \
			--password="$DB_PASSWORD" \
			--project="$PROJECT_ID"; then
			echo_success "✓ Database user created"
			echo
			echo_warn "⚠️  IMPORTANT: Save these credentials!"
			echo "  Username: $DB_USER"
			echo "  Password: $DB_PASSWORD"
			echo
			echo "These will be stored in Secret Manager in the next step."
			echo
			read -p "Press Enter to continue..."
		else
			echo_err "ERROR: Failed to create database user."
			echo_err "You can create it manually in the GCP Console and re-run this script."
			exit 1
		fi
	else
		echo
		echo "Skipping database user creation."
		echo "If you create the user manually, make sure to update the secrets in the next step."
		echo
	fi
fi

# ============================================================
# STEP 6: Database schema initialization
# ============================================================
banner "Step 6: Database Schema Initialization"

# Check if database was created in this session (we set DB_CREATED_NOW earlier if we just created it)
DB_WAS_PREEXISTING=${DB_WAS_PREEXISTING:-false}

echo "The database schema needs to be initialized with tables and stored procedures."
echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo_warn "⚠️  CRITICAL WARNING: SCHEMA REFRESH WILL DELETE ALL DATA"
echo "════════════════════════════════════════════════════════════════════════════════"
echo
echo "You are about to refresh the database schema with the following configuration:"
echo
echo "  Environment:    ${LUMOS_ENVIRONMENT}"
echo "  GCP Project:    ${PROJECT_ID}"
echo "  SQL Instance:   ${SQL_INSTANCE}"
echo "  Database:       ${SQL_DATABASE}"
echo
echo_warn "This operation will:"
echo_warn "  • DROP and RE-CREATE all tables and stored procedures"
echo_warn "  • DELETE ALL EXISTING DATA in the database"
echo_warn "  • Reset the database to its default initial state"
echo_warn ""
echo_warn "THIS ACTION CANNOT BE UNDONE!"
echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo

if prompt_yes_no "Are you sure you want to continue? (If you choose 'n', you can continue without refreshing schema if it's already applied.)" "n"; then
	# If database existed before we started (wasn't created by us), require environment name confirmation
	if [ "$DB_WAS_PREEXISTING" = "true" ]; then
		echo
		echo_warn "⚠️  ADDITIONAL SAFEGUARD: Database existed before this installation"
		echo
		echo "To confirm you want to proceed with schema refresh on the EXISTING database,"
		echo "please type the environment name exactly as shown below:"
		echo
		echo "  ${LUMOS_ENVIRONMENT}"
		echo
		
		while true; do
			read -p "Type environment name to confirm: " CONFIRM_ENV
			
			if [ "$CONFIRM_ENV" = "$LUMOS_ENVIRONMENT" ]; then
				echo
				echo_success "✓ Environment name confirmed"
				break
			else
				echo
				echo_err "ERROR: Environment name does not match."
				echo "You typed: '$CONFIRM_ENV'"
				echo "Expected: '$LUMOS_ENVIRONMENT'"
				echo
			fi
		done
	fi
	
	SHOULD_INIT_SCHEMA=true
else
	echo
	echo_warn "Schema refresh cancelled."
	echo
	echo "⚠️  NOTE: The database schema MUST be initialized for Lumos to function."
	echo
	echo "If you have already initialized the schema in a prior installation run,"
	echo "you can skip this step and continue with the remaining setup."
	echo
	
	if prompt_yes_no "Continue installation WITHOUT refreshing schema?" "y"; then
		echo
		echo "Skipping schema initialization. Assuming schema is already in place."
		SHOULD_INIT_SCHEMA=false
	else
		echo
		echo_err "Installation cancelled."
		echo
		echo "Please verify your configuration:"
		echo "  • Environment file: config/${LUMOS_ENVIRONMENT}.env"
		echo "  • GCP Project: ${PROJECT_ID}"
		echo "  • SQL Instance: ${SQL_INSTANCE}"
		echo
		echo "Once confirmed, re-run this script with:"
		echo "  ./lumos install"
		echo
		exit 1
	fi
fi

if [ "${SHOULD_INIT_SCHEMA:-false}" = "true" ]; then
	echo
	echo "Initializing database schema..."
	echo "This will create all tables, indexes, and stored procedures."
	echo
	
	# Get the Cloud SQL service account
	echo "Getting Cloud SQL service account..."
	SQL_SERVICE_ACCOUNT=$(gcloud sql instances describe "$SQL_INSTANCE" \
		--project="$PROJECT_ID" \
		--format="value(serviceAccountEmailAddress)")
	
	if [ -z "$SQL_SERVICE_ACCOUNT" ]; then
		echo_err "ERROR: Failed to get Cloud SQL service account"
		exit 1
	fi
	echo "Cloud SQL service account: $SQL_SERVICE_ACCOUNT"
	echo
	
	# Create a temporary Cloud Storage bucket for schema import
	TEMP_BUCKET="gs://${PROJECT_ID}-temp-schema-import"
	echo "Creating temporary Cloud Storage bucket for schema import..."
	
	if ! gsutil ls "$TEMP_BUCKET" >/dev/null 2>&1; then
		if gsutil mb -p "$PROJECT_ID" -l "$REGION" "$TEMP_BUCKET" 2>/dev/null; then
			echo_success "✓ Temporary bucket created"
		else
			echo_err "ERROR: Failed to create temporary bucket"
			echo_err "Make sure the Storage API is enabled and you have permissions."
			exit 1
		fi
	else
		echo "Temporary bucket already exists"
	fi
	
	# Grant the Cloud SQL service account permissions to read from the bucket
	echo "Granting Cloud SQL service account read permissions on bucket..."
	if gsutil iam ch "serviceAccount:${SQL_SERVICE_ACCOUNT}:objectViewer" "$TEMP_BUCKET" 2>/dev/null; then
		echo_success "✓ Permissions granted"
	else
		echo_warn "⚠️  Warning: Failed to grant permissions. Import may fail."
	fi
	
	echo
	
	# Import schema dump
	SCHEMA_FILE="$REPO_ROOT/LumosTrade/src/database/lumos-schema.dump"
	if [ ! -f "$SCHEMA_FILE" ]; then
		echo_err "ERROR: Schema file not found at $SCHEMA_FILE"
		exit 1
	fi
	
	echo "Uploading schema file to Cloud Storage..."
	SCHEMA_GCS_PATH="${TEMP_BUCKET}/lumos-schema.dump"
	if gsutil cp "$SCHEMA_FILE" "$SCHEMA_GCS_PATH"; then
		echo_success "✓ Schema file uploaded"
	else
		echo_err "ERROR: Failed to upload schema file"
		exit 1
	fi
	
	echo
	echo "Importing schema from lumos-schema.dump..."
	if gcloud sql import sql "$SQL_INSTANCE" "$SCHEMA_GCS_PATH" \
		--database="$SQL_DATABASE" \
		--project="$PROJECT_ID" \
		--quiet; then
		echo_success "✓ Schema imported successfully"
	else
		echo_err "ERROR: Failed to import schema"
		echo_err "You can manually import the schema using:"
		echo_err "  gsutil cp $SCHEMA_FILE gs://your-bucket/"
		echo_err "  gcloud sql import sql $SQL_INSTANCE gs://your-bucket/lumos-schema.dump --database=$SQL_DATABASE"
		exit 1
	fi
	
	# Clean up schema file from Cloud Storage
	gsutil rm "$SCHEMA_GCS_PATH" 2>/dev/null || true
	
	echo
	
	# Import configuration data (brokers, etc.)
	CONFIG_FILE="$REPO_ROOT/LumosTrade/src/database/lumos-configure.sql"
	if [ ! -f "$CONFIG_FILE" ]; then
		echo_warn "⚠️  Configuration file not found at $CONFIG_FILE"
		echo "Skipping initial data configuration."
	else
		echo "Uploading configuration file to Cloud Storage..."
		CONFIG_GCS_PATH="${TEMP_BUCKET}/lumos-configure.sql"
		if gsutil cp "$CONFIG_FILE" "$CONFIG_GCS_PATH"; then
			echo_success "✓ Configuration file uploaded"
		else
			echo_err "ERROR: Failed to upload configuration file"
			exit 1
		fi
		
		echo
		echo "Importing initial configuration data..."
		if gcloud sql import sql "$SQL_INSTANCE" "$CONFIG_GCS_PATH" \
			--database="$SQL_DATABASE" \
			--project="$PROJECT_ID" \
			--quiet; then
			echo_success "✓ Configuration data imported successfully"
		else
			echo_err "ERROR: Failed to import configuration data"
			echo_err "You can manually import it using:"
			echo_err "  gsutil cp $CONFIG_FILE gs://your-bucket/"
			echo_err "  gcloud sql import sql $SQL_INSTANCE gs://your-bucket/lumos-configure.sql --database=$SQL_DATABASE"
			exit 1
		fi
		
		# Clean up config file from Cloud Storage
		gsutil rm "$CONFIG_GCS_PATH" 2>/dev/null || true
	fi
	
	echo
	echo "Cleaning up temporary Cloud Storage bucket..."
	gsutil rb "$TEMP_BUCKET" 2>/dev/null || true
	
	echo
	echo_success "✓ Database schema initialized successfully"
	echo
fi

# ============================================================
# STEP 7: Datastore Database Setup
# ============================================================
banner "Step 7: Datastore Database Setup"

echo "Checking for Datastore database..."
echo

# Check if a Firestore/Datastore database exists
# Note: API should already be enabled from Step 2, so this should work
set +e
DATASTORE_OUTPUT=$(gcloud firestore databases list \
	--project="$PROJECT_ID" \
	--format="value(name)" \
	--verbosity=error \
	2>&1)
DATASTORE_EXIT_CODE=$?
set -e

# Check for actual API/permission errors (not just "no database found")
if [ $DATASTORE_EXIT_CODE -ne 0 ]; then
	# Check if error is about API not being enabled
	if echo "$DATASTORE_OUTPUT" | grep -qi "api.*not.*enabled\|has not been used\|not activated"; then
		echo_err "ERROR: Firestore API is not enabled."
		echo_err ""
		echo_err "Enable the Firestore API:"
		echo_err "  gcloud services enable firestore.googleapis.com --project=$PROJECT_ID"
		echo_err ""
		echo_err "Then re-run this script."
		exit 1
	fi
	# For other errors, just warn but continue (database might not exist yet, which is fine)
	echo "  Note: Could not list databases (this is normal if none exist yet)"
fi

# Check if output has actual database names (strip whitespace and check if non-empty)
DATASTORE_OUTPUT_TRIMMED=$(echo "$DATASTORE_OUTPUT" | tr -d '[:space:]')

if [ -n "$DATASTORE_OUTPUT_TRIMMED" ]; then
	echo_success "✓ Datastore database already exists"
	echo "  Skipping Datastore creation..."
	echo
else
	echo "Datastore database does not exist."
	echo
	echo "Datastore is required for storing:"
	echo "  • OAuth broker access tokens"
	echo "  • User settings and preferences"
	echo
	
	if prompt_yes_no "Create Datastore database now?"; then
		echo
		echo "Creating Datastore database in $REGION..."
		if gcloud firestore databases create \
			--location="$REGION" \
			--type=datastore-mode \
			--project="$PROJECT_ID"; then
			echo_success "✓ Datastore database created"
			echo
		else
			echo_err "ERROR: Failed to create Datastore database"
			echo_err "You can create it manually in the GCP Console:"
			echo_err "  1. Go to Firestore in GCP Console"
			echo_err "  2. Select 'Datastore mode'"
			echo_err "  3. Choose location: $REGION"
			echo_err ""
			echo_err "Then re-run this script."
			exit 1
		fi
	else
		echo
		echo_err "ERROR: Datastore is required for Lumos to function."
		echo_err ""
		echo_err "To create it manually:"
		echo_err "  gcloud firestore databases create \\"
		echo_err "    --location=$REGION \\"
		echo_err "    --type=datastore-mode \\"
		echo_err "    --project=$PROJECT_ID"
		echo_err ""
		echo_err "Or create it in the GCP Console (Firestore → Datastore mode)."
		echo_err "Then re-run this script."
		exit 1
	fi
fi

# ============================================================
# STEP 8: Configure secrets
# ============================================================
banner "Step 8: Secret Manager Configuration"

LUMOS_SECRET_NAME="${LUMOS_SECRET_NAME:-lumos}"
SECRETS_FILE="$REPO_ROOT/config/${LUMOS_ENVIRONMENT}.secrets.json"

echo "Downloading or creating secrets file..."
echo "This will download existing secrets from Secret Manager, or create a new"
echo "secrets file with generated default passwords if none exist."
echo

# Export variables needed by the download script
export PROJECT_ID
export LUMOS_ENVIRONMENT
export SECRETS_FILE
export LUMOS_SECRET_NAME

# Use the existing download script (it handles both download and template creation with defaults)
DOWNLOAD_SCRIPT="$SCRIPT_DIR/_download_secrets.sh"
if bash "$DOWNLOAD_SCRIPT"; then
	echo
	
	# Update DB credentials if we generated them in Step 5
	if [ -n "${DB_PASSWORD:-}" ] && [ -f "$SECRETS_FILE" ]; then
		echo "Updating secrets file with database credentials from Step 5..."
		
		if command -v jq >/dev/null 2>&1; then
			TEMP_FILE=$(mktemp)
			jq --arg user "$DB_USER" --arg pass "$DB_PASSWORD" \
				'.database.user = $user | .database.password = $pass' \
				"$SECRETS_FILE" > "$TEMP_FILE"
			mv "$TEMP_FILE" "$SECRETS_FILE"
			echo_success "✓ Database credentials updated in secrets file"
		else
			echo_warn "⚠️  jq not found. Please manually update database credentials in:"
			echo "  $SECRETS_FILE"
		fi
		echo
	fi
	
	# Generate random passwords for LumosApp auth if they're still placeholders
	if [ -f "$SECRETS_FILE" ] && command -v jq >/dev/null 2>&1; then
		CURRENT_AUTH_PASSWORD=$(jq -r '.LumosApp.auth.password // empty' "$SECRETS_FILE" 2>/dev/null)
		CURRENT_CRON_TOKEN=$(jq -r '.LumosApp.auth.cronToken // empty' "$SECRETS_FILE" 2>/dev/null)
		
		NEEDS_UPDATE=false
		AUTH_PASS_UPDATED=false
		CRON_TOKEN_UPDATED=false
		
		# Check if auth password is a placeholder and needs to be generated
		if [[ "$CURRENT_AUTH_PASSWORD" == YOUR_* ]] || [ -z "$CURRENT_AUTH_PASSWORD" ]; then
			echo "Generating random password for LumosApp authentication..."
			GENERATED_AUTH_PASSWORD=$(generate_password)
			NEEDS_UPDATE=true
			AUTH_PASS_UPDATED=true
		else
			echo "LumosApp auth password already set, keeping existing value"
			GENERATED_AUTH_PASSWORD="$CURRENT_AUTH_PASSWORD"
		fi
		
		# Check if cron token is a placeholder and needs to be generated
		if [[ "$CURRENT_CRON_TOKEN" == YOUR_* ]] || [ -z "$CURRENT_CRON_TOKEN" ]; then
			echo "Generating random token for cron authentication..."
			GENERATED_CRON_TOKEN=$(generate_password)
			NEEDS_UPDATE=true
			CRON_TOKEN_UPDATED=true
		else
			echo "Cron token already set, keeping existing value"
			GENERATED_CRON_TOKEN="$CURRENT_CRON_TOKEN"
		fi
		
		if [ "$NEEDS_UPDATE" = true ]; then
			TEMP_FILE=$(mktemp)
			jq \
				--arg authpass "$GENERATED_AUTH_PASSWORD" \
				--arg crontoken "$GENERATED_CRON_TOKEN" \
				'.LumosApp.auth.password = $authpass | .LumosApp.auth.cronToken = $crontoken' \
				"$SECRETS_FILE" > "$TEMP_FILE"
			mv "$TEMP_FILE" "$SECRETS_FILE"
			
			if [ "$AUTH_PASS_UPDATED" = true ] && [ "$CRON_TOKEN_UPDATED" = true ]; then
				echo_success "✓ Generated and saved new auth password and cron token"
			elif [ "$AUTH_PASS_UPDATED" = true ]; then
				echo_success "✓ Generated and saved new auth password (cron token unchanged)"
			elif [ "$CRON_TOKEN_UPDATED" = true ]; then
				echo_success "✓ Generated and saved new cron token (auth password unchanged)"
			fi
			echo
		else
			echo_success "✓ LumosApp credentials already configured"
			echo
		fi
	fi
	
	# Show current secrets (mask sensitive values)
	echo "Current secrets configuration:"
	if [ -f "$SECRETS_FILE" ] && command -v jq >/dev/null 2>&1; then
		jq 'walk(if type == "string" and (test("YOUR_") // false) then "⚠️  NOT SET" elif type == "string" and (test("password|token|key|secret|Password|Token|Key|Secret") // false) and (test("_comment") | not) then "***" else . end)' "$SECRETS_FILE"
	elif [ -f "$SECRETS_FILE" ]; then
		cat "$SECRETS_FILE"
	fi
	echo
	
	# Cache the web password and cron token for display and later steps
	# (Pull from secrets file whether it was just created or already existed)
	if [ -f "$SECRETS_FILE" ] && command -v jq >/dev/null 2>&1; then
		WEB_AUTH_PASSWORD=$(jq -r '.LumosApp.auth.password // empty' "$SECRETS_FILE" 2>/dev/null)
			CRON_TOKEN=$(jq -r '.LumosApp.auth.cronToken // empty' "$SECRETS_FILE" 2>/dev/null)
		if [ -z "$WEB_AUTH_PASSWORD" ]; then
			echo_warn "⚠️  Warning: Could not extract web password from secrets file"
		fi
	else
		echo_warn "⚠️  Warning: jq not found or secrets file missing, cannot extract web password"
	fi
	
	echo_success "✓ Default passwords generated for database and LumosApp authentication"
	echo
	echo "💡 The generated passwords are random 16-character alphanumeric strings."
	echo "   You can change them by editing: $SECRETS_FILE"
	echo
	
	# Check for broker credentials that need to be set
	if [ -f "$SECRETS_FILE" ] && grep -q "YOUR_" "$SECRETS_FILE" 2>/dev/null; then
		echo_warn "⚠️  Broker credentials are not configured (optional)"
		echo "You can add broker credentials now or come back later."
		echo
		echo "To update broker credentials later:"
		echo "  1. ./lumos secrets download"
		echo "  2. Edit config/${LUMOS_ENVIRONMENT}.secrets.json"
		echo "  3. ./lumos secrets upload"
		echo
	fi
	
	echo "Secrets file location: $SECRETS_FILE"
	echo
	echo "If you need to edit the secrets before uploading, exit now and:"
	echo "  1. Edit $SECRETS_FILE"
	echo "  2. Re-run this script: ./lumos install"
	echo
	
	if ! prompt_yes_no "Proceed with uploading secrets to Secret Manager?"; then
		echo
		echo "Secrets not uploaded."
		echo "When you're ready, edit the secrets file and re-run this script:"
		echo "  ./lumos install"
		echo
		exit 0
	fi
	
	# Validate and upload secrets
	if [ -f "$SECRETS_FILE" ]; then
		echo "Validating secrets file..."
		if ! command -v jq >/dev/null 2>&1; then
			echo_warn "⚠️  jq not found. Skipping validation."
		elif ! jq empty "$SECRETS_FILE" 2>/dev/null; then
			echo_err "ERROR: Secrets file is not valid JSON."
			echo_err "Please fix the file and re-run this script."
			exit 1
		fi
		
		echo "Uploading secrets to Secret Manager..."
		UPLOAD_SCRIPT="$SCRIPT_DIR/_update_secrets.sh"
		if bash "$UPLOAD_SCRIPT"; then
			echo_success "✓ Secrets uploaded successfully"
		else
			echo_err "ERROR: Failed to upload secrets."
			echo_err "You can re-run this script or upload manually with:"
			echo_err "  ./lumos secrets upload"
			exit 1
		fi
	else
		echo_err "ERROR: Secrets file not found at $SECRETS_FILE"
		exit 1
	fi
else
	echo_err "ERROR: Failed to download secrets."
	exit 1
fi

# ============================================================
# STEP 9: Create and configure service accounts
# ============================================================
banner "Step 9: Service Accounts Setup"

echo "Lumos uses three service accounts, each with least-privilege permissions:"
echo
echo "  1. LumosApp Service Account (${LUMOS_APP_SERVICE_ACCOUNT:-lumosapp@...})"
echo "     • Used by: Lumos App web service"
echo "     • Purpose: Serve web UI, coordinate trading operations"
echo "     • Permissions: Cloud SQL, Secret Manager, invoke AI agents"
echo
echo "  2. LumosAgent Service Account (${AGENT_SERVICE_ACCOUNT:-lumosagent@...})"
echo "     • Used by: AI agent services (LumosChatAgent, LumosConjureAgent)"
echo "     • Purpose: Process chat requests, generate trading insights"
echo "     • Permissions: Invoke MCP tools, access Vertex AI"
echo
echo "  3. LumosTool Service Account (${TOOL_SERVICE_ACCOUNT:-lumostool@...})"
echo "     • Used by: MCP tool services (LumosDB, LumosTradeTool)"
echo "     • Purpose: Execute database queries and trading operations"
echo "     • Permissions: Cloud SQL access, Secret Manager (read-only)"
echo

if ! prompt_yes_no "Proceed with creating/updating service accounts?"; then
	echo
	echo "Service account setup cancelled."
	echo "You can create service accounts later with:"
	echo "  ./lumos service update"
	echo
	exit 0
fi

echo
echo "Creating/updating service accounts and IAM roles..."
echo

SERVICE_SCRIPT="$SCRIPT_DIR/_service_accounts.sh"
if bash "$SERVICE_SCRIPT"; then
	echo_success "✓ Service accounts configured successfully"
else
	echo_err "ERROR: Service account setup failed."
	echo_err ""
	echo_err "Please fix any errors shown above and re-run this script."
	echo_err "The script is re-runnable and will skip completed steps."
	exit 1
fi

echo
echo "Granting logging.viewer role to your user account for build log streaming..."
USER_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
	--member="user:$USER_ACCOUNT" \
	--role="roles/logging.viewer" >/dev/null 2>&1; then
	echo_success "✓ Logging permissions configured"
else
	echo_warn "⚠️  Warning: Could not grant logging.viewer role. Build logs may not stream."
fi

# ============================================================
# STEP 10: Deploy all services
# ============================================================
banner "Step 10: Deploying Lumos Services"

echo "The following services will be deployed to Cloud Run:"
echo "  1. LumosDB - Accesses the Lumos database via Google's MCP Toolbox for Database"
echo "  2. LumosTradeTool - Trading operations MCP tool"
echo "  3. LumosAgents - AI agents using Google's Agent Development Kit (ADK)"
echo "  4. LumosApp - The core Lumos application and web interface"
echo
echo_warn "⚠️  COST WARNING: Cloud Run charges for requests and resource usage"
echo_warn "⚠️  This deployment may take 10-15 minutes"
echo
echo "Do not cancel once deployment starts. If interrupted, it's safe to re-run this script later."
echo

if ! prompt_yes_no "Proceed with deployment?"; then
	echo
	echo "Deployment cancelled."
	echo "You can deploy manually later with:"
	echo "  ./lumos deploy all"
	exit 0
fi

echo
echo "Starting deployment..."
echo

# Deploy services individually, checking if they already exist and are running
DEPLOY_FAILED=0

# Helper function to check if a Cloud Run service exists and is running
check_service_running() {
	local service_name=$1
	local service_status
	
	service_status=$(gcloud run services describe "$service_name" \
		--region="$REGION" \
		--project="$PROJECT_ID" \
		--format='value(status.conditions[0].status)' 2>/dev/null)
	
	if [ "$service_status" = "True" ]; then
		return 0  # Service is running
	else
		return 1  # Service doesn't exist or isn't running
	fi
}

# 1. LumosDB
echo "Step 1/4: Checking lumosdb..."
if check_service_running "$TOOL_LUMOSDB_SERVICE_NAME"; then
	echo_success "✓ LumosDB already running, skipping deployment"
else
	echo "Deploying lumosdb..."
	DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosDB/_deploy.sh"
	if [ -f "$DEPLOY_SCRIPT" ] && bash "$DEPLOY_SCRIPT"; then
		echo_success "✓ LumosDB deployed successfully"
	else
		echo_err "ERROR: LumosDB deployment failed"
		DEPLOY_FAILED=1
	fi
fi

# 2. LumosTradeTool
echo
echo "Step 2/4: Checking lumostradetool..."
if check_service_running "$TOOL_LUMOSTRADE_SERVICE_NAME"; then
	echo_success "✓ LumosTradeTool already running, skipping deployment"
else
	echo "Deploying lumostradetool..."
	DEPLOY_SCRIPT="$LUMOSAI_DIR/Tools/LumosTradeTool/_deploy.sh"
	if [ -f "$DEPLOY_SCRIPT" ] && bash "$DEPLOY_SCRIPT"; then
		echo_success "✓ LumosTradeTool deployed successfully"
	else
		echo_err "ERROR: LumosTradeTool deployment failed"
		DEPLOY_FAILED=1
	fi
fi

# 3. LumosAgents
echo
echo "Step 3/4: Checking lumosagents..."
if check_service_running "$AGENT_LUMOSAGENTS_SERVICE_NAME"; then
	echo_success "✓ LumosAgents already running, skipping deployment"
else
	echo "Deploying lumosagents..."
	DEPLOY_SCRIPT="$LUMOSAI_DIR/Agents/LumosAgents/_deploy.sh"
	if [ -f "$DEPLOY_SCRIPT" ] && bash "$DEPLOY_SCRIPT"; then
		echo_success "✓ LumosAgents deployed successfully"
	else
		echo_err "ERROR: LumosAgents deployment failed"
		DEPLOY_FAILED=1
	fi
fi

# 4. LumosApp
echo
echo "Step 4/4: Checking lumosapp..."
if check_service_running "$LUMOS_APP_SERVICE_NAME"; then
	echo_success "✓ LumosApp already running, skipping deployment"
else
	echo "Deploying lumosapp..."
	DEPLOY_SCRIPT="$LUMOSAPP_DIR/_deploy.sh"
	if [ -f "$DEPLOY_SCRIPT" ] && bash "$DEPLOY_SCRIPT"; then
		echo_success "✓ LumosApp deployed successfully"
	else
		echo_err "ERROR: LumosApp deployment failed"
		DEPLOY_FAILED=1
	fi
fi

# Check if any deployments failed
if [ $DEPLOY_FAILED -eq 1 ]; then
	echo
	echo_err "ERROR: One or more deployments failed."
	echo_err ""
	echo_err "Please review the errors above and fix any issues."
	echo_err "You can re-run deployment with:"
	echo_err "  ./lumos deploy all"
	exit 1
else
	echo
	echo_success "✓ All services deployed successfully"
fi

# ============================================================
	# STEP 13: Optional Cloud Scheduler Cron Jobs
# ============================================================
	banner "Step 13: Optional Cloud Scheduler Cron Jobs"

	LUMOS_APP_URL_FOR_CRON="${LUMOS_APP_SERVICE_URL:-https://lumos-app-${PROJECT_NUMBER}.${REGION}.run.app}"
	CRON_TOKEN="${CRON_TOKEN:-}"

	echo "Lumos supports scheduled jobs via Cloud Scheduler to automate daily tasks."
	echo
	echo "Cron endpoint:"
	echo "  ${LUMOS_APP_URL_FOR_CRON%/}/cron?auth=<cronToken>&op=<operation>"
	echo
	echo "Available op values:"
	echo "  • refresh        - import latest orders, balances, and transactions"
	echo "                   (recommended 7:00am and 4:00pm ET, Mon-Fri)"
	echo "  • expectedMoves  - calculate daily expected moves"
	echo "                   (recommended 4:15pm ET, Mon-Fri)"
	echo "  • processOrders  - place new extended-hours orders"
	echo "                   (recommended 7:01am ET, Mon-Fri)"
	echo "  • testAccessTokens - check token expirations in next 48 hours"
	echo "                   (daily, any time)"
	echo
	echo "The cron token is stored in your secrets file and can be changed any time:"
	echo "  config/${LUMOS_ENVIRONMENT}.secrets.json → LumosApp.auth.cronToken"
	echo
	echo "This step will only install the 'refresh' scheduled task."
	echo "All other tasks are optional and can be configured manually later."
	echo

	if prompt_yes_no "Set up the daily refresh job in Cloud Scheduler now?"; then
		if [ -z "$CRON_TOKEN" ] && [ -f "$SECRETS_FILE" ] && command -v jq >/dev/null 2>&1; then
			CRON_TOKEN=$(jq -r '.LumosApp.auth.cronToken // empty' "$SECRETS_FILE" 2>/dev/null)
		fi

		if [ -z "$CRON_TOKEN" ]; then
			echo_err "ERROR: cron token not found in secrets file."
			echo_err "Update it in: config/${LUMOS_ENVIRONMENT}.secrets.json → LumosApp.auth.cronToken"
			echo_err "Then re-run: ./lumos install"
		else
			echo
			echo "Enabling Cloud Scheduler API..."
			if gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"; then
				echo_success "✓ Cloud Scheduler API enabled"
			else
				echo_err "ERROR: Failed to enable Cloud Scheduler API."
				echo_err "You can enable it manually with:"
				echo_err "  gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT_ID"
				scheduler_setup_failed=1
			fi

			if [ -z "${scheduler_setup_failed:-}" ]; then
				JOB_NAME="lumos-daily-account-import"
				JOB_DESCRIPTION="Imports account balances and orders each day."
				JOB_SCHEDULE="0 7,16 * * 1-5"
				JOB_TIMEZONE="America/New_York"
				JOB_URI="${LUMOS_APP_URL_FOR_CRON%/}/cron?auth=${CRON_TOKEN}&op=refresh"

				echo
				echo "Configuring Cloud Scheduler job: $JOB_NAME"
				echo "  Schedule: $JOB_SCHEDULE ($JOB_TIMEZONE)"
				echo "  Target:   $JOB_URI"
				echo

				if gcloud scheduler jobs describe "$JOB_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
					echo "Job already exists. Updating..."
					if gcloud scheduler jobs update http "$JOB_NAME" \
						--location="$REGION" \
						--project="$PROJECT_ID" \
						--schedule="$JOB_SCHEDULE" \
						--time-zone="$JOB_TIMEZONE" \
						--uri="$JOB_URI" \
						--http-method=GET \
						--description="$JOB_DESCRIPTION"; then
						echo_success "✓ Cloud Scheduler job updated"
					else
						echo_err "ERROR: Failed to update Cloud Scheduler job."
					fi
				else
					echo "Creating job..."
					if gcloud scheduler jobs create http "$JOB_NAME" \
						--location="$REGION" \
						--project="$PROJECT_ID" \
						--schedule="$JOB_SCHEDULE" \
						--time-zone="$JOB_TIMEZONE" \
						--uri="$JOB_URI" \
						--http-method=GET \
						--description="$JOB_DESCRIPTION"; then
						echo_success "✓ Cloud Scheduler job created"
					else
						echo_err "ERROR: Failed to create Cloud Scheduler job."
					fi
				fi
			fi
		fi
	else
		echo
		echo "Skipping Cloud Scheduler setup."
	fi

	# ============================================================
	# STEP 14: Installation complete!
	# ============================================================
	banner "Installation Complete!"

LUMOS_APP_URL="${LUMOS_APP_SERVICE_URL:-https://lumos-app-${PROJECT_NUMBER}.${REGION}.run.app}"

echo_success "🎉 Congratulations! Lumos is now installed and running!"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "🌐 Your Lumos web app is available at:"
echo
echo "   $LUMOS_APP_URL"
echo

if [ -n "$WEB_AUTH_PASSWORD" ]; then
	echo "🔐 Web Authorization Password:"
	echo
	echo "   $WEB_AUTH_PASSWORD"
	echo
	echo "   (Stored in secrets as: web.password)"
	echo
else
	echo "🔐 Web Authorization Password:"
	echo
	echo "   (Could not retrieve from secrets file)"
	echo "   To view: ./lumos secrets download"
	echo "   Then check: config/${LUMOS_ENVIRONMENT}.secrets.json → web.password"
	echo
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "📝 Important Notes:"
echo
echo "  • Broker API Keys: You will need to update the secrets file with broker"
echo "    API access keys before you can connect to your brokerage accounts."
echo
echo "  • Update Secrets: You can update the secrets file at any time to change"
echo "    passwords or add broker credentials."
echo
echo "To update secrets:"
echo "  1. Download current secrets:  ./lumos secrets download"
echo "  2. Edit the secrets file:     config/${LUMOS_ENVIRONMENT}.secrets.json"
echo "  3. Upload updated secrets:    ./lumos secrets upload"
echo
echo "Next steps:"
echo "  1. Visit the URL above and log in with the password shown"
echo "  2. Add your broker API credentials via the secrets update process"
echo "  3. Start trading!"
echo
echo "Useful commands:"
echo "  • View logs: gcloud run services logs read --project=$PROJECT_ID"
echo "  • Run './lumos' for help on all available commands"
echo
echo_success "✅ ALL DONE!"
echo
