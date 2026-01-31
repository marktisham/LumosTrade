<!-- Copilot / AI assistant instructions for the Lumos monorepo -->
# Lumos — Copilot Instructions

This repo is a small TypeScript monorepo plus a Python-based AI workspace. The core packages are `LumosApp` (Express web UI), `LumosTrade` (core trade/order processing library), and `LumosCLI` (CLI wrappers). `LumosAI` hosts agents (like `LumosAgents`) and tools (like `LumosDB`) used by the web app. The guidance below is intentionally concise and actionable for code changes, tests, and running/debugging locally.

- **Architecture & dependency boundaries** (CRITICAL — respect these):
  - `LumosTrade` is the **portable core library** for broker trading and data collection. It is NOT a UI layer — all display logic belongs in consumers.
  - `LumosApp` is the **web frontend** to display trade data. It depends on `LumosTrade` via `file:../LumosTrade` in package.json.
  - `LumosCLI` is a **thin CLI** to test `LumosTrade`. Same dependency relationship.
  - **One-way dependencies only**: `LumosApp` → `LumosTrade` ← `LumosCLI`. NO circular dependencies. `LumosTrade` must remain UI-agnostic.
  - Inside `LumosTrade/src/interfaces/*`: general-purpose types (not broker-specific). Broker-specific logic extends `BrokerClient` (e.g., `ETClient` in `ETrade/`) and maps to these shared interfaces.
  - `LumosAI` is an AI workspace (Python) with **Agents** and **Tools**. `LumosApp` calls the `LumosChat` agent (hosted on `LumosAgents`) for the chat experience. Agents call tools (for example, `LumosDB`) to access the trading database.
  - The end-to-end flow is: `LumosApp` → `LumosAgents` → tool services (e.g., `LumosDB`) → Cloud SQL.

- **Root environment launcher** (CRITICAL — use this):
  - `./lumos` is the single entrypoint for environment-aware actions. It loads environment variables from `config/<environment>.expanded.env` and delegates to `shell/_invoker.sh`.
  - **Environment persistence**: Each terminal window automatically remembers its environment selection (stored in `/tmp/lumos-env-<shell-pid>`). Different terminal windows can use different environments simultaneously.
  - **Environment management**: 
    - `./lumos env set <environment>` — Set/create environment (e.g., `./lumos env set development`). Selection is remembered for the current terminal.
    - `./lumos env list` — See all available environments
    - `./lumos env validate` — Check current environment configuration
    - `./lumos env show` — Display source, expanded, and current environment variables
    - `./lumos env update` — Regenerate expanded environment file
  - **Environment variables**: Edit `config/<environment>.env` directly (e.g., `config/development.env`, `config/production.env`). Format is simple `KEY=VALUE` (no export statements).
  - Environment configs use `LUMOS_ENVIRONMENT` variable (replaces old `ENVIRONMENT` variable)
  - Template available at `config/template.env` for creating new environments
  - Available actions (see `shell/_invoker.sh`): `auth`, `build clean|watch|lumostradetool`, `deploy all|lumosapp|lumosagents|lumosdb|lumostradetool`, `run lumosdb|lumosdb-agent|lumosagents|lumostradetool|lumostradetool-agent`, `service update|test`, `sql`, `env set|list|validate|show|update`.
  - `deploy all` runs in order: `LumosDB` → `LumosTradeTool` → `LumosAgents` → `LumosApp`.

- **Build & watch**: Use the root scripts or environment launchers.
  - `npm run build:all` — compile all packages (`tsc -p ...`) and copy required config/templates/public files to `dist`.
  - `npm run watch:all` — starts `tsc --watch` in all packages (uses `npm-run-all`).
  - `./lumos build clean` — wipes node_modules/dist and rebuilds via root scripts.
  - `./lumos build watch` — runs `npm run watch:all` via `shell/_watch_all.sh`.
  - Per-package builds: `npm run build:lumosapp`, `npm run build:lumostrade`, `npm run build:lumoscli`.

