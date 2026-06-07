# Puutteet

A single-user, self-hosted shopping list web application. Add items as you notice things running low, then check the list while shopping and mark items as bought.

Built with Express + SQLite (backend) and React + Vite (frontend). Runs on a private home server accessed through Tailscale.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (v24+ recommended for `--env-file` support)
- npm 9+

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

Run `npm run dev` from the root to start both with hot reload. The Vite dev server proxies `/api` requests to Express on port 3000.

## Running tests

```bash
npm test
```

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
│   │   ├── index.ts      # Server entry, static serving, error middleware
│   │   ├── db.ts         # SQLite connection, schema init
│   │   ├── items.ts      # Route handlers for /api/items
│   │   └── types.ts      # TypeScript interfaces
│   └── package.json
├── client/               # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx       # Main app component
│   │   ├── App.css       # Styles with CSS custom properties
│   │   ├── main.tsx      # Entry point
│   │   ├── api.ts        # Fetch wrapper for API calls
│   │   └── types.ts      # Shared TypeScript interfaces
│   ├── index.html
│   ├── vite.config.ts    # Vite config with /api proxy
│   └── package.json
├── data/                 # SQLite database file (created at runtime)
├── .env.example          # Environment variable documentation
├── package.json          # Root workspace config
└── tsconfig.base.json    # Shared TypeScript config
```

## Tech stack

- **Node.js** v24.x
- **TypeScript** with strict mode
- **Express** 5.2.1 — backend framework
- **better-sqlite3** 12.10.0 — synchronous SQLite3 binding
- **React** 19.2.7 — frontend framework
- **Vite** 6.x — frontend build tool
- **Vitest** 4.x — test runner

## License

MIT
