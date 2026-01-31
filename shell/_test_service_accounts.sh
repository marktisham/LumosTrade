#!/usr/bin/env bash
set -uo pipefail

# Comprehensive service account + Cloud Run permissions test.
# Designed to be run via: ./dev service test  (or ./prod service test)
#
# This script intentionally continues running after failures and reports all issues.

# Fallback if invoked directly (echo_err is exported by shell/_invoker.sh)
if ! declare -F echo_err >/dev/null 2>&1; then
	echo_err() {
		printf '%s\n' "$*" >&2
	}
fi

ERRORS=0
WARNINGS=0

record_error() {
	ERRORS=$((ERRORS + 1))
	echo_err "ERROR: $*"
	echo_err ""
}

record_warning() {
	WARNINGS=$((WARNINGS + 1))
	echo_err "WARN: $*"
	echo_err ""
}

info() {
	printf '%s\n' "$*"
}

# Print a green checkmark and message for passing tests
pass() {
	# Green checkmark with reset
	printf '\033[32m✓ %s\033[0m\n\n' "$*"
}

banner() {
	local title="$1"
	printf '\n============================================================\n'
	printf '%s\n' "$title"
	printf '============================================================\n'
}

sub_banner() {
	local title="$1"
	printf '\n%s\n' '------------------------------'
	printf '%s\n' "$title"
	printf '%s\n' '------------------------------'
}

require_cmd() {
	local cmd="$1"
	if ! command -v "$cmd" >/dev/null 2>&1; then
		record_error "Missing required command '$cmd'. Install it and retry."
		return 1
	fi
	return 0
}

gcloud_run_describe_value() {
	local service_name="$1"
	local region="$2"
	local project_id="$3"
	local format_expr="$4"

	local -a args
	args=(run services describe "$service_name" --region "$region" --platform managed --project "$project_id" --format "$format_expr")

	# Print exact command (single-line) to stderr for copy/paste debugging
	# Quote the --format argument so the printed command is safe to paste into a shell
	printf "Testing: Cloud Run service is running under correct service account.\n" >&2
	printf "gcloud run services describe %s --region %s --platform managed --project %s --format '%s'\n" "$service_name" "$region" "$project_id" "$format_expr" >&2

	# Return the formatted value on stdout
	gcloud "${args[@]}" 2>/dev/null || true
}

get_identity_token() {
	local service_account="$1"
	local audience="$2"

	# Audience should generally be the Cloud Run service URL.
	local -a args
	args=(auth print-identity-token --impersonate-service-account="$service_account" --audiences="$audience")

	# Print exact command to stderr for copy/paste debugging
	printf "Testing: identity token for service account\n" >&2
	printf 'gcloud %s\n' "${args[*]}" >&2

	gcloud "${args[@]}" 2>/dev/null || true
}

get_owner_identity_token() {
	# Ignore any audience argument and return an identity token for the currently
	# active gcloud user. Passing no --audiences ensures the default token is
	# returned and avoids potential audience-related failures.
	# Print exact command to stderr for copy/paste debugging
	printf "Testing: identity token for current gcloud user\n" >&2
	printf 'gcloud auth print-identity-token\n' >&2
	gcloud auth print-identity-token 2>/dev/null || true
}

has_invoker_binding() {
	local service_name="$1"
	local region="$2"
	local project_id="$3"
	local member="$4" # e.g. serviceAccount:foo@...

	local -a args
	args=(run services get-iam-policy "$service_name" --region "$region" --platform managed --project "$project_id" --format="json")

	# Print exact command to stderr for copy/paste debugging
	printf "Testing: service has run.invoker binding for member\n" >&2
	printf "gcloud run services get-iam-policy %s --region %s --platform managed --project %s --format json | jq -r '.bindings[]? | select(.role==\"roles/run.invoker\") | .members[]? | select(. == \"%s\")'\n" "$service_name" "$region" "$project_id" "$member" >&2

	local found
	found=$(gcloud "${args[@]}" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/run.invoker\") | .members[]? | select(. == \"$member\")" 2>/dev/null || true)
	if [ -n "$found" ]; then
		# Drop deleted or uid-qualified members (and empty lines) to avoid false positives
		found=$(printf '%s\n' "$found" \
			| sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
			| awk '!/^deleted:/ && $0 !~ /\?uid=/ && $0 != "" { print }')
	fi

	if [ -n "$found" ]; then
		return 0
	fi
	return 1
}

project_has_invoker_binding() {
	local project_id="$1"
	local member="$2" # e.g. serviceAccount:foo@...

	local -a args
	args=(projects get-iam-policy "$project_id" --format="json")

	# Print exact command to stderr for copy/paste debugging
	printf "Testing: project does not have run.invoker binding for service account (too broad)\n" >&2
	printf "gcloud projects get-iam-policy %s --format json | jq -r '.bindings[]? | select(.role==\"roles/run.invoker\") | .members[]? | select(. == \"%s\")'\n" "$project_id" "$member" >&2

	local found
	found=$(gcloud "${args[@]}" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/run.invoker\") | .members[]? | select(. == \"$member\")" 2>/dev/null || true)
	if [ -n "$found" ]; then
		# Drop deleted or uid-qualified members (and empty lines) to avoid false positives
		found=$(printf '%s\n' "$found" \
			| sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
			| awk '!/^deleted:/ && $0 !~ /\?uid=/ && $0 != "" { print }')
	fi

	if [ -n "$found" ]; then
		return 0
	fi
	return 1
}

