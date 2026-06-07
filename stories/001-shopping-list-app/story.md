# Shopping List Application

## Context

A single-user, self-hosted shopping list web application. The user adds items as they notice something running low at home (e.g., toothpaste), then opens the app while shopping to see what needs to be purchased and marks items as bought. The app runs on a private home server accessed through Tailscale — no public internet exposure, no user accounts, and no multi-user support are needed. This is the initial project scaffold plus the complete feature set.

## Out of Scope

- Authentication, authorization, or multi-user support.
- Public internet exposure, TLS termination, or reverse-proxy configuration.
- Sharing lists, categories, multiple lists, or item history/analytics.
- Barcode scanning, price tracking, or recipe integration.
- Push notifications or offline-first/PWA support.
- Docker or container orchestration beyond a simple Dockerfile and docker-compose.yml for deployment convenience.

## Implementation approach

### Project structure

Monorepo with npm workspaces. Root `package.json` defines `server` and `client` workspaces and convenience scripts (`dev`, `build`, `start`). Shared TypeScript base config in `tsconfig.base.json`.

```
puutteet/
├── server/               # Express + TypeScript backend
│   ├── src/
│   │   ├── index.ts      # Server entry, static serving, error middleware
│   │   ├── db.ts         # SQLite connection, schema init, migration
│   │   ├── items.ts      # Route handlers for /api/items
│   │   └── types.ts      # Item interface, CreateItemInput, UpdateItemInput
│   ├── tsconfig.json
│   └── package.json
├── client/               # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── main.tsx
│   │   ├── api.ts        # Fetch wrapper for API calls
│   │   ├── types.ts      # Item interface matching server
│   │   └── vite-env.d.ts
│   ├── index.html
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── package.json
├── data/                 # SQLite database file (gitignored, created at runtime)
├── .env.example
├── .gitignore
├── README.md
├── package.json          # Root workspace config
└── tsconfig.base.json
```

### Backend

- **Runtime**: Node.js with TypeScript, compiled via `tsc` for production.
- **Framework**: Express 5.2.1 — chosen over Fastify for simplicity and familiarity. No schema validation library; validate manually with TypeScript types and simple checks.
- **Database**: SQLite via `better-sqlite3` 12.10.0. Synchronous API is ideal for a single-user app — no connection pooling complexity.
- **Database file**: Stored at `./data/puutteet.db` (configurable via `DATABASE_PATH` env var). The `data/` directory is created automatically if missing. The database file is created on first run.
- **Schema**: Single `items` table as specified in the requirements. Schema is created on server startup if the table does not exist. No migration framework — the schema is simple enough that a `CREATE TABLE IF NOT EXISTS` suffices.
- **Timestamps**: All timestamps stored as ISO 8601 strings (`new Date().toISOString()`). `created_at` and `updated_at` are set on creation. `updated_at` is updated on every modification. `checked_at` is set when `checked` transitions to `true`, cleared (set to `NULL`) when `checked` transitions to `false`.
- **CORS**: Not needed. In development, Vite's dev server proxies `/api` requests to Express (configured in `vite.config.ts`), so the browser only talks to one origin. In production, Express serves the built frontend as static files on the same origin.
- **Static serving**: In production, Express serves the Vite build output from `client/dist/`.
- **Error handling**: Centralized error middleware returns JSON `{ error: string }` with appropriate HTTP status codes. 404 for missing items, 400 for validation errors, 500 for unexpected errors.

### API design

| Method | Path | Description | Request body | Success response |
|--------|------|-------------|--------------|------------------|
| GET | `/api/items` | Returns all items | — | `200` array of items, active items first (sorted by `created_at` desc), then purchased items (sorted by `checked_at` desc) |
| POST | `/api/items` | Creates a new item | `{ name: string, quantity?: string, note?: string }` | `201` created item |
| PATCH | `/api/items/:id` | Updates item fields | `{ name?: string, quantity?: string, note?: string }` | `200` updated item |
| PATCH | `/api/items/:id/checked` | Toggles purchased status | `{ checked: boolean }` | `200` updated item |
| DELETE | `/api/items/:id` | Deletes an item | — | `204` no content |

Validation rules:
- `POST /api/items`: `name` is required, must be a non-empty string after trimming. `quantity` and `note` default to empty strings if omitted. `checked` defaults to `false`.
- `PATCH /api/items/:id`: At least one field must be provided. `name` must be non-empty if present.
- `PATCH /api/items/:id/checked`: `checked` is required and must be a boolean.
- `DELETE /api/items/:id`: No body required. Returns 404 if item doesn't exist.
- All `PATCH` and `DELETE` endpoints return 404 if the item ID doesn't exist.

### Frontend

