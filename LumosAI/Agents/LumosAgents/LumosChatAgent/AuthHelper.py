from google.auth.exceptions import DefaultCredentialsError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
import google.auth
import os


# ============================================================================
# Authentication Helper
# ============================================================================
def get_id_token_for_service(audience_url: str) -> str:
    """
    Generate a Google Cloud ID token with a specific audience for service-to-service auth.

    IMPORTANT: We use google.oauth2.id_token.fetch_id_token() directly instead of
    toolbox_core.auth_methods.get_google_id_token() because the toolbox wrapper caches
    token fetchers by the calling service account rather than by audience. When multiple
    tools run under the same service account (as both LumosDB and LumosTradeTool do),
    the wrapper returns the same cached token for both, causing authentication failures
    when Cloud Run validates the audience claim doesn't match the target service URL.

    This direct approach ensures each service gets a token with the correct audience claim.
    
    When running locally with service account impersonation, set AGENT_SERVICE_ACCOUNT
    environment variable to enable ID token generation using impersonated credentials.
    """
    try:
        # When running locally with impersonation, use gcloud to get ID token
        agent_service_account = os.environ.get("AGENT_SERVICE_ACCOUNT")
        if agent_service_account:
            import subprocess
            try:
                result = subprocess.run(
                    [
                        "gcloud",
                        "auth",
                        "print-identity-token",
                        f"--impersonate-service-account={agent_service_account}",
                        f"--audiences={audience_url}",
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                )
                token = result.stdout.strip()
                return f"Bearer {token}"
            except subprocess.CalledProcessError:
                # Fall through to default credentials if impersonation fails
                pass
        
        # Default behavior for Cloud Run or when impersonation is not configured
        credentials, project = google.auth.default()
        auth_req = Request()
        credentials.refresh(auth_req)
        token = id_token.fetch_id_token(auth_req, audience_url)
        return f"Bearer {token}"
    except DefaultCredentialsError as exc:
        raise DefaultCredentialsError(
            "No Application Default Credentials found. "
            "If running locally, set GOOGLE_APPLICATION_CREDENTIALS to a service-account key or run "
            "'gcloud auth application-default login'. If running in Cloud Run, ensure the service has "
            "a service account and metadata server access."
        ) from exc
    except Exception as exc:
        raise RuntimeError(
            "Failed to fetch Google ID token. Verify ADC is configured and the audience URL is correct."
        ) from exc
