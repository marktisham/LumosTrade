# Lumos AI Services

## Video Overview

<a href="https://www.youtube.com/watch?v=XrKq4WUwWXA" target="_blank" rel="noopener">
  <img src="images/video-placeholder.svg" alt="AI Services Overview Video" />
</a>

**[Watch the full video on YouTube](https://www.youtube.com/watch?v=XrKq4WUwWXA)**

---

*The content below is an AI-generated overview based on the video presentation and existing documentation.*

## What is LumosAI?

LumosAI is the intelligent layer of Lumos Trade that powers conversational workflows and automated data retrieval. It hosts AI agents (LumosChat and LumosConjure) and tool services (LumosDB and LumosTradeTool) that work together to provide natural language interaction with your trading data.

## Core Components

### AI Agents

#### LumosChat
A conversational agent that powers the LumosApp chat experience. LumosChat:
- Interprets natural language questions about your trading data
- Routes requests to appropriate tools (LumosDB, LumosTradeTool)
- Formats responses for intuitive display in the web UI
- Maintains conversation context for follow-up questions

**Prompt instructions:** [agent.py](../LumosAI/Agents/LumosAgents/LumosChatAgent/agent.py)

**Example queries:**
- "Show my account balances"
- "View my open trades"
- "What is the current price of SPY"

#### LumosConjure
A creative agent designed for data visualization and exploratory analysis. LumosConjure:
- Generates custom charts and tables on demand
- Creates visual reports for specific hypotheses
- Produces narrative summaries of trading patterns
- Complements the structured analytics with flexible exploration

**Prompt instructions:** [agent.py](../LumosAI/Agents/LumosAgents/LumosConjureAgent/agent.py)

**Example requests:**
- "Show my account balances over January"
- "Display my recent orders"
- "Show my daily gains"

### Tool Services

#### LumosDB
An [MCP Toolbox for Databases](https://github.com/googleapis/genai-toolbox) service that provides database query capabilities:
- Exposes trading data through structured tool definitions (`tools.yaml`)
- Executes SQL queries against Cloud SQL database
- Returns formatted results to agents
- Handles account history, trade details, and portfolio data

**Tool definitions:** [tools.yaml](../LumosAI/Tools/LumosDB/tools.yaml)

#### LumosTradeTool
A Node.js-based MCP (Model Context Protocol) server that exposes domain logic:
- Provides trade and order processing capabilities
- Wraps LumosTrade library functionality for AI access
- Exposes broker-specific operations
- Serves as bridge between AI agents and trading core

**Tools are defined in:** [registerTools.ts](../LumosAI/Tools/LumosTradeTool/src/tools/registerTools.ts)

## Request Flow Architecture

The AI services follow a clear request flow pattern:

```
User Question → LumosApp → LumosAgents → Tools → Cloud SQL → Response
```

### Detailed Flow

1. **User initiates request** in LumosApp chat interface
2. **LumosApp forwards request** to LumosAgents service
3. **Agent selects appropriate tool(s)** based on request type:
   - Data queries → LumosDB
   - Trade processing → LumosTradeTool
4. **Tools execute operations:**
   - LumosDB runs SQL queries against Cloud SQL
   - LumosTradeTool invokes domain logic from LumosTrade library
5. **Results flow back through agents** for formatting and context
6. **Formatted response returned** to LumosApp for display

## Technology Stack

### Agent Framework
- **Google Agent Development Kit (ADK)**: Framework for building and orchestrating AI agents
- **Python**: Runtime for agent implementations
- **Vertex AI**: Google's AI platform powering the Gemini models

### Tool Infrastructure
- **[MCP Toolbox for Databases](https://github.com/googleapis/genai-toolbox)**: Runtime for LumosDB tool definitions
- **MCP Protocol**: Standard for exposing capabilities to AI agents
- **Node.js**: Runtime for LumosTradeTool MCP server

## Configuration and Deployment

### Environment Variables

Agent and tool services are configured via environment variables in `config/<environment>.env`:

```bash
# Agent Configuration
AGENT_SERVICE_ACCOUNT=lumosagent@project.iam.gserviceaccount.com
AGENT_LUMOSAGENTS_SERVICE_NAME=lumos-agents
AGENT_LUMOSAGENTS_URL=https://lumos-agents-xxx.run.app
AGENT_LUMOSAGENTS_CHAT=LumosChatAgent
AGENT_LUMOSAGENTS_CONJURE=LumosConjureAgent

# Tool Configuration
TOOL_SERVICE_ACCOUNT=lumostool@project.iam.gserviceaccount.com
TOOL_LUMOSDB_SERVICE_NAME=lumos-tool-lumosdb
TOOL_LUMOSDB_SERVICE_URL=https://lumos-tool-lumosdb-xxx.run.app
TOOL_LUMOSTRADE_SERVICE_NAME=lumos-tool-trade
TOOL_LUMOSTRADE_SERVICE_URL=https://lumos-tool-trade-xxx.run.app
```

### Deployment Workflow

Use the `./lumos` launcher for environment-aware deployment:

```bash
# Deploy all AI services
./lumos deploy all

# Deploy individual services
./lumos deploy lumosagents
./lumos deploy lumosdb
./lumos deploy lumostradetool
```

Deployment order matters: tools must be deployed before agents that depend on them.

### Local Development

Run services locally for testing:

```bash
# Run LumosDB toolbox locally
./lumos run lumosdb

# Run LumosDB with agent wrapper
./lumos run lumosdb-agent

# Run LumosAgents locally
./lumos run lumosagents

# Run LumosTradeTool server
./lumos run lumostradetool

# Run LumosTradeTool with agent wrapper
./lumos run lumostradetool-agent
```

## Key Files and Entrypoints

### Agent Implementation
- **Main entrypoint:** [main.py](../LumosAI/Agents/LumosAgents/main.py)
- **LumosChat agent:** [LumosChatAgent/](../LumosAI/Agents/LumosAgents/LumosChatAgent/)
- **LumosConjure agent:** [LumosConjureAgent/](../LumosAI/Agents/LumosAgents/LumosConjureAgent/)

### Tool Definitions
- **LumosDB tools:** [tools.yaml](../LumosAI/Tools/LumosDB/tools.yaml)
- **LumosTradeTool tools:** [registerTools.ts](../LumosAI/Tools/LumosTradeTool/src/tools/registerTools.ts)

### Deployment Scripts
- **Agent deployment:** [_deploy.sh](../LumosAI/Agents/LumosAgents/_deploy.sh)
- **LumosDB deployment:** [_deploy.sh](../LumosAI/Tools/LumosDB/_deploy.sh)
- **LumosTradeTool deployment:** [_deploy.sh](../LumosAI/Tools/LumosTradeTool/_deploy.sh)

## Integration with LumosApp

LumosApp integrates with AI services through a clean API:

1. **Chat interface** in UI sends user queries to LumosAgents endpoint
2. **Agent selection** based on request type (chat vs. conjure)
3. **Streaming responses** for real-time feedback
4. **Error handling** and retry logic for reliability

The integration is environment-aware and uses service URLs from the active environment configuration.

## Best Practices

### When Using AI Features
- **Start with LumosChat** for straightforward data questions
- **Use LumosConjure** for visualization and exploration
- **Verify AI outputs** against raw data in UI
- **Be specific in queries** for better results

### For Developers
- **Test locally first** before deploying to Cloud Run
- **Update tool definitions** when database schema changes
- **Monitor agent logs** for debugging and optimization
- **Follow environment separation** (dev/prod) strictly

## Security and Privacy

- **Service accounts** isolate permissions for agents and tools
- **No data leaves your Google Cloud project**
- **OAuth tokens** stored securely in Cloud Datastore
- **IAM policies** control access between services

## Next Steps

- **For operations guidance:** See [OPERATIONS.md](OPERATIONS.md)
- **For overall architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md)
- **For deployment:** Follow the launcher workflow in OPERATIONS.md
