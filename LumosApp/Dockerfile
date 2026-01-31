# Use official Node.js LTS image
FROM node:18-slim

# Create app directory
WORKDIR /app

# NOTE: this Dockerfile expects TypeScript to be built in each package
# (i.e. `dist/` directories present). The _deploy.sh builds packages
# before invoking Cloud Build. We copy only package manifests and compiled
# `dist/` output to keep the image small.

# Define root directory for clarity (paths relative to build context root)
ARG ROOT_DIR=.
ARG LUMOSAPP_DIR=${ROOT_DIR}/LumosApp
ARG LUMOSTRADE_DIR=${ROOT_DIR}/LumosTrade

# Copy package manifests so npm can install production deps (including the
# local file dependency to ../LumosTrade).
COPY ${LUMOSAPP_DIR}/package.json ./LumosApp/package.json
COPY ${LUMOSTRADE_DIR}/package.json ./LumosTrade/package.json

# Copy only compiled output
COPY ${LUMOSAPP_DIR}/dist ./LumosApp/dist
COPY ${LUMOSTRADE_DIR}/dist ./LumosTrade/dist

# Copy config files for LumosTrade only (LumosApp no longer uses config files)
COPY ${LUMOSTRADE_DIR}/config ./LumosTrade/config

# Install production dependencies for LumosTrade
WORKDIR /app/LumosTrade
RUN npm install --only=production --no-audit --no-fund

# Install production dependencies for LumosApp. npm will resolve the local
# dependency to ../LumosTrade because that folder exists in the image.
WORKDIR /app/LumosApp
RUN npm install --only=production --no-audit --no-fund

# Expose the port Cloud Run expects by default
ENV PORT=8080
EXPOSE 8080

# Start the compiled application
CMD ["node", "dist/index.js"]
