import os

from google.adk.agents import LlmAgent
from google.adk.apps import App
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset

# Local test agent for LumosTradeTool.
# Run the tool locally first (./dev run lumostradetool), then run this agent UI.

local_port = os.environ.get("TOOL_LUMOSTRADE_LOCAL_PORT", "8082")
base_url = os.environ.get("TOOL_LUMOSTRADE_LOCAL_URL", f"http://127.0.0.1:{local_port}")

mcp_url = base_url.rstrip("/") + "/mcp"

root_agent = LlmAgent(
    name="LumosTradeToolTestAgent",
    model="gemini-2.5-flash",
    description="Local test agent for LumosTradeTool.",
    tools=[
        McpToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=mcp_url,
            )
        )
    ],
)

app = App(root_agent=root_agent, name="my_agent")
