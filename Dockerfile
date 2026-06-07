# Build stage: compile TypeScript and build client assets
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci
COPY . .
RUN npm run build

# Production-deps stage: install only runtime dependencies
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --omit=dev

# Runtime stage: minimal image with only what is needed to run
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=./data/puutteet.db
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/client/package.json ./client/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3000
USER node
CMD ["node", "server/dist/index.js"]
