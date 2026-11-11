FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies first for layer caching
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
WORKDIR /usr/src/app

# Copy only what's needed from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
RUN npm install --production --ignore-scripts

EXPOSE 4000

CMD ["node", "dist/main.js"]