policy_has_forbidden_invoker_members() {
	local service_name="$1"
	local region="$2"
	local project_id="$3"

	# Explicitly forbidding public bindings and direct user binding.
	# Note: project-level IAM (e.g., project Owner) may still allow invocation.
	local -a args
	args=(run services get-iam-policy "$service_name" --region "$region" --platform managed --project "$project_id" --format="json")

	# Print exact command to stderr for copy/paste debugging
	printf "Testing: service does not allow public or direct user invokers\n" >&2
	printf "gcloud run services get-iam-policy %s --region %s --platform managed --project %s --format json | jq -r '.bindings[]? | select(.role==\"roles/run.invoker\") | .members[]? | select(. == \"allUsers\" or . == \"allAuthenticatedUsers\" or startswith(\"user:\"))'\n" "$service_name" "$region" "$project_id" >&2

	local forbidden
	forbidden=$(gcloud "${args[@]}" 2>/dev/null | jq -r '.bindings[]? | select(.role=="roles/run.invoker") | .members[]? | select(. == "allUsers" or . == "allAuthenticatedUsers" or startswith("user:"))' 2>/dev/null || true)

	if [ -n "$forbidden" ]; then
		return 0
	fi
	return 1
}

# Check whether a given member (e.g. serviceAccount:foo@...) has the secret accessor role on a secret
has_secret_accessor_binding() {
	local secret_name="$1"
	local project_id="$2"
	local member="$3"

	local -a args
	args=(secrets get-iam-policy "$secret_name" --project "$project_id" --format="json")

	# Print exact command to stderr for debugging
	printf "Testing: secret accessor binding for member\n" >&2
	printf "gcloud secrets get-iam-policy %s --project %s --format json | jq -r '.bindings[]? | select(.role==\"roles/secretmanager.secretAccessor\") | .members[]? | select(. == \"%s\")'\n" "$secret_name" "$project_id" "$member" >&2

	local found
	found=$(gcloud "${args[@]}" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/secretmanager.secretAccessor\") | .members[]? | select(. == \"$member\")" 2>/dev/null || true)

	if [ -n "$found" ]; then
		return 0
	fi
	return 1
}

curl_json_post_expect_200() {
	local url="$1"
	local bearer_token="$2"
	local json_body="$3"
	local label="$4"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	local json_quoted
	json_quoted=$(printf %q "$json_body")
	printf 'curl -sS -X POST "%s" -H "Content-Type: application/json" -H "Authorization: Bearer %s" -d %s --max-time 15\n\n' "$url" "$bearer_token" "$json_quoted" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X POST "$url" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer ${bearer_token}" \
		-d "$json_body" --max-time 15 2>/dev/null || true)

	# Always show a snippet of the response for visibility/debugging.
	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" != "200" ]; then
		record_error "${label}: expected HTTP 200, got ${http_code} for ${url}."
		rm -f "$tmp"
		return 1
	fi

	if [ ! -s "$tmp" ]; then
		record_warning "${label}: HTTP 200 but empty response body for ${url}."
	fi

	rm -f "$tmp"
	return 0
}

curl_json_post_expect_forbidden() {
	local url="$1"
	local bearer_token="$2"
	local json_body="$3"
	local label="$4"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	local json_quoted
	json_quoted=$(printf %q "$json_body")
	printf 'curl -sS -X POST "%s" -H "Content-Type: application/json" -H "Authorization: Bearer %s" -d %s --max-time 15\n\n' "$url" "$bearer_token" "$json_quoted" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X POST "$url" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer ${bearer_token}" \
		-d "$json_body" --max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
		pass "${label}: correctly denied (HTTP ${http_code})"
		rm -f "$tmp"
		return 0
	fi

	record_error "${label}: expected HTTP 401/403 (denied) but got ${http_code}."
	rm -f "$tmp"
	return 1
}

curl_get_permission_check() {
	local url="$1"
	local bearer_token="$2"
	local label="$3"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	printf 'curl -sS -X GET "%s" -H "Authorization: Bearer %s" --max-time 15\n\n' "$url" "$bearer_token" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X GET "$url" \
		-H "Authorization: Bearer ${bearer_token}" \
		--max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	# Treat 401/403 as permission failures, anything else indicates auth isn't blocking.
	if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
		record_error "${label}: permission failure (HTTP ${http_code}) for ${url}."
		if [ -s "$tmp" ]; then
			echo_err "${label}: response body (truncated): $(head -c 500 "$tmp")"
		fi
		rm -f "$tmp"
		return 1
	fi

	if [ "$http_code" = "000" ]; then
		record_error "${label}: request failed (HTTP 000) for ${url}."
		rm -f "$tmp"
		return 1
	fi

	if [ "$http_code" != "200" ] && [ "$http_code" != "302" ] && [ "$http_code" != "307" ] && [ "$http_code" != "308" ] && [ "$http_code" != "404" ]; then
		record_warning "${label}: unexpected HTTP ${http_code} (not a permission error) for ${url}."
	fi

	rm -f "$tmp"
	return 0
}

