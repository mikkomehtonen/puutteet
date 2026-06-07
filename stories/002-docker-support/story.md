# Docker Support

## Context

Puutteet is designed to run on a private home server. Currently the only deployment option is direct Node.js execution (`npm run build && npm start`), which requires the operator to install Node.js, clone the repo, and manage the process manually. A Dockerfile and .dockerignore would let operators build a Docker image and run the app with a single `docker run` command, which is the most common deployment method for self-hosted applications. This story adds only the files needed to build and run the app in a container — no docker-compose or orchestration.

## Out of Scope

- docker-compose.yml or any orchestration configuration.
- CI/CD pipeline integration or automated image publishing.
- Multi-architecture builds (arm64, etc.) — the Dockerfile uses a single platform matching the build host.
- Health check endpoints (the app already responds to GET /).
- Changing the existing build or start scripts.

## Implementation approach

### Multi-stage Dockerfile

Three stages to minimize the final image size:

1. **Build stage** (`node:22-alpine`): Installs all dependencies (including dev), compiles TypeScript server, builds the Vite client. Requires `python3 make g++` for the `better-sqlite3` native module.

2. **Production-deps stage** (`node:22-alpine`): Installs only production dependencies (`npm ci --omit=dev`). Also requires `python3 make g++` for `better-sqlite3` native compilation, but these tools are discarded with the stage — they never reach the runtime image.

3. **Runtime stage** (`node:22-alpine`): Copies only `node_modules` from the prod-deps stage and built artifacts (`server/dist`, `client/dist`) from the build stage. No build tools in the final image. Runs as the `node` user (non-root) for security.

Layer caching strategy: package.json and package-lock.json files are copied before source code so dependency installation is cached across rebuilds that only change source.

### .dockerignore

Excludes files that are large, regenerated, or runtime-specific: `.git`, `node_modules`, `data`, `dist`, `.env`, database files, TypeScript build info, IDE config, docs, stories, and tests.

### Runtime configuration

- Default `DATABASE_PATH` is `./data/puutteet.db`, which resolves to `/app/data/puutteet.db` inside the container. The Dockerfile creates `/app/data` owned by the `node` user.
- `PORT` defaults to 3000. The Dockerfile exposes 3000.
- `NODE_ENV` is set to `production` in the Dockerfile.
- Data persistence: operators mount a Docker volume at `/app/data` to persist the SQLite database across container restarts.

### Key path resolution

The server serves the built frontend from `path.join(__dirname, '../../client/dist')`. Since the server entry point is `server/dist/index.js`, `__dirname` is `/app/server/dist`, and `../../client/dist` resolves to `/app/client/dist`. The Dockerfile must preserve this directory structure.

## Tasks

### Task 1 - Create .dockerignore

- No preconditions + `cat .dockerignore` lists the following patterns
  - → `.git` is excluded
  - → `node_modules` is excluded
  - → `data` is excluded
  - → `dist` is excluded
  - → `.env` is excluded
  - → `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` are excluded
  - → `*.tsbuildinfo` is excluded
  - → `.opencode` is excluded
  - → `docs` is excluded
  - → `stories` is excluded
  - → `tests` is excluded

### Task 2 - Create Dockerfile

- No preconditions + `docker build -t puutteet .` exits with code 0
  - → Image builds without errors
  - → Final image uses `node:22-alpine` as base
  - → Final image does not contain `python3`, `make`, or `g++`
- No preconditions + `docker build -t puutteet .` (second run with no source changes)
  - → Build uses cached layers for dependency installation (no re-download of npm packages)
- No preconditions + `docker inspect puutteet | jq '.[0].Config.User'`
  - → Returns `"node"` (non-root user)

### Task 3 - Container starts and serves the application

- `docker build -t puutteet .` succeeds + `docker run --rm -d -p 3000:3000 --name puutteet-test puutteet`
  - → Container starts without crashing
  - → `curl http://localhost:3000/api/items` returns HTTP 200 with `[]`
  - → `curl http://localhost:3000/` returns HTTP 200 with HTML (the React frontend)
- Running container + `docker stop puutteet-test`
  - → Container exits with code 0 (graceful SIGTERM handling)

### Task 4 - Environment variables and data persistence

- `docker run --rm -d -p 8080:8080 -e PORT=8080 --name puutteet-test puutteet`
  - → Server listens on port 8080 inside the container
  - → `curl http://localhost:8080/api/items` returns HTTP 200
- `docker volume create puutteet-test-data` + `docker run --rm -d -p 3000:3000 -v puutteet-test-data:/app/data --name puutteet-test puutteet`
  - → `curl -X POST http://localhost:3000/api/items -H 'Content-Type: application/json' -d '{"name":"Milk"}'` returns 201
  - → `docker stop puutteet-test && docker run --rm -d -p 3000:3000 -v puutteet-test-data:/app/data --name puutteet-test puutteet`
  - → `curl http://localhost:3000/api/items` returns 200 with the previously created item still present
  - → `docker volume rm puutteet-test-data` cleans up

## Technical Context

- **Base image**: `node:22-alpine` — Node.js 22 LTS on Alpine Linux. Small footprint, musl libc. The `better-sqlite3` native module compiles and runs correctly on Alpine.
- **better-sqlite3**: Requires `python3`, `make`, `g++` at build time for native compilation. These are installed in the build and prod-deps stages only; the runtime stage has no compiler toolchain.
- **npm workspaces**: The monorepo uses npm workspaces (`server` and `client`). `npm ci` and `npm ci --omit=dev` both respect the workspace structure and install dependencies for all packages.
- **ESM modules**: Both `server` and `client` use `"type": "module"`. The server entry point is `server/dist/index.js` and runs with `node server/dist/index.js` (no `--experimental-modules` flag needed in Node 22).
- **Static file serving**: In production mode (`NODE_ENV=production`), Express serves the Vite build output from `client/dist/`. The path is resolved as `path.join(__dirname, '../../client/dist')` from `server/dist/index.js`.

## Notes

- The `client` package lists `react` and `react-dom` as `dependencies` rather than `devDependencies`. This means `npm ci --omit=dev` installs them in the runtime image even though they are not needed at runtime (the client is pre-built static files). A future optimization could move them to `devDependencies`, but this is cosmetic — it adds ~5 MB to the image and does not affect functionality.
- The `data/` directory is created by the Dockerfile with ownership `node:node` so the non-root user can write the SQLite database. Operators must mount a volume at `/app/data` for persistence; otherwise data is lost when the container is removed.
- The Dockerfile does not include a `HEALTHCHECK` instruction. The app already responds to `GET /` with 200, and Docker Compose or orchestrators can define their own health checks.
- No `docker-compose.yml` is included in this story. Operators can create one themselves or use the `docker run` command directly.