- **Run / debug LumosApp**:
  - After `npm run build:lumosapp`, run `cd LumosApp && NODE_ENV=development PORT=8080 node dist/index.js`.
  - The app reads config from `LumosApp/config/*` (copied to `dist/config` during build). Use `process.env.PORT` and `process.env.BUILD_NUMBER` to influence runtime.
  - When using Cloud Run or the ./lumos launcher, environment variables are sourced from `config/<environment>.env`.
  - For VS Code debugging, use the "Dev Web App" or "Prod Web App" launch configurations which automatically load the appropriate config/development.expanded.env or config/production.expanded.env file.

- **Tests**:
  - `LumosTrade` has comprehensive unit test coverage using Jest (18 test suites covering core domain logic, trade/order processing, broker response mapping, date utilities, rollup calculations, and expected moves). Run tests from that package: `cd LumosTrade && npm test`.
  - Test files are located in `LumosTrade/src/test/*.test.ts` and cover critical business logic including trade construction from orders, multi-leg options, account transfers, rollup calculations, and broker-specific response parsing.
  - The `./lumos service test` target is a placeholder for service-account verification; use `./lumos service update` to apply roles and bindings.
  - Agent/tool validation is primarily local run workflows (`./lumos run lumosdb`, `./lumos run lumosdb-agent`, `./lumos run lumosagents`, `./lumos run lumostradetool`, `./lumos run lumostradetool-agent`) plus end-to-end invocation from `LumosApp`.

- **Key files and patterns to reference**:
  - `LumosApp/src/index.ts` — Express initialization, `dynamicControllerLoader`, middleware, and view/config wiring.
  - `LumosApp/src/route/controller.ts` — dynamic controller loading maps URLs to files under `controllers/` and `views/`.
  - `LumosTrade/src/index.ts` — public exports for the trade library.
  - `LumosTrade/src/processor/*` — domain processing logic (e.g., `TradeImport`, `OrderImport`, `BrokerManager`). Look here for business rules.
  - `LumosTrade/src/database/*` — `DataAccess` implements DB calls. `lumos-dev.dump` contains DB sample/schema useful for understanding expected DB shape.
  - `LumosApp/config/*`, `LumosCLI/config/*`, `LumosTrade/config/*` — per-package `config` module usage; the runtime loads these via `moduleConfig.ts` helpers.
  - `LumosAI/Agents/LumosAgents/main.py` — agent entrypoint and ADK app.
  - `LumosAI/Tools/LumosDB/tools.yaml` — tool definitions for the toolbox.
  - `LumosAI/Tools/LumosTradeTool/src/index.ts` — Node MCP server entrypoint (Streamable HTTP at `/mcp`).
  - `shell/_invoker.sh` — authoritative list of environment launcher actions and their targets.

- **Project-specific conventions** (important to follow):
  - TypeScript is compiled to `dist/` and runtime expects templates and `config/` inside `dist/`. Build tasks copy those files — avoid editing `dist/` directly.
  - Local package linking: `LumosApp` and `LumosCLI` depend on `lumostrade` via `file:../LumosTrade`; maintain build order (build `LumosTrade` before `LumosApp`).
  - Domain model helpers: factories like `Trade.CreateOpenTradeFromOrders(...)` and `Trade.CreateClosedTradeFromOrders(...)` are used to roll up domain state — prefer using those static factories rather than reconstructing objects manually.
  - **Database separation**: `DataAccess` (in `LumosTrade`) handles trading system DB logic. `AppDataAccess` (in `LumosApp`) extends `DataAccessBase` for UI-specific queries (filters, joins for rendering). Both inherit from `DataAccessBase` which manages Google Cloud SQL connections via `@google-cloud/cloud-sql-connector`. Use `DataAccess` methods (`GetOrdersForTrades`, `TradeInsert`, `OrdersSetIncomplete`, etc.) rather than raw SQL queries unless adding new low-level DB behavior.
  - **Configuration sources**: Environment variables for services live in `config/<environment>.env` files (KEY=VALUE format, no export statements). For example, `config/development.env` and `config/production.env`. These are the ONLY files users should edit for environment configuration. Runtime config files live under each package's `config/` folder (`default.json`, `development.json`, `production.json`) and are copied into `dist/config` on build.


