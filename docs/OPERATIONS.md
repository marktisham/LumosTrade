# Operations and Environment

This project uses a single launcher at the repo root to manage environments, builds, and deployments.

## Environment management

- Set an environment: `./lumos env set <environment>` (e.g., development, production)
- List environments: `./lumos env list`
- Validate config: `./lumos env validate`
- View variables: `./lumos env show`
- Regenerate expanded env: `./lumos env update`

Environment files live under `config/` and follow KEY=VALUE format (no export statements).

## Build

- Build all: `npm run build:all`
- Watch all: `npm run watch:all`
- Clean rebuild: `./lumos build clean`
- Watch mode: `./lumos build watch`
- Build packages individually: `npm run build:lumostrade`, `npm run build:lumosapp`, `npm run build:lumoscli`

## Testing

Run unit tests for LumosTrade:
```bash
cd LumosTrade && npm test
```

## Run locally

- LumosApp: `cd LumosApp && NODE_ENV=development PORT=8080 node dist/index.js`
- LumosDB toolbox: `./lumos run lumosdb`
- LumosAgents: `./lumos run lumosagents`
- LumosTradeTool: `./lumos run lumostradetool`

## Deploy

- Deploy all services: `./lumos deploy all`
- Deploy specific services: `./lumos deploy lumosapp`, `./lumos deploy lumosagents`, `./lumos deploy lumosdb`, `./lumos deploy lumostradetool`

Deployment order: LumosDB → LumosTradeTool → LumosAgents → LumosApp

## Secrets

Secret handling is documented in [config/SECRET_MANAGEMENT.md](../config/SECRET_MANAGEMENT.md).