# Expect HTTP 200 for an authenticated GET
curl_get_expect_200() {
	local url="$1"
	local bearer_token="$2"
	local label="$3"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	printf 'curl -sS -X GET "%s" -H "Authorization: Bearer %s" --max-time 15\n\n' "$url" "$bearer_token" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X GET "$url" \
		-H "Authorization: Bearer ${bearer_token}" \
		--max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" != "200" ]; then
		record_error "${label}: expected HTTP 200, got ${http_code} for ${url}."
		if [ -s "$tmp" ]; then
			echo_err "${label}: response body (truncated): $(head -c 500 "$tmp")"
		fi
		rm -f "$tmp"
		return 1
	fi

	pass "${label}: HTTP 200 OK"
	rm -f "$tmp"
	return 0
}

curl_get_expect_forbidden() {
	local url="$1"
	local bearer_token="$2"
	local label="$3"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	printf 'curl -sS -X GET "%s" -H "Authorization: Bearer %s" --max-time 15\n\n' "$url" "$bearer_token" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X GET "$url" \
		-H "Authorization: Bearer ${bearer_token}" \
		--max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
		pass "${label}: correctly denied (HTTP ${http_code})"
		rm -f "$tmp"
		return 0
	fi

	record_error "${label}: expected HTTP 401/403 (denied) but got ${http_code}."
	rm -f "$tmp"
	return 1
}

curl_unauthenticated_post_expect_denied() {
	local url="$1"
	local json_body="$2"
	local label="$3"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	local json_quoted
	json_quoted=$(printf %q "$json_body")
	printf 'curl -sS -X POST "%s" -H "Content-Type: application/json" -d %s --max-time 15\n\n' "$url" "$json_quoted" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X POST "$url" \
		-H "Content-Type: application/json" \
		-d "$json_body" \
		--max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
		pass "${label}: unauthenticated request correctly denied (HTTP ${http_code})"
		rm -f "$tmp"
		return 0
	fi

	if [ "$http_code" = "404" ]; then
		pass "${label}: unauthenticated request returned 404 (access not public)"
		rm -f "$tmp"
		return 0
	fi

	if [ "$http_code" = "000" ]; then
		record_error "${label}: request failed (HTTP 000) for ${url}."
		rm -f "$tmp"
		return 1
	fi

	record_error "${label}: expected unauthenticated request to be denied (401/403/404), but got HTTP ${http_code}."
	rm -f "$tmp"
	return 1
}

curl_unauthenticated_get_expect_denied() {
	local url="$1"
	local label="$2"

	local tmp
	tmp=$(mktemp)
	local http_code
	# Print the exact curl command for copy/paste debugging
	printf 'curl -sS -X GET "%s" --max-time 15\n\n' "$url" >&2
	http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
		-X GET "$url" \
		--max-time 15 2>/dev/null || true)

	echo "${label}: HTTP ${http_code} response (truncated):"
	if [ -s "$tmp" ]; then
		head -c 1500 "$tmp"
		echo ""
	else
		echo "(empty body)"
	fi

	if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
		pass "${label}: unauthenticated request correctly denied (HTTP ${http_code})"
		rm -f "$tmp"
		return 0
	fi

	if [ "$http_code" = "404" ]; then
		pass "${label}: unauthenticated request returned 404 (access not public)"
		rm -f "$tmp"
		return 0
	fi

	if [ "$http_code" = "000" ]; then
		record_error "${label}: request failed (HTTP 000) for ${url}."
		rm -f "$tmp"
		return 1
	fi

	record_error "${label}: expected unauthenticated request to be denied (401/403/404), but got HTTP ${http_code}."
	rm -f "$tmp"
	return 1
}
sse_output_contains_error() {
	local file_path="$1"
	if [ ! -f "$file_path" ]; then
		return 1
	fi

	# Heuristics: SSE frames can contain lines like:
	#   data: {"error": "403 Forbidden ..."}
	# or embedded JSON with PERMISSION_DENIED.
	if grep -E -i -q '(^data:.*\"error\"\s*:)|(^data:.*\"status\"\s*:\s*\"Forbidden\")|(PERMISSION_DENIED)|(IAM_PERMISSION_DENIED)|(\"code\"\s*:\s*403)|(\b403\b.*Forbidden)' "$file_path"; then
		return 0
	fi
	return 1
}

test_cloud_run_service_identity() {
	local label="$1"
	local service_name="$2"
	local expected_url="$3"
	local expected_runtime_sa="$4"
	local region="$5"
	local project_id="$6"

	if [ -z "$service_name" ]; then
		record_error "${label}: service name is not set."
		return 1
	fi
	if [ -z "$region" ] || [ -z "$project_id" ]; then
		record_error "${label}: REGION/PROJECT_ID not set."
		return 1
	fi
	if [ -z "$expected_runtime_sa" ]; then
		record_error "${label}: expected runtime service account is not set."
		return 1
	fi

	local actual_sa
	actual_sa=$(gcloud_run_describe_value "$service_name" "$region" "$project_id" "value(spec.template.spec.serviceAccountName)")
	if [ -z "$actual_sa" ]; then
		record_error "${label}: could not read spec.template.spec.serviceAccountName."
		return 1
	fi

	if [ "$actual_sa" != "$expected_runtime_sa" ]; then
		record_error "${label}: runtime service account mismatch. expected='${expected_runtime_sa}', actual='${actual_sa}'."
		return 1
	fi

	# Report both expected and actual service account on success for clarity
	info "Expected runtime service account: ${expected_runtime_sa}"
	info "Actual runtime service account:   ${actual_sa}"
	pass "${label}: runtime identity OK"
	return 0
}