- **Integration & external dependencies**:
  - **Google Cloud**: Uses `@google-cloud/datastore` for OAuth token storage and `@google-cloud/cloud-sql-connector` for MySQL 8.4 connections. Connection pooling in `DataAccessBase.initPool()`.
  - **MySQL**: Cloud SQL (MySQL 8.4) is the primary DB. See `lumos-dev.dump` for schema/sample data. Use `DataAccess` methods for DB interactions in LumosTrade. Use AppDataAccess for UI-specific queries in LumosApp.
  - **OAuth and brokerage clients**: `ETrade` clients live under `LumosTrade/src/ETrade` (see `ETClient`, `ETCaller`, `ETResponseMapper`). `ETClient` implements `BrokerClient` interface and uses `OAuth1Client` for E*TRADE API authentication. Access tokens stored in Google Cloud Datastore.
  - **AI Agents & Tools**: `LumosAI` uses the Agent Development Kit (ADK). Tools are exposed via the toolbox binary configured by `tools.yaml` in the LumosDB projeect. Agents call tools with service URLs configured in env files. When updating database queries (DataAccess.ts and AppDataAccess.ts for example), make sure to check if updates also need to be made in tools.yaml.
  - **Deployment**: Dockerfile expects pre-built `dist/` folders. Deployment happens via `./lumos deploy ...` which runs builds, builds container images with Cloud Build, and deploys to Cloud Run.

- **When editing behavior or adding features**:
  - Update `LumosTrade` first for domain changes, run unit tests (`npm test` in `LumosTrade`) to verify correctness, and then build consumer packages.
  - When modifying core logic in `LumosTrade`, add or update corresponding test cases to maintain comprehensive test coverage.
  - If adding new runtime config values, add them under each package `config/*.json` and ensure build copies to `dist/config`.
  - For web UI changes, edit files under `LumosApp/src/views` / `templates` / `public`; run the `build:lumosapp` task to see results.
  - For AI agents/tools, keep logic under `LumosAI/Agents` and `LumosAI/Tools` and update related env vars in `config/<environment>.env`.
  - When making changes, do not add intermediate comments indicating why a specific change was made. Also don't leave legacy comments behind from the moved or removed code. Instead make sure the comments for the impacted changes reflect the latest overall state of the impacted code. Do not put proxies in place to preserve backward compatibility unless explicitly directed to do so.

- **Examples** (copyable commands):
  - Build everything: `npm run build:all`
  - Watch everything: `npm run watch:all`
  - Run app locally: `cd LumosApp && NODE_ENV=development PORT=8080 node dist/index.js`
  - Set environment: `./lumos env set development` or `./lumos env set production` (remembered per terminal)
  - Run environment workflows: `./lumos` (shows available actions)
  - Deploy all services: `./lumos deploy all` (uses remembered environment)
  - Update service accounts: `./lumos service update`
  - Run LumosTrade tests: `cd LumosTrade && npm test`

- **Date & Time Handling** (CRITICAL):
  - **Database**: All `DATETIME` columns (e.g., `ExecutedTime`, `CloseDate`) store **UTC**. The `PeriodEnd` column in `AccountHistory` stores a date-only string (YYYY-MM-DD) representing the **US Eastern Time** date. The `PeriodEnd` column in `TradeHistory` stores a date-only string (YYYY-MM-DD) representing the **US Eastern Time** date.
  - **UI Visualization**: All dates and times must be displayed in **US Eastern Time** (America/New_York). Use `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` in client-side code.
  - **Filtering & Rollups**:
    - UI filters (e.g., "Today", "Last 3 Months") refer to **US Eastern Time** periods.
    - Backend must convert these ET ranges to **UTC** boundaries when querying `DATETIME` columns (use `DateUtils.GetEasternStartOfDayUTC` / `GetEasternEndOfDayUTC`).
    - Rollups (daily/weekly/monthly) must respect ET boundaries.
  - **Helpers**: Use `LumosTrade/src/utils/DateUtils.ts` for server-side conversions. Use `LumosApp/src/utils/DateFilter.ts` for generating SQL conditions from ET filters.
