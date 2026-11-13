# SmartToken Production Dockerfile
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy full application code & build frontend bundle
COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server code, db migrations, and built frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

# Ensure uploads directories exist
RUN mkdir -p /app/server/uploads/recordings \
             /app/server/uploads/assignments \
             /app/server/uploads/submissions \
             /app/server/uploads/materials

# Volume for persistent uploads
VOLUME ["/app/server/uploads"]

EXPOSE 3001

# Start SmartToken unified server
CMD ["node", "server/index.js"]