print_plan() {
	cat <<'EOF'
Test plan (runs to completion; reports all errors):

1) Verify Cloud Run runtime identities
	 - LumosApp service URL runs as LUMOS_APP_SERVICE_ACCOUNT
	 - LumosAgents runs as AGENT_SERVICE_ACCOUNT
	 - LumosDB runs as TOOL_SERVICE_ACCOUNT
	 - LumosTradeTool runs as TOOL_SERVICE_ACCOUNT

2) Verify roles for service accounts (broken out by component)
	A) LumosApp
	 - LUMOS_APP_SERVICE_ACCOUNT has roles/secretmanager.secretAccessor on lumos secret

	B) LumosAgents
	 - LUMOS_APP_SERVICE_ACCOUNT has roles/run.invoker on LumosAgents
	 - LumosAgents is not publicly invokable (no allUsers/allAuthenticatedUsers)

	C) LumosDB
	 - AGENT_SERVICE_ACCOUNT has roles/run.invoker on LumosDB
	 - TOOL_SERVICE_ACCOUNT has roles/secretmanager.secretAccessor on lumos secret

	D) LumosTradeTool
	 - AGENT_SERVICE_ACCOUNT has roles/run.invoker on LumosTradeTool
	 - TOOL_SERVICE_ACCOUNT has roles/datastore.user on project (for LumosTrade dependency)

3) Perform benign authenticated calls
	 - As LUMOS_APP_SERVICE_ACCOUNT, call LumosChat:
		 - Create session endpoint
		 - run_sse endpoint (stream)
	 - As AGENT_SERVICE_ACCOUNT, perform a simple request to LumosDB (permission check only)
	 - As AGENT_SERVICE_ACCOUNT, perform a simple request to LumosTradeTool (permission check only)

If errors occur, recommended fix sequence:
	- Run: ./dev service update   (or ./prod service update)
	- Re-run deploys:
			./dev deploy lumosdb
			./dev deploy lumostradetool
			./dev deploy lumoschat
			./dev deploy lumosapp
	- Re-run: ./dev service test
EOF
}

