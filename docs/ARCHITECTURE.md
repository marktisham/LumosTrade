# Architecture Overview

## Video Walkthrough

<a href="https://www.youtube.com/watch?v=8LT12EFqlg8" target="_blank" rel="noopener">
  <img src="images/video-placeholder.svg" alt="Architecture Overview Video" />
</a>

**[Watch the full architecture video on YouTube](https://www.youtube.com/watch?v=8LT12EFqlg8)**

---

*The content below is an AI-generated overview based on the video presentation and existing documentation.*

## System Overview

Lumos Trade is a TypeScript monorepo with integrated Python AI services, designed as a self-hosted, single-tenant application running on Google Cloud. The architecture separates concerns across packages while maintaining clean dependency boundaries.

![Lumos Trade System](images/architecture/lumos-trade-system.png)

*Diagram generated with Nano Banana Pro*

## Core Packages

### LumosApp (Web UI)
**Purpose:** Express-based web application for visualization and user interaction

**Key Responsibilities:**
- Serve web UI with server-side rendering (EJS templates)
- Handle user authentication and broker OAuth flows
- Provide controllers for trade views, account history, portfolio analytics
- Route chat requests to AI agents (LumosChat, LumosConjure)
- Extend `DataAccessBase` with UI-specific queries via `AppDataAccess`

**Technology:** TypeScript, Express, EJS, Bootstrap

**Entrypoint:** [LumosApp/src/index.ts](../LumosApp/src/index.ts)

### LumosTrade (Core Library)
**Purpose:** Portable, UI-agnostic domain library for trade processing and data access

**Key Responsibilities:**
- Define shared interfaces (`Trade`, `Order`, `Position`, `Account`)
- Implement domain logic (trade construction, rollups, calculations)
- Provide broker integrations (`BrokerClient` interface, E*TRADE and Schwab implementations)
- Handle database operations via `DataAccess` class
- Utility functions (date/time, expected moves, market data)

**Technology:** TypeScript, Node.js, MySQL via `@google-cloud/cloud-sql-connector`

**Test Coverage:** 18 Jest test suites covering domain logic, broker mappings, utilities

**Entrypoint:** [LumosTrade/src/index.ts](../LumosTrade/src/index.ts)

### LumosCLI (Command Line Interface)
**Purpose:** Thin CLI wrapper for testing and automation

**Key Responsibilities:**
- Provide command-line access to LumosTrade functionality
- Test broker integrations without UI overhead
- Scripting and batch operations

**Technology:** TypeScript, Node.js

**Entrypoint:** [LumosCLI/src/index.ts](../LumosCLI/src/index.ts)

### LumosAI (AI Services)
**Purpose:** Python-based AI workspace with agents and tools

**Components:**
- **LumosAgents**: ADK-based agent orchestration (LumosChat, LumosConjure)
- **LumosDB**: [MCP Toolbox](https://github.com/googleapis/genai-toolbox) service for database queries
- **LumosTradeTool**: Node MCP server exposing LumosTrade domain logic

**Technology:** Python, Google ADK, Vertex AI, Gemini models

**Agent Entrypoint:** [LumosAI/Agents/LumosAgents/main.py](../LumosAI/Agents/LumosAgents/main.py)

**Tool Entrypoints:**
- [LumosAI/Tools/LumosDB/tools.yaml](../LumosAI/Tools/LumosDB/tools.yaml)
- [LumosAI/Tools/LumosTradeTool/src/index.ts](../LumosAI/Tools/LumosTradeTool/src/index.ts)

## Dependency Boundaries

The architecture enforces strict one-way dependencies to maintain modularity:

![Dependency Flow](images/architecture/lumos-dependency-flow.png)

*Diagram generated with Gemini 3 Nano Banana*

**Critical Rules:**
- ✅ `LumosApp` → `LumosTrade` (depends on core library)
- ✅ `LumosCLI` → `LumosTrade` (depends on core library)
- ✅ `LumosAI/Tools/LumosTradeTool` → `LumosTrade` (wraps core logic)
- ❌ `LumosTrade` → `LumosApp` (FORBIDDEN: core library must remain UI-agnostic)
- ❌ Circular dependencies between any packages

## Data Flow Architecture

### End-to-End Request Flow

![Request Flow](images/architecture/lumos-request-flow.png)

*Diagram generated with Gemini 3 Nano Banana*

### Chat Request Flow (Detailed)

1. **User types question** in LumosApp chat interface
2. **LumosApp forwards request** to LumosAgents service (HTTP POST)
3. **LumosChat agent analyzes** request and determines required tools
4. **Agent calls tools:**
   - **LumosDB**: SQL queries for trade/account data
   - **LumosTradeTool**: Domain calculations (expected moves, rollups)
5. **Tools execute operations:**
   - Query Cloud SQL database
   - Process data via LumosTrade library
   - Return structured results
6. **Agent formats response** with context and clarity
7. **LumosApp renders response** in chat interface

### Direct Data Access Flow

For standard UI views (not chat):

1. **User navigates** to trade list, account history, etc.
2. **LumosApp controller** handles request
3. **AppDataAccess** (extends `DataAccessBase`) executes query
4. **Cloud SQL** returns results
5. **Controller renders** EJS template with data

## Infrastructure Architecture

### Cloud Run Services

All services run on Google Cloud Run (serverless containers):

![Cloud Run Services](images/architecture/lumos-cloud-run.png)

*Diagram generated with Gemini 3 Nano Banana*

### Service Account Architecture

```
┌────────────────────────────────────────────┐
│        IAM Service Accounts                │
├────────────────────────────────────────────┤
│                                            │
│  lumosapp@project.iam.gserviceaccount.com  │
│  ├── Roles:                                │
│  │   ├── Cloud SQL Client                  │
│  │   ├── Secret Manager Secret Accessor    │
│  │   ├── Datastore User                    │
│  │   └── Service Account Token Creator     │
│  └── Used by: LumosApp                     │
│                                            │
│  lumosagent@project.iam.gserviceaccount.com│
│  ├── Roles:                                │
│  │   ├── Vertex AI User                    │
│  │   └── Service Account Token Creator     │
│  └── Used by: LumosAgents                  │
│                                            │
│  lumostool@project.iam.gserviceaccount.com │
│  ├── Roles:                                │
│  │   ├── Cloud SQL Client                  │
│  │   └── Secret Manager Secret Accessor    │
│  └── Used by: LumosDB, LumosTradeTool      │
│                                            │
└────────────────────────────────────────────┘
```

## Database Architecture

### Schema Overview

**Primary Tables:**
- `Trades`: Closed and open trades with P&L
- `Orders`: Individual order executions
- `Accounts`: Broker account information
- `AccountHistory`: Daily account balance snapshots
- `TradeHistory`: Daily trade rollup data
- `Positions`: Current holdings
- `SymbolCache`: Market data and expected moves

### Data Access Layers

**DataAccessBase** (LumosTrade):
- Base class for database connections
- Cloud SQL connector with connection pooling
- Transaction management
- UTC timestamp handling

**DataAccess** (LumosTrade):
- Extends `DataAccessBase`
- Core domain queries (trades, orders, accounts)
- Methods: `GetOrdersForTrades`, `TradeInsert`, `OrdersSetIncomplete`
- Used by broker processors and CLI

**AppDataAccess** (LumosApp):
- Extends `DataAccessBase`
- UI-specific queries with filters and joins
- Methods: Trade lists with filters, account summaries, portfolio rollups
- Used by web controllers

## Environment Management

The `./lumos` launcher provides unified environment-aware operations:

### Environment Architecture

```
┌───────────────────────────────────────────────────┐
│        Environment Configuration Flow             │
├───────────────────────────────────────────────────┤
│                                                   │
│  1. User runs: ./lumos env set production         │
│                                                   │
│  2. Loader reads: config/production.env           │
│     (Simple KEY=VALUE format)                     │
│                                                   │
│  3. Expander generates: production.expanded.env   │
│     (Resolved variables, computed values)         │
│                                                   │
│  4. Session stores: /tmp/lumos-env-<pid>          │
│     (Persistent across commands in this terminal) │
│                                                   │
│  5. All ./lumos commands use active environment   │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Available Environments:**
- `development`: Local dev with Cloud SQL proxy
- `production`: Live deployment
- `demo`: Public demo with limited features

**Environment Operations:**

```bash
# Set active environment (persistent per terminal)
./lumos env set development|production|demo

# List all available environments
./lumos env list

# Validate current environment config
./lumos env validate

# Show environment details (source, expanded, current)
./lumos env show

# Regenerate expanded environment file
./lumos env update
```

## Build and Deployment Architecture

### Build Process

```
┌─────────────────────────────────────────────┐
│          Build Pipeline                     │
├─────────────────────────────────────────────┤
│                                             │
│  1. TypeScript Compilation (tsc)            │
│     ├── LumosTrade → dist/                  │
│     ├── LumosApp → dist/                    │
│     ├── LumosCLI → dist/                    │
│     └── LumosTradeTool → dist/              │
│                                             │
│  2. Asset Copying                           │
│     ├── config/*.json → dist/config/        │
│     ├── templates/*.ejs → dist/templates/   │
│     └── public/* → dist/public/             │
│                                             │
│  3. Container Build (Cloud Build)           │
│     ├── Dockerfile → Container Image        │
│     └── Push to Artifact Registry           │
│                                             │
│  4. Deploy to Cloud Run                     │
│     └── Pull image and start service        │
│                                             │
└─────────────────────────────────────────────┘
```

### Deployment Commands

```bash
# Deploy all services (correct order: tools → agents → app)
./lumos deploy all

# Deploy individual services
./lumos deploy lumosdb
./lumos deploy lumostradetool
./lumos deploy lumosagents
./lumos deploy lumosapp

# Build commands
./lumos build clean          # Clean rebuild from scratch
./lumos build watch          # Watch mode for development
./lumos build lumostradetool # Build specific tool
```

### Local Development Workflow

```bash
# Set development environment
./lumos env set development

# Start watch mode (auto-rebuild on changes)
npm run watch:all

# Terminal 1: Start Cloud SQL proxy
./lumos sql

# Terminal 2: Run LumosApp locally
cd LumosApp
NODE_ENV=development PORT=8080 node dist/index.js

# Terminal 3-5: Run AI services (optional)
./lumos run lumosdb-agent
./lumos run lumostradetool-agent
./lumos run lumosagents
```

## Testing Architecture

### Unit Tests (LumosTrade)

**Framework:** Jest with TypeScript

**Coverage:**
- Trade construction from orders
- Multi-leg options (spreads, condors, straddles)
- Partial fills and scale-in/scale-out
- Account transfers and balance adjustments
- Rollup calculations (daily, weekly, monthly)
- Date utilities (ET/UTC conversions)
- Broker response parsing (E*TRADE, Schwab)
- Expected move calculations

**Location:** `LumosTrade/src/test/*.test.ts`

**Run:** `cd LumosTrade && npm test`

### Integration Testing

**Service Connectivity:**
```bash
./lumos service test
```

**Database Operations:**
```bash
./lumos sql
# Then run manual queries or test scripts
```

## Date and Time Handling Architecture

**Critical Design Decision:** All user-facing times are US Eastern Time (ET), but database stores UTC.

```
┌──────────────────────────────────────────────────┐
│         Date/Time Architecture                   │
├──────────────────────────────────────────────────┤
│                                                  │
│  Database (Cloud SQL):                           │
│  ├── DATETIME columns store UTC                  │
│  │   (ExecutedTime, CloseDate, etc.)             │
│  └── PeriodEnd stores ET date strings            │
│      (YYYY-MM-DD)                                │
│                                                  │
│  Server-Side (LumosTrade):                       │
│  ├── DateUtils.ts handles conversions            │
│  ├── GetEasternStartOfDayUTC()                   │
│  └── GetEasternEndOfDayUTC()                     │
│                                                  │
│  UI (LumosApp):                                  │
│  ├── Display all times in ET                     │
│  ├── Intl.DateTimeFormat with America/New_York   │
│  └── DateFilter.ts for SQL conditions            │
│                                                  │
│  User Experience:                                │
│  ├── "Today" = Today in ET, not UTC              │
│  ├── Filters respect ET boundaries               │
│  └── Rollups aligned with market hours (ET)      │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Helpers:**
- Server: [LumosTrade/src/utils/DateUtils.ts](../LumosTrade/src/utils/DateUtils.ts)
- UI: [LumosApp/src/utils/DateFilter.ts](../LumosApp/src/utils/DateFilter.ts)

## Extensibility Points

### Adding New Brokers

1. Implement `BrokerClient` interface in `LumosTrade/src/Brokers/<BrokerName>/`
2. Create response mapper extending base mapper patterns
3. Add broker configuration to environment files
4. Update `BrokerManager` to recognize new broker
5. Add UI flows in LumosApp for broker authentication

### Creating Custom AI Agents

1. Add agent directory under `LumosAI/Agents/LumosAgents/`
2. Implement ADK agent pattern
3. Configure in `main.py`
4. Update environment variables with agent name
5. Add UI integration in LumosApp chat interface

### Building New Tools

**[MCP Toolbox](https://github.com/googleapis/genai-toolbox)-style (like LumosDB):**
1. Create `tools.yaml` with tool definitions
2. Implement SQL queries or data operations
3. Deploy with toolbox binary

**MCP Server-style (like LumosTradeTool):**
1. Create Node.js/TypeScript server
2. Implement MCP protocol endpoints
3. Wrap LumosTrade functionality
4. Deploy as Cloud Run service

## Key Files Reference

### Application Entry Points
- Web app: [LumosApp/src/index.ts](../LumosApp/src/index.ts)
- Core library: [LumosTrade/src/index.ts](../LumosTrade/src/index.ts)
- CLI: [LumosCLI/src/index.ts](../LumosCLI/src/index.ts)

### Domain Logic
- Trade processor: `LumosTrade/src/processor/TradeImport.ts`
- Order processor: `LumosTrade/src/processor/OrderImport.ts`
- Broker manager: `LumosTrade/src/processor/BrokerManager.ts`

### Data Access
- Base: `LumosTrade/src/database/DataAccessBase.ts`
- Core: `LumosTrade/src/database/DataAccess.ts`
- UI queries: `LumosApp/src/database/AppDataAccess.ts`

### AI Services
- Agent app: [LumosAI/Agents/LumosAgents/main.py](../LumosAI/Agents/LumosAgents/main.py)
- LumosChat prompts: [LumosAI/Agents/LumosAgents/LumosChatAgent/agent.py](../LumosAI/Agents/LumosAgents/LumosChatAgent/agent.py)
- LumosConjure prompts: [LumosAI/Agents/LumosAgents/LumosConjureAgent/agent.py](../LumosAI/Agents/LumosAgents/LumosConjureAgent/agent.py)
- LumosDB tool definitions: [LumosAI/Tools/LumosDB/tools.yaml](../LumosAI/Tools/LumosDB/tools.yaml)
- LumosTradeTool definitions: [LumosAI/Tools/LumosTradeTool/src/tools/registerTools.ts](../LumosAI/Tools/LumosTradeTool/src/tools/registerTools.ts)

### Controllers (UI)
- Dynamic loader: `LumosApp/src/route/controller.ts`
- Controllers: `LumosApp/src/controllers/*.ts`

### Configuration
- Environment launcher: `shell/_invoker.sh`
- Environment configs: `config/<environment>.env`
- Package configs: Each package's `config/*.json`

## Security Architecture

### Authentication and Authorization
- **User Authentication:** Session-based via Express
- **Broker OAuth:** OAuth 1.0 (E*TRADE) and OAuth 2.0 (Schwab)
- **Service-to-Service:** IAM service accounts with least-privilege roles

### Data Protection
- **At Rest:** Cloud SQL encrypted by default
- **In Transit:** HTTPS for all external connections
- **Secrets:** Google Secret Manager for credentials
- **Tokens:** Google Datastore with encryption

### Network Security
- **Cloud Run:** HTTPS ingress only
- **IAM Policies:** Service account isolation
- **No Public IPs:** All services communicate via Cloud Run URLs

## Performance Considerations

### Database Optimization
- **Connection Pooling:** Configured in `DataAccessBase`
- **Indexed Queries:** Key columns indexed for filters
- **Batch Operations:** Bulk inserts for imports

### Caching Strategy
- **Symbol Cache:** Market data cached with TTL
- **Session State:** In-memory session store

### Scalability
- **Cloud Run:** Auto-scaling based on load
- **Serverless:** Pay-per-use, no idle costs
- **Stateless Services:** Horizontal scaling possible

## Next Steps

For detailed guidance on specific topics:
- **Installation and Setup:** See [INSTALLATION.md](INSTALLATION.md)
- **Operations and Maintenance:** See [OPERATIONS.md](OPERATIONS.md)
- **AI Services Details:** See [AI_SERVICES.md](AI_SERVICES.md)
- **Secret Management:** See [../config/SECRET_MANAGEMENT.md](../config/SECRET_MANAGEMENT.md)