- **Framework**: React 19.2.7 with TypeScript, built with Vite 8.0.16.
- **Styling**: Single `App.css` file with CSS custom properties for theming. Mobile-first, responsive. No CSS framework — keep it lightweight.
- **State management**: React `useState` and `useEffect` only. No external state library needed for this scope.
- **API calls**: `fetch` wrapper in `api.ts` with error handling. Base URL configurable via `VITE_API_URL` env var (defaults to empty string for same-origin in production).
- **Layout**: Single-page app with no routing library. Two sections: active items (top) and purchased items (bottom, collapsible).
- **Mobile-first design principles**:
  - Minimum touch target size of 44×44px for all interactive elements.
  - Full-width input field with prominent Add button.
  - Checkbox is large and easy to tap.
  - Delete button uses a trash icon or "×" with adequate tap area.
  - Purchased items are visually dimmed (reduced opacity) with strikethrough text.
  - No horizontal scrolling; everything stacks vertically.
  - Font sizes readable without zooming (minimum 16px body text).

### Data persistence

- SQLite database file stored at `./data/puutteet.db` by default.
- The `data/` directory is gitignored.
- The path is configurable via `DATABASE_PATH` environment variable.
- `better-sqlite3` uses WAL mode for better read concurrency (useful if the user opens multiple tabs).
- On server startup, the schema is ensured via `CREATE TABLE IF NOT EXISTS`.
- Backup: document that the user should copy `data/puutteet.db` to a backup location. SQLite's built-in backup API or simple file copy while the server is stopped both work.

### Environment configuration

`.env.example` documents all available variables:
- `PORT` — server port (default: 3000)
- `DATABASE_PATH` — path to SQLite database file (default: `./data/puutteet.db`)
- `NODE_ENV` — `development` or `production` (default: `development`)

The server reads env vars via `process.env` directly (no `dotenv` dependency — the user or deployment script sets env vars, or uses `node --env-file=.env` available in Node 20+).

## Tasks

### Task 1 - Project scaffolding and configuration

- No preconditions + run `npm install` from project root
  - → Both `server` and `client` workspaces install dependencies without errors
  - → `npm run build` exits with code 0
- No preconditions + run `npm run dev` from project root
  - → Vite dev server starts on port 5173
  - → Express server starts on port 3000
  - → Both processes restart on file changes in development mode
- No preconditions + run `npm run build && npm start`
  - → Express serves the built frontend at `http://localhost:3000`
  - → API endpoint `GET /api/items` returns `200` with an empty array

### Task 2 - Database initialization and schema

- No preconditions + start the server for the first time
  - → `data/` directory is created if it doesn't exist
  - → `data/puutteet.db` file is created with the `items` table
  - → `GET /api/items` returns `200` with `[]`
- Existing database + restart the server
  - → Existing data is preserved (no data loss)
  - → `CREATE TABLE IF NOT EXISTS` does not recreate or truncate the table
- No preconditions + start the server with `DATABASE_PATH=./custom/path.db`
  - → Database file is created at the custom path

### Task 3 - REST API endpoints

- No preconditions + `POST /api/items` with `{ "name": "Milk" }`
  - → Returns `201` with `{ id: 1, name: "Milk", quantity: "", note: "", checked: false, created_at: "<ISO>", updated_at: "<ISO>", checked_at: null }`
  - → `GET /api/items` returns the created item
- No preconditions + `POST /api/items` with `{ "name": "  ", "quantity": "2 liters" }`
  - → Returns `400` with `{ error: "..." }` (name must be non-empty after trim)
- No preconditions + `POST /api/items` with `{ "name": "Bread", "quantity": "1 loaf", "note": "whole wheat" }`
  - → Returns `201` with all fields populated correctly
- Existing item + `PATCH /api/items/:id` with `{ "name": "Sourdough Bread" }`
  - → Returns `200` with updated item, `updated_at` is refreshed
- Existing item + `PATCH /api/items/:id` with `{}`
  - → Returns `400` with `{ error: "..." }` (at least one field required)
- Non-existent ID + `PATCH /api/items/9999` with `{ "name": "X" }`
  - → Returns `404`
- Unchecked item + `PATCH /api/items/:id/checked` with `{ "checked": true }`
  - → Returns `200` with `checked: true` and `checked_at` set to current ISO timestamp
  - → `updated_at` is also refreshed
- Checked item + `PATCH /api/items/:id/checked` with `{ "checked": false }`
  - → Returns `200` with `checked: false` and `checked_at: null`
- Existing item + `DELETE /api/items/:id`
  - → Returns `204` with empty body
  - → `GET /api/items` no longer includes the deleted item
- Non-existent ID + `DELETE /api/items/9999`
  - → Returns `404`

### Task 4 - React frontend: add and display items

- App loaded on mobile viewport + type "Toothpaste" in input + press Enter
  - → Item "Toothpaste" appears in the active items list immediately
  - → Input field clears after adding
- App loaded + type "Milk" in input + tap "Add" button
  - → Item "Milk" appears in the active items list
  - → Input field clears after adding
