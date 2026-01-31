# Secret Management Guide

This document describes how Lumos stores and accesses sensitive configuration using Google Secret Manager.

## Overview

Sensitive values (database credentials, API keys, OAuth secrets) are stored in Google Secret Manager rather than in source control. This provides centralized access control, auditing, and versioning.

Secrets are stored as JSON in Secret Manager under the name lumos. Environment metadata (project, region, instance, database name) remains in config/<environment>.env files.

## Local workflow

1. Set your environment with the launcher.
2. Download or create the local secrets file.
3. Edit it.
4. Upload the updated secret.
5. Delete the local file.

### Step-by-step example

```bash
./lumos env set development
./lumos secrets download
code config/development.secrets.json
./lumos secrets upload
rm config/development.secrets.json
```

The local secrets file is ignored by git and should never be committed.

## Accessing secrets in code

### TypeScript/Node.js

Use the SecretManager utility from LumosTrade.

### Python tools

Local scripts fetch secrets from Secret Manager and export them as environment variables before running tools. Deployed services access secrets through service account permissions.

## Best practices

- Use separate secrets per environment.
- Apply least-privilege access.
- Rotate credentials regularly.
- Never commit secrets or print them in logs.

## Troubleshooting

### Failed to load secrets

- Verify the secret exists in the configured project.
- Ensure gcloud authentication: gcloud auth application-default login.
- Confirm the service account has roles/secretmanager.secretAccessor.

### Permission denied

- Run ./lumos service update to refresh IAM bindings.
- Wait briefly for IAM propagation and retry.

## References

- [Google Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [IAM Roles for Secret Manager](https://cloud.google.com/secret-manager/docs/access-control)

