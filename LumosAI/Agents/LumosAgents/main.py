# Copyright 2026 Mark Isham
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import logging

import uvicorn
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from google.adk.cli.fast_api import get_fast_api_app

# Suppress OpenTelemetry warnings about None values for token usage attributes
logging.getLogger("opentelemetry.sdk.trace").setLevel(logging.ERROR)

# Get the directory where main.py is located
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Read configuration from environment variables
environment = os.environ.get("ENVIRONMENT", "development")
build_number = os.environ.get("BUILD_NUMBER", "local")
lumosdb_service_url = os.environ.get("TOOL_LUMOSDB_SERVICE_URL", "")

# Parse CORS origins
allowed_origins_str = os.environ.get("ALLOWED_ORIGINS")
if not allowed_origins_str:
    raise ValueError("ALLOWED_ORIGINS environment variable is required")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

# Call the function to get the FastAPI app instance
app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri="sqlite+aiosqlite:///./sessions.db",
    allow_origins=allowed_origins,

    # Set to true to enable the web-based agent UI for testing (visit the service URL)
    # Leaving off by default as a security safeguard. 
    # Note: you will also need to disable authentication on the LumosAgents service to access the URL in the browser.
    # (no need to disable auth on the tool services though).
    web=bool(False),
)

# Simple health-check / quick test endpoint
@app.get("/", response_class=PlainTextResponse)
def root():
    return "Hello World"

if __name__ == "__main__":
    print(f"Starting Lumos Agent in {environment} mode...")
    print(f"Build: {build_number}")
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))