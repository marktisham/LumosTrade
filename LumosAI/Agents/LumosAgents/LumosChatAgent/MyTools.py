import os
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from .AuthHelper import get_id_token_for_service


# ============================================================================
# LumosDB Tool Configuration
# Cloud SQL database queries for trades, quotes, and account history
# ============================================================================
lumosdb_service_url = os.environ.get("TOOL_LUMOSDB_SERVICE_URL")
if not lumosdb_service_url:
    raise RuntimeError("TOOL_LUMOSDB_SERVICE_URL must be set")

# /mcp path off the service url is needed for MCP tools
lumosdb_service_url_mcp = lumosdb_service_url.rstrip('/') + "/mcp"


def get_lumosdb_auth_headers(context):
    """Generate auth headers for LumosDB service."""
    try:
        return {"Authorization": get_id_token_for_service(lumosdb_service_url)}
    except Exception as e:
        print(f"Failed to fetch ID token for LumosDB at ({lumosdb_service_url}): {e}")
        return {}


# Create the toolset
# Don't use ToolboxSyncClient with auth headers - doesn't work. (or i couldn't figure it out)
# Through much painful trial and error, this worked. See:
# https://google.github.io/adk-docs/tools-custom/mcp-tools/
# https://google.github.io/adk-docs/api-reference/python/google-adk.html#google.adk.tools.mcp_tool.StreamableHTTPConnectionParams
# https://google.github.io/adk-docs/api-reference/python/google-adk.html#google.adk.tools.mcp_tool.McpToolset
lumosdb_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=lumosdb_service_url_mcp,
    ),
    # Use "header_provider" instead of "header" here so we can automatically re-auth if the token expires (hourly)
    header_provider=get_lumosdb_auth_headers
)

# ============================================================================
# LumosTradeTool Configuration
# Custom MCP server with LumosTrade library access for broker operations
# ============================================================================
lumostrade_service_url = os.environ.get("TOOL_LUMOSTRADE_SERVICE_URL")
if not lumostrade_service_url:
    raise RuntimeError("TOOL_LUMOSTRADE_SERVICE_URL must be set")

# /mcp path off the service url is needed for MCP tools
lumostrade_service_url_mcp = lumostrade_service_url.rstrip('/') + "/mcp"


def get_lumostrade_auth_headers(context):
    """Generate auth headers for LumosTradeTool service."""
    try:
        return {"Authorization": get_id_token_for_service(lumostrade_service_url)}
    except Exception as e:
        print(f"Failed to fetch ID token for LumosTrade at ({lumostrade_service_url}): {e}")
        return {}


# Create the toolset
lumostrade_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=lumostrade_service_url_mcp,
    ),
    header_provider=get_lumostrade_auth_headers,
)
