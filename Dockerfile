# Sami LLM Proxy Server - Dockerfile
# AI-NOTE: [CREATED] Reproducible Docker image for quick deployment

FROM node:20-alpine

# Working directory
WORKDIR /app

# Copy package.json and install ALL dependencies (dev dependencies needed for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 8080

# Start server
CMD ["npm", "start"]

