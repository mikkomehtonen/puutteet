# Puutteet

A single-user, self-hosted shopping list web application. Add items as you notice things running low, then check the list while shopping and mark items as bought. Changes sync in real time across open tabs via WebSocket.

Built with Express + SQLite (backend) and React + Vite (frontend). Runs on a private home server accessed through Tailscale.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (v24+ recommended for `--env-file` support)
- npm 9+
- (Optional) Docker for containerized deployment

## Quick start

```bash
# Clone the repository
git clone <repo-url> puutteet
cd puutteet

# Install dependencies
npm install

# Development mode (starts both client and server with hot reload)
npm run dev

# The Vite dev server runs on http://localhost:5173
# The Express API server runs on http://localhost:3000
```

## Production

```bash
# Build the frontend and compile the server
npm run build

# Start the production server
npm start

# The app is served at http://localhost:3000
```

## Docker

Build and run with Docker:

```bash
# Build the image
docker build -t puutteet .

# Run with a volume for data persistence
docker run -d -p 3000:3000 -v puutteet-data:/app/data puutteet
```

The image is based on `node:22-alpine`, runs as a non-root `node` user, and exposes port 3000.

## Configuration

All environment variables are optional, with sensible defaults.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DATABASE_PATH` | `./data/puutteet.db` | Path to the SQLite database file |
| `NODE_ENV` | `development` | `development` or `production` |

Set them via the shell or with Node's `--env-file` flag:

```bash
PORT=4000 DATABASE_PATH=/custom/path.db npm start
# or
node --env-file=.env server/dist/index.js
```

See `.env.example` for all available variables.

## Development

The project uses npm workspaces with two packages:

- **`server/`** — Express API server (TypeScript, compiled with `tsc`)
- **`client/`** — React frontend (Vite + TypeScript)

Run `npm run dev` from the root to start both with hot reload. The Vite dev server proxies `/api` and `/ws` requests to Express on port 3000.

## Running tests

```bash
# Run all tests (server unit + client unit + integration tests)
npm test
```

Tests are organized in three layers:

- **Server unit tests** — `server/src/test/` (Vitest, Node environment)
- **Client unit tests** — `client/src/test/` (Vitest, jsdom environment)
- **Integration tests** — `tests/` (build verification, dev server, production serving, Docker)

## Backing up the database

The SQLite database is stored at `data/puutteet.db` by default. To back it up:

1. Stop the server.
2. Copy the file: `cp data/puutteet.db backup.db`

For hot backups without stopping the server:

```bash
sqlite3 data/puutteet.db ".backup backup.db"
```

## Upgrading

```bash
git pull
npm install
npm run build
# Restart the server
npm start
```

## Project structure

```
puutteet/
├── server/               # Express + TypeScript backend
│   ├── src/
│   │   ├── index.ts      # Server entry, static serving, WebSocket init
│   │   ├── db.ts         # SQLite connection, schema init
│   │   ├── items.ts      # Route handlers for /api/items
│   │   ├── ws.ts         # WebSocket server for real-time sync
│   │   ├── types.ts      # TypeScript interfaces
│   │   └── test/         # Server unit tests
│   ├── vitest.config.ts  # Server test config
│   └── package.json
├── client/               # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx       # Main app component
│   │   ├── App.css       # Styles with CSS custom properties
│   │   ├── main.tsx      # Entry point
│   │   ├── api.ts        # Fetch wrapper for API calls
│   │   ├── useWebSocket.ts # WebSocket hook for real-time updates
│   │   ├── types.ts      # Shared TypeScript interfaces
│   │   └── test/         # Client unit tests
│   ├── index.html
│   ├── vite.config.ts    # Vite config with /api and /ws proxy
│   ├── vitest.config.ts  # Client test config
│   └── package.json
├── tests/                # Integration tests
│   ├── integration.test.ts
│   └── docker.test.ts
├── vitest.config.ts      # Root integration test config
├── data/                 # SQLite database file (created at runtime)
├── Dockerfile            # Multi-stage Docker build
├── .dockerignore         # Docker build exclusions
├── .env.example          # Environment variable documentation
├── package.json          # Root workspace config
└── tsconfig.base.json    # Shared TypeScript config
```

## Tech stack

- **Node.js** v24.x
- **TypeScript** with strict mode
- **Express** 5.2.1 — backend framework
- **better-sqlite3** 12.10.0 — synchronous SQLite3 binding
- **ws** 8.21.0 — WebSocket library for real-time sync
- **React** 19.2.7 — frontend framework
- **Vite** 6.x — frontend build tool
- **Vitest** 4.x — test runner

## License

MIT