main() {
	banner "Lumos Service Account Permission Tests"

	info "Environment: ${ENVIRONMENT:-(not set)}"
	info "Project: ${PROJECT_ID:-(not set)}  Region: ${REGION:-(not set)}"

	local current_user
	# Echo the exact gcloud command for debugging (no surrounding text) to stderr
	printf "Testing: active gcloud account\n" >&2
	printf 'gcloud config get-value account\n' >&2
	current_user=$(gcloud config get-value account 2>/dev/null || echo "")
	if [ -n "$current_user" ]; then
		info "Active gcloud user: ${current_user}"
	fi

	sub_banner "Test plan"
	print_plan
	info ""

	require_cmd gcloud || true
	require_cmd curl || true

	# Services (some envs may not have all of these populated)
	local project_id region
	project_id="${PROJECT_ID:-}"
	region="${REGION:-}"

	# 1) Runtime identity checks
	banner "1) Runtime identity checks"
	if [ -n "${LUMOS_APP_SERVICE_NAME:-}" ] && [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "TEST: LumosApp runtime identity"
		test_cloud_run_service_identity \
			"LumosApp" \
			"${LUMOS_APP_SERVICE_NAME}" \
			"${LUMOS_APP_SERVICE_URL:-}" \
			"${LUMOS_APP_SERVICE_ACCOUNT}" \
			"$region" "$project_id" || true
	else
		record_error "LumosApp: missing LUMOS_APP_SERVICE_NAME and/or LUMOS_APP_SERVICE_ACCOUNT in env."
	fi

	if [ -n "${AGENT_LUMOSAGENTS_SERVICE_NAME:-}" ] && [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "TEST: LumosAgents runtime identity"
		test_cloud_run_service_identity \
			"LumosAgents" \
			"${AGENT_LUMOSAGENTS_SERVICE_NAME}" \
			"${AGENT_LUMOSAGENTS_URL:-}" \
			"${AGENT_SERVICE_ACCOUNT}" \
			"$region" "$project_id" || true
	else
		record_error "LumosAgents: missing AGENT_LUMOSAGENTS_SERVICE_NAME and/or AGENT_SERVICE_ACCOUNT in env."
	fi

	if [ -n "${TOOL_LUMOSDB_SERVICE_NAME:-}" ] && [ -n "${TOOL_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "TEST: LumosDB runtime identity"
		test_cloud_run_service_identity \
			"LumosDB" \
			"${TOOL_LUMOSDB_SERVICE_NAME}" \
			"${TOOL_LUMOSDB_SERVICE_URL:-}" \
			"${TOOL_SERVICE_ACCOUNT}" \
			"$region" "$project_id" || true
	else
		record_error "LumosDB: missing TOOL_LUMOSDB_SERVICE_NAME and/or TOOL_SERVICE_ACCOUNT in env."
	fi

	if [ -n "${TOOL_LUMOSTRADE_SERVICE_NAME:-}" ] && [ -n "${TOOL_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "TEST: LumosTradeTool runtime identity"
		test_cloud_run_service_identity \
			"LumosTradeTool" \
			"${TOOL_LUMOSTRADE_SERVICE_NAME}" \
			"${TOOL_LUMOSTRADE_SERVICE_URL:-}" \
			"${TOOL_SERVICE_ACCOUNT}" \
			"$region" "$project_id" || true
	else
		record_error "LumosTradeTool: missing TOOL_LUMOSTRADE_SERVICE_NAME and/or TOOL_SERVICE_ACCOUNT in env."
	fi

	# 2) Role checks for service accounts (invoker + secret access)
	banner "2) Test that appropriate roles are set for each service account"

	# LumosApp role checks
	if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "LumosApp: service account role checks"
		
		# lumos secret access for LumosApp
		if gcloud secrets describe "$LUMOS_SECRET_NAME" --project "$project_id" >/dev/null 2>&1; then
			if has_secret_accessor_binding "$LUMOS_SECRET_NAME" "$project_id" "serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"; then
				pass "$LUMOS_SECRET_NAME: secret accessor binding present for LUMOS_APP_SERVICE_ACCOUNT"
			else
				record_error "$LUMOS_SECRET_NAME: missing roles/secretmanager.secretAccessor for serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"
			fi
		else
			record_warning "$LUMOS_SECRET_NAME secret not found; skipping secret accessor checks for LUMOS_APP_SERVICE_ACCOUNT."
		fi

        # Check project-level aiplatform role for LUMOS_APP_SERVICE_ACCOUNT
        found=$(gcloud projects get-iam-policy "$project_id" --format="json" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/aiplatform.user\") | .members[]? | select(. == \"serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}\")" 2>/dev/null || true)
        if [ -n "$found" ]; then
            pass "LUMOS_APP_SERVICE_ACCOUNT: roles/aiplatform.user present on project"
        else
            record_error "Missing roles/aiplatform.user for serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"
        fi

fi

	# LumosAgents role checks
	if [ -n "${AGENT_LUMOSAGENTS_SERVICE_NAME:-}" ] && [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "LumosAgents: invoker & public access checks"
		if has_invoker_binding "${AGENT_LUMOSAGENTS_SERVICE_NAME}" "$region" "$project_id" "serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"; then
			pass "LumosAgents: invoker binding present for LUMOS_APP_SERVICE_ACCOUNT"
		else
			record_error "LumosAgents: missing roles/run.invoker for serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"
		fi

		if project_has_invoker_binding "$project_id" "serviceAccount:${LUMOS_APP_SERVICE_ACCOUNT}"; then
			record_warning "LUMOS_APP_SERVICE_ACCOUNT has project-level roles/run.invoker; Cloud Run permissions will appear inherited. Prefer service-level bindings only."
		else
			pass "LUMOS_APP_SERVICE_ACCOUNT: no project-level roles/run.invoker"
		fi

		if policy_has_forbidden_invoker_members "${AGENT_LUMOSAGENTS_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosAgents: forbidden invoker member found (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
			# Dump the service's IAM policy to stderr for debugging and show fix command
			printf '--- Service IAM policy (LumosAgents) ---\n' >&2
			gcloud run services get-iam-policy "${AGENT_LUMOSAGENTS_SERVICE_NAME}" --region "$region" --platform managed --project "$project_id" --format=yaml 2>/dev/null >&2 || true
			printf '\nTo remove public invoker binding (copy/paste):\n  gcloud run services remove-iam-policy-binding "%s" --member="allUsers" --role="roles/run.invoker" --region %s --platform=managed --project %s\n' "${AGENT_LUMOSAGENTS_SERVICE_NAME}" "$region" "$project_id" >&2
		else
			pass "LumosAgents: no forbidden public/user invoker members"
		fi

		if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
			if project_has_invoker_binding "$project_id" "serviceAccount:${AGENT_SERVICE_ACCOUNT}"; then
				record_warning "AGENT_SERVICE_ACCOUNT has project-level roles/run.invoker; Cloud Run permissions will appear inherited. Prefer service-level bindings only."
			else
				pass "AGENT_SERVICE_ACCOUNT: no project-level roles/run.invoker"
			fi
		fi

            # Check project-level aiplatform role for AGENT_SERVICE_ACCOUNT
            if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
                found=$(gcloud projects get-iam-policy "$project_id" --format="json" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/aiplatform.user\") | .members[]? | select(. == \"serviceAccount:${AGENT_SERVICE_ACCOUNT}\")" 2>/dev/null || true)
                if [ -n "$found" ]; then
                    pass "AGENT_SERVICE_ACCOUNT: roles/aiplatform.user present on project"
                else
                    record_error "Missing roles/aiplatform.user for serviceAccount:${AGENT_SERVICE_ACCOUNT}"
                fi
            fi
	fi
	# LumosDB role checks
	if [ -n "${TOOL_LUMOSDB_SERVICE_NAME:-}" ] && [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "LumosDB: invoker & secret access checks"
		if has_invoker_binding "${TOOL_LUMOSDB_SERVICE_NAME}" "$region" "$project_id" "serviceAccount:${AGENT_SERVICE_ACCOUNT}"; then
			pass "LumosDB: invoker binding present for AGENT_SERVICE_ACCOUNT"
		else
			record_error "LumosDB: missing roles/run.invoker for serviceAccount:${AGENT_SERVICE_ACCOUNT}"
		fi

		if policy_has_forbidden_invoker_members "${TOOL_LUMOSDB_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosDB: forbidden invoker member found (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
			# Dump the service's IAM policy to stderr for debugging and show fix command
			printf '--- Service IAM policy (LumosDB) ---\n' >&2
			gcloud run services get-iam-policy "${TOOL_LUMOSDB_SERVICE_NAME}" --region "$region" --platform managed --project "$project_id" --format=yaml 2>/dev/null >&2 || true
			printf '\nTo remove public invoker binding (copy/paste):\n  gcloud run services remove-iam-policy-binding "%s" --member="allUsers" --role="roles/run.invoker" --region %s --platform=managed --project %s\n' "${TOOL_LUMOSDB_SERVICE_NAME}" "$region" "$project_id" >&2
		else
			pass "LumosDB: no forbidden public/user invoker members"
		fi
	else
		record_error "LumosDB: missing TOOL_LUMOSDB_SERVICE_NAME and/or AGENT_SERVICE_ACCOUNT in env."
	fi

	# LumosTradeTool role checks (mirror LumosDB)
	if [ -n "${TOOL_LUMOSTRADE_SERVICE_NAME:-}" ] && [ -n "${AGENT_SERVICE_ACCOUNT:-}" ]; then
		sub_banner "LumosTradeTool: invoker & secret access checks"
		if has_invoker_binding "${TOOL_LUMOSTRADE_SERVICE_NAME}" "$region" "$project_id" "serviceAccount:${AGENT_SERVICE_ACCOUNT}"; then
			pass "LumosTradeTool: invoker binding present for AGENT_SERVICE_ACCOUNT"
		else
			record_error "LumosTradeTool: missing roles/run.invoker for serviceAccount:${AGENT_SERVICE_ACCOUNT}"
		fi

		if policy_has_forbidden_invoker_members "${TOOL_LUMOSTRADE_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosTradeTool: forbidden invoker member found (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
			printf '--- Service IAM policy (LumosTradeTool) ---\n' >&2
			gcloud run services get-iam-policy "${TOOL_LUMOSTRADE_SERVICE_NAME}" --region "$region" --platform managed --project "$project_id" --format=yaml 2>/dev/null >&2 || true
			printf '\nTo remove public invoker binding (copy/paste):\n  gcloud run services remove-iam-policy-binding "%s" --member="allUsers" --role="roles/run.invoker" --region %s --platform=managed --project %s\n' "${TOOL_LUMOSTRADE_SERVICE_NAME}" "$region" "$project_id" >&2
		else
			pass "LumosTradeTool: no forbidden public/user invoker members"
		fi
	else
		record_error "LumosTradeTool: missing TOOL_LUMOSTRADE_SERVICE_NAME and/or AGENT_SERVICE_ACCOUNT in env."
	fi

	# Secret accessor checks for lumos (AGENT and TOOL)
	
	# lumos secret checks
	if gcloud secrets describe "$LUMOS_SECRET_NAME" --project "$project_id" >/dev/null 2>&1; then
		# TOOL service account needs lumos access
		if has_secret_accessor_binding "$LUMOS_SECRET_NAME" "$project_id" "serviceAccount:${TOOL_SERVICE_ACCOUNT}"; then
			pass "$LUMOS_SECRET_NAME: secret accessor binding present for TOOL_SERVICE_ACCOUNT"
		else
			record_error "$LUMOS_SECRET_NAME: missing roles/secretmanager.secretAccessor for serviceAccount:${TOOL_SERVICE_ACCOUNT}"
		fi

		# Project-level aiplatform role checks for AGENT and TOOL service accounts
		# AGENT
		found=$(gcloud projects get-iam-policy "$project_id" --format="json" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/aiplatform.user\") | .members[]? | select(. == \"serviceAccount:${AGENT_SERVICE_ACCOUNT}\")" 2>/dev/null || true)
		if [ -n "$found" ]; then
			pass "AGENT_SERVICE_ACCOUNT: roles/aiplatform.user present on project"
		else
			record_error "Missing roles/aiplatform.user for serviceAccount:${AGENT_SERVICE_ACCOUNT}"
		fi

		# TOOL
		found=$(gcloud projects get-iam-policy "$project_id" --format="json" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/aiplatform.user\") | .members[]? | select(. == \"serviceAccount:${TOOL_SERVICE_ACCOUNT}\")" 2>/dev/null || true)
		if [ -n "$found" ]; then
			pass "TOOL_SERVICE_ACCOUNT: roles/aiplatform.user present on project"
		else
			record_error "Missing roles/aiplatform.user for serviceAccount:${TOOL_SERVICE_ACCOUNT}"
		fi

		# TOOL datastore.user
		found=$(gcloud projects get-iam-policy "$project_id" --format="json" 2>/dev/null | jq -r ".bindings[]? | select(.role==\"roles/datastore.user\") | .members[]? | select(. == \"serviceAccount:${TOOL_SERVICE_ACCOUNT}\")" 2>/dev/null || true)
		if [ -n "$found" ]; then
			pass "TOOL_SERVICE_ACCOUNT: roles/datastore.user present on project"
		else
			record_error "Missing roles/datastore.user for serviceAccount:${TOOL_SERVICE_ACCOUNT}"
		fi
	else
		record_warning "$LUMOS_SECRET_NAME secret not found; skipping secret accessor checks for TOOL_SERVICE_ACCOUNT."
	fi
	
	# 3) Public access checks
	banner "3) Public access checks"
	# Check that LumosAgents is not publicly invokable
	if [ -n "${AGENT_LUMOSAGENTS_SERVICE_NAME:-}" ]; then
		sub_banner "TEST: LumosAgents public access"
		# Print basic get-iam-policy command for debugging (to stderr)
		printf "Testing: service has no public invoker binding\n" >&2
		printf 'gcloud run services get-iam-policy %s --region %s --platform managed --project %s\n' "${AGENT_LUMOSAGENTS_SERVICE_NAME}" "$region" "$project_id" >&2
		if policy_has_forbidden_invoker_members "${AGENT_LUMOSAGENTS_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosAgents: public invoker binding present (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
		else
			pass "LumosAgents: not publicly invokable"
			# Additionally verify unauthenticated requests are denied
			if [ -n "${AGENT_LUMOSAGENTS_URL:-}" ]; then
				sub_banner "TEST: LumosAgents unauthenticated GET (base URL, should be denied)"
				curl_unauthenticated_get_expect_denied "${AGENT_LUMOSAGENTS_URL}" "LumosAgents unauthenticated (base URL)" || true
				sub_banner "TEST: LumosAgents unauthenticated request (should be denied)"
				# Use a small payload similar to the create session call
				tmpid=$(TZ=America/New_York date +%s)
				curl_unauthenticated_post_expect_denied "${AGENT_LUMOSAGENTS_URL}/apps/LumosChatAgent/users/LumosUser/sessions/${tmpid}" '{"preferred_language":"English","visit_count":1}' "LumosAgents unauthenticated create session" || true
			fi
		fi
	else
		record_warning "LumosAgents service name not set; skipping public access test."
	fi

	# Check that LumosDB is not publicly invokable
	if [ -n "${TOOL_LUMOSDB_SERVICE_NAME:-}" ]; then
		sub_banner "TEST: LumosDB public access"
		printf "Testing: service has no public invoker binding\n" >&2
		printf 'gcloud run services get-iam-policy %s --region %s --platform managed --project %s\n' "${TOOL_LUMOSDB_SERVICE_NAME}" "$region" "$project_id" >&2
		if policy_has_forbidden_invoker_members "${TOOL_LUMOSDB_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosDB: public invoker binding present (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
		else
			pass "LumosDB: not publicly invokable"
			# Additionally verify unauthenticated request is denied
			if [ -n "${TOOL_LUMOSDB_SERVICE_URL:-}" ]; then
				sub_banner "TEST: LumosDB unauthenticated request (should be denied)"
				curl_unauthenticated_get_expect_denied "${TOOL_LUMOSDB_SERVICE_URL}" "LumosDB unauthenticated (base URL)" || true
			fi
		fi
	else
		record_warning "LumosDB service name not set; skipping public access test."
	fi

	# Check that LumosTradeTool is not publicly invokable
	if [ -n "${TOOL_LUMOSTRADE_SERVICE_NAME:-}" ]; then
		sub_banner "TEST: LumosTradeTool public access"
		printf "Testing: service has no public invoker binding\n" >&2
		printf 'gcloud run services get-iam-policy %s --region %s --platform managed --project %s\n' "${TOOL_LUMOSTRADE_SERVICE_NAME}" "$region" "$project_id" >&2
		if policy_has_forbidden_invoker_members "${TOOL_LUMOSTRADE_SERVICE_NAME}" "$region" "$project_id"; then
			record_error "LumosTradeTool: public invoker binding present (allUsers/allAuthenticatedUsers/user:mtisham@gmail.com)."
		else
			pass "LumosTradeTool: not publicly invokable"
			if [ -n "${TOOL_LUMOSTRADE_SERVICE_URL:-}" ]; then
				sub_banner "TEST: LumosTradeTool unauthenticated request (should be denied)"
				curl_unauthenticated_get_expect_denied "${TOOL_LUMOSTRADE_SERVICE_URL}" "LumosTradeTool unauthenticated (base URL)" || true
			fi
		fi
	else
		record_warning "LumosTradeTool service name not set; skipping public access test."
	fi

	# 4) Benign authenticated calls
	banner "4) Benign authenticated calls"

	# 3a) LumosApp -> LumosAgents (as LUMOS_APP_SERVICE_ACCOUNT)
	if [ -n "${LUMOS_APP_SERVICE_ACCOUNT:-}" ] && [ -n "${AGENT_LUMOSAGENTS_URL:-}" ]; then
		sub_banner "TEST: Impersonate LUMOS_APP_SERVICE_ACCOUNT -> call LumosAgents"
		local token
		token=$(get_identity_token "${LUMOS_APP_SERVICE_ACCOUNT}" "${AGENT_LUMOSAGENTS_URL}")
		if [ -z "$token" ]; then
			record_error "Failed to obtain identity token impersonating ${LUMOS_APP_SERVICE_ACCOUNT}. Run './dev service update' to grant impersonation rights."
		else
			local session_id
			session_id=$(TZ=America/New_York date +%Y%m%dT%H%M%S)

		# Authenticated base-URL GET should succeed
		sub_banner "TEST: LumosAgents authenticated GET (base URL, should be allowed)"
		curl_get_expect_200 "${AGENT_LUMOSAGENTS_URL}" "$token" "LumosAgents authenticated (base URL)" || true

		# Also create a session as the authenticated LUMOS_APP_SERVICE_ACCOUNT
		curl_json_post_expect_200 \
			"${AGENT_LUMOSAGENTS_URL}/apps/LumosChatAgent/users/LumosUser/sessions/${session_id}" \
			"$token" \
			'{"preferred_language":"English","visit_count":1}' \
			"LumosAgents create session" || true

			# run_sse streams; just require 200 and some response.
			# Use curl max-time to ensure the test completes.
			sub_banner "TEST: LumosAgents run_sse"
		# Print the exact curl command for copy/paste debugging
		local json_payload
		json_payload='{"app_name":"LumosChatAgent","user_id":"LumosUser","session_id":"'"${session_id}"'","new_message":{"parts":[{"text":"show my account balances"}],"role":"user"},"streaming":true}'
		local json_quoted
		json_quoted=$(printf %q "$json_payload")
		printf 'curl -sS -X POST "%s/run_sse" -H "Content-Type: application/json" -H "Authorization: Bearer %s" -d %s --max-time 20\n\n' "${AGENT_LUMOSAGENTS_URL}" "$token" "$json_quoted" >&2
		local tmp
		tmp=$(mktemp)
		http_code=$(curl -sS -o "$tmp" -w "%{http_code}" \
			-X POST "${AGENT_LUMOSAGENTS_URL}/run_sse" \
			-H "Content-Type: application/json" \
			-H "Authorization: Bearer ${token}" \
			-d "{\"app_name\":\"LumosChatAgent\",\"user_id\":\"LumosUser\",\"session_id\":\"${session_id}\",\"new_message\":{\"parts\":[{\"text\":\"show my account balances\"}],\"role\":\"user\"},\"streaming\":true}" \
			--max-time 20 2>/dev/null || true)

			echo "LumosAgents run_sse: HTTP ${http_code} response (truncated):"
			if [ -s "$tmp" ]; then
				head -c 1500 "$tmp"
				echo ""
			else
				echo "(empty body)"
			fi

			if [ "$http_code" != "200" ]; then
				record_error "LumosAgents run_sse: expected HTTP 200, got ${http_code}."
			else
				if [ ! -s "$tmp" ]; then
					record_warning "LumosAgents run_sse: HTTP 200 but empty body (stream may have ended quickly)."
				else
					if sse_output_contains_error "$tmp"; then
						record_error "LumosAgents run_sse: HTTP 200 but stream contains an error (e.g., PERMISSION_DENIED/Forbidden)."
					else
						pass "LumosAgents run_sse: HTTP 200 and stream contains no obvious error"
					fi
				fi
			fi
			rm -f "$tmp"
		fi
	else
		record_error "Cannot test LumosApp -> LumosAgents call: missing LUMOS_APP_SERVICE_ACCOUNT and/or AGENT_LUMOSAGENTS_URL."
	fi

	# 5) Agent -> Tool (as AGENT_SERVICE_ACCOUNT)
	if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ] && [ -n "${TOOL_LUMOSDB_SERVICE_URL:-}" ]; then
		sub_banner "TEST: Impersonate AGENT_SERVICE_ACCOUNT -> call LumosDB"
		local tool_token
		tool_token=$(get_identity_token "${AGENT_SERVICE_ACCOUNT}" "${TOOL_LUMOSDB_SERVICE_URL}")
		if [ -z "$tool_token" ]; then
			record_error "Failed to obtain identity token impersonating ${AGENT_SERVICE_ACCOUNT}. Run './dev service update' to grant impersonation rights."
		else
			curl_get_permission_check "${TOOL_LUMOSDB_SERVICE_URL}" "$tool_token" "LumosDB (base URL)" || true
		fi
	else
		record_error "Cannot test LumosAgents -> LumosDB call: missing AGENT_SERVICE_ACCOUNT and/or TOOL_LUMOSDB_SERVICE_URL."
	fi

	if [ -n "${AGENT_SERVICE_ACCOUNT:-}" ] && [ -n "${TOOL_LUMOSTRADE_SERVICE_URL:-}" ]; then
		sub_banner "TEST: Impersonate AGENT_SERVICE_ACCOUNT -> call LumosTradeTool"
		local trade_tool_token
		trade_tool_token=$(get_identity_token "${AGENT_SERVICE_ACCOUNT}" "${TOOL_LUMOSTRADE_SERVICE_URL}")
		if [ -z "$trade_tool_token" ]; then
			record_error "Failed to obtain identity token impersonating ${AGENT_SERVICE_ACCOUNT}. Run './dev service update' to grant impersonation rights."
		else
			curl_get_permission_check "${TOOL_LUMOSTRADE_SERVICE_URL}" "$trade_tool_token" "LumosTradeTool (base URL)" || true
		fi
	else
		record_error "Cannot test LumosAgents -> LumosTradeTool call: missing AGENT_SERVICE_ACCOUNT and/or TOOL_LUMOSTRADE_SERVICE_URL."
	fi

	# 6) Node-based check (runs as LUMOS_APP_SERVICE_ACCOUNT via impersonation)
	banner "6) Node-based LumosApp connectivity test"
	local script_dir
	script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	local node_script
	node_script="$script_dir/_test_lumosapp_connectivity.js"
	if [ ! -f "$node_script" ]; then
		record_error "Missing node script at $node_script"
	else
		if command -v node >/dev/null 2>&1; then
			if ! node "$node_script"; then
				record_error "Node connectivity test failed."
			fi
		else
			record_error "Node is not installed; cannot run $node_script"
		fi
	fi

	banner "Summary"
	info "Errors: $ERRORS"
	info "Warnings: $WARNINGS"
	if [ "$ERRORS" -ne 0 ]; then
		echo_err "One or more checks failed. Recommended: run './dev service update' (or './prod service update'), redeploy services, then re-run './dev service test'."
		echo_err "Note: If owner-account negative tests fail (owner can invoke), remove that user's run.invoker permissions at the project level and ensure only service-level bindings exist."
		return 1
	fi
	info "All checks passed."
	return 0
}

main "$@"