- App loaded + submit with empty input
  - → No item is created, no error shown (button is disabled or input is ignored)
- App loaded + add item with quantity "2 liters"
  - → Item shows name "Milk" and quantity "2 liters" in the list
- App loaded + add multiple items
  - → Active items are displayed in reverse chronological order (newest first)

### Task 5 - React frontend: check and delete items

- Active item visible + tap checkbox
  - → Item moves from active section to purchased section
  - → Item appears with strikethrough text and reduced opacity
  - → `checked_at` timestamp is set on the server
- Purchased item visible + tap checkbox
  - → Item moves from purchased section back to active section
  - → Strikethrough and dimming are removed
  - → `checked_at` is cleared on the server
- Any item + tap delete button
  - → Item is removed from the list immediately
  - → No confirmation dialog needed
- Purchased items section + no purchased items exist
  - → Purchased section is hidden or shows an empty state message

### Task 6 - Data persistence and production build

- Items exist in database + restart the server process
  - → All previously added items are still present and correct
  - → `GET /api/items` returns the same data as before restart
- Production build + `npm run build && npm start`
  - → Express serves the built React frontend at `http://localhost:3000`
  - → API endpoints work correctly
  - → No Vite dev server is needed
- Production build + open in mobile browser
  - → UI is responsive and usable on a 375px wide viewport
  - → Touch targets are at least 44×44px
  - → No horizontal scrolling occurs

### Task 7 - Documentation and configuration files

- No preconditions + read `README.md`
  - → Contains installation instructions (prerequisites, clone, install, build, run)
  - → Contains configuration details (all env vars documented)
  - → Contains backup instructions for the SQLite database
  - → Contains upgrade instructions (git pull, npm install, npm run build, restart server)
- No preconditions + read `.env.example`
  - → Lists all configurable environment variables with defaults
- No preconditions + read `.gitignore`
  - → Includes `node_modules/`, `data/`, `.env`, `dist/`

## Bootstrap

```bash
# Clone and enter the project
git clone <repo-url> puutteet && cd puutteet

# Install all workspace dependencies
npm install

# Development mode (starts both client and server with hot reload)
npm run dev

# Production build and start
npm run build
npm start
```

## Technical Context

- **Node.js**: v24.x (runtime; `--env-file` flag available for `.env` loading without dotenv dependency)
- **TypeScript**: 6.0.3 — strict mode enabled (`strict: true` in tsconfig)
- **Express**: 5.2.1 — Express 5 stable release. Uses `app.listen()` returning a promise. Route params use `req.params`. Error handling uses async middleware.
- **better-sqlite3**: 12.10.0 — synchronous SQLite3 binding. `db.prepare()` returns a statement object. Use `db.pragma('journal_mode = WAL')` for WAL mode.
- **React**: 19.2.7 — React 19 stable. `useEffect` cleanup, `useState` with functional updates for stale closure safety.
- **Vite**: 8.0.16 — `@vitejs/plugin-react` 6.0.2 for React Fast Refresh. Proxy `/api` to Express dev server in `vite.config.ts`.
- **@types/better-sqlite3**: 7.6.13 — provides `Database` type and `Statement` type.
- **@types/express**: 5.0.6 — Express 5 types.
- **tsx**: 4.22.4 — TypeScript execution for development server with `--watch` flag.
- **concurrently**: 10.0.3 — runs client and server dev processes in parallel.
- **vitest**: 4.1.8 — test runner for server-side unit tests.
- **@testing-library/react**: 16.3.2 — React component testing utilities.
- **@testing-library/jest-dom**: 6.9.1 — custom matchers for DOM assertions.
- **jsdom**: 29.1.1 — DOM environment for Vitest browser-like tests.

## Notes

- The app is designed for a single user on a private network. No authentication is implemented. Anyone with Tailscale access to the server can view and modify the list.
- The `checked_at` field is set to the current ISO 8601 timestamp when an item is marked as purchased, and set to `NULL` when an item is restored to active. This enables future features like "sort by when purchased" without schema changes.
- Quantity is stored as a free-text string (not a number) to accommodate values like "2 liters", "1 loaf", "a bunch".
- The Vite dev server proxies `/api` requests to the Express backend (port 3000) so the browser only communicates with one origin. In production, Express serves the built frontend directly. No CORS configuration is needed in either environment.
- The `data/` directory is created at runtime if it doesn't exist. It is gitignored to prevent database files from being committed.
- For backup, the user should stop the server and copy `data/puutteet.db` to a backup location. Alternatively, they can use `sqlite3 data/puutteet.db ".backup backup.db"` for a hot backup without stopping the server.
- The project uses npm workspaces with `server` and `client` packages. The root `package.json` has convenience scripts that delegate to workspace scripts.
- No Dockerfile is included in this story. Deployment is via direct Node.js execution. The user can add containerization later if desired.
- The frontend does not use a routing library — it's a single-page app with one view (the shopping list).