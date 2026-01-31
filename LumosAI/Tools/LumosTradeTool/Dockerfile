# Build + runtime container for LumosTradeTool (Node.js MCP server)

FROM node:22-slim AS build

WORKDIR /app

# Copy just enough for dependency installation first (better caching)
COPY LumosAI/Tools/LumosTradeTool/package.json ./LumosAI/Tools/LumosTradeTool/package.json
COPY LumosAI/Tools/LumosTradeTool/tsconfig.json ./LumosAI/Tools/LumosTradeTool/tsconfig.json

# Local dependency: LumosTrade (build it so dist/ exists)
COPY LumosTrade/package.json ./LumosTrade/package.json
COPY LumosTrade/package-lock.json ./LumosTrade/package-lock.json
COPY LumosTrade/tsconfig.json ./LumosTrade/tsconfig.json
COPY LumosTrade/src ./LumosTrade/src
COPY LumosTrade/config ./LumosTrade/config

WORKDIR /app/LumosTrade
RUN npm install
RUN npx tsc -p tsconfig.json \
	&& mkdir -p dist/config config \
	&& cp -R config/* dist/config/ || true \
	&& cp -R config/* config/ || true

WORKDIR /app/LumosAI/Tools/LumosTradeTool
RUN npm install

# Copy sources and build
COPY LumosAI/Tools/LumosTradeTool/src ./src
RUN npm run build


FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/LumosAI/Tools/LumosTradeTool

# Bring runtime deps + built output
COPY --from=build /app/LumosAI/Tools/LumosTradeTool/package.json ./package.json
COPY --from=build /app/LumosAI/Tools/LumosTradeTool/node_modules ./node_modules
COPY --from=build /app/LumosAI/Tools/LumosTradeTool/dist ./dist
COPY --from=build /app/LumosTrade /app/LumosTrade

EXPOSE 8080
CMD ["node", "dist/index.js"]
