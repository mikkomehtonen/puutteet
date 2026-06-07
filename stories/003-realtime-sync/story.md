# Real-Time Sync via WebSocket

## Context

When two browser tabs or devices have the shopping list open simultaneously, changes made in one tab (adding, checking, or deleting an item) are not visible in the other until the page is manually reloaded. This is because the client only fetches items once on mount. The app should push changes to all connected clients immediately when they happen on the server, so every open instance stays in sync without manual reload.

## Out of Scope

- Authentication or authorization for WebSocket connections — any client on the private network can connect.
- Offline-first support or message queuing — if the WebSocket is disconnected, the app falls back to HTTP-only; no messages are queued or replayed beyond a full re-fetch on reconnect.
- Binary or custom protocol — messages are JSON text frames only.
- Selective broadcast (e.g., per-list or per-room) — there is one list, so every connected client receives every message.
- Push notifications (browser Notification API or service workers).

## Implementation approach

### WebSocket server (`ws` library)

Add `ws` (8.21.0) as a production dependency to the `server` package. Create `server/src/ws.ts` that:

1. Exports `initWebSocketServer(server: HttpServer)` — creates a `WebSocketServer` attached to the existing HTTP server, listening on the `/ws` path.
2. Maintains a `Set<WebSocket>` of connected clients.
3. Exports `broadcast(message: WsMessage)` — serialises the message as JSON and sends it to every connected client. Silently skips clients whose `readyState` is not `OPEN`.
4. Handles `connection`, `close`, and `error` events on each socket. Logs connection/disconnection at `console.info` level; logs errors at `console.error` level. Does not crash the server on socket errors.

### Message protocol

All messages are JSON text frames. The server only sends; it does not expect incoming messages from clients. Three message types, using a discriminated union:

```
{ "type": "item_created", "item": { …full Item object… } }
{ "type": "item_updated", "item": { …full Item object… } }
{ "type": "item_deleted", "id": <number> }
```

- `item_created` — sent after `POST /api/items` succeeds (201).
- `item_updated` — sent after `PATCH /api/items/:id` or `PATCH /api/items/:id/checked` succeeds (200).
- `item_deleted` — sent after `DELETE /api/items/:id` succeeds (204).

The `Item` shape matches the existing `Item` interface in `server/src/types.ts` (id, name, quantity, note, checked, created_at, updated_at, checked_at).

### Server changes

In `server/src/items.ts`, import `broadcast` from `./ws.js` and call it after each successful mutation, passing the full item (or id for deletes). The broadcast happens after the HTTP response is sent — this is acceptable because `better-sqlite3` is synchronous, so the DB write is already committed before the response.

In `server/src/index.ts`, capture the return value of `app.listen()` as `server` and call `initWebSocketServer(server)` before the listening callback.

### Client WebSocket hook (`useWebSocket`)

Create `client/src/useWebSocket.ts` exporting a `useWebSocket` hook:

1. Constructs the WebSocket URL from `window.location`: `${protocol}//${host}/ws` where protocol is `wss:` if the page is `https:`, otherwise `ws:`.
2. On mount, opens a `WebSocket` connection.
3. On `message`, parses JSON and stores in a `lastMessage` ref that triggers a state update via a counter increment (avoids stale closure issues).
4. On `close`, starts a reconnection timer with exponential backoff: initial delay 1 s, max delay 30 s, multiplier 2. On each reconnect attempt, creates a new `WebSocket`.
5. On successful `open`, resets the backoff delay and re-fetches all items via `fetchItems()` to ensure consistency after any missed messages.
6. On unmount, closes the socket and clears timers.
7. Returns `{ lastMessage: WsMessage | null, connected: boolean }`.

### Client state reconciliation in `App.tsx`

Add a `useEffect` that watches `lastMessage` from `useWebSocket` and updates `items` state:

- `item_created`: If an item with the same `id` already exists in state, replace it (handles the case where the originating client already added the item from the HTTP response). Otherwise, prepend it to the list.
- `item_updated`: Replace the item with matching `id` in state. If not found, prepend it (defensive — ensures consistency even if the initial fetch missed it).
- `item_deleted`: Remove the item with matching `id` from state.

This reconciliation is idempotent: receiving the same message twice or receiving a message for a change the client already applied via HTTP response produces the correct state.

### Vite dev proxy

Add a `/ws` proxy entry in `client/vite.config.ts`:

```ts
'/ws': {
  target: 'http://localhost:3000',
  ws: true,
}
```

This allows the Vite dev server (port 5173) to proxy WebSocket connections to the Express server (port 3000).

### Connection status indicator

Show a small visual indicator in the header area of `App.tsx`:

- A green dot (CSS class `sync-dot sync-dot--connected`) when `connected` is `true`.
- A red dot (CSS class `sync-dot sync-dot--disconnected`) when `connected` is `false`.
- The dot has `aria-label="Connected"` or `aria-label="Disconnected"` for accessibility.
- Positioned next to the heading using a flex layout on `.app-header`.

### Shared types

Add `WsMessage` type to `server/src/types.ts`:

```ts
export type WsMessage =
  | { type: 'item_created'; item: Item }
  | { type: 'item_updated'; item: Item }
  | { type: 'item_deleted'; id: number };
```

Add the same type to `client/src/types.ts` (duplicated because the monorepo has no shared types package; the shapes must stay in sync manually).

### Docker / production

No changes to the Dockerfile. The WebSocket server shares the same HTTP port (3000) and path (`/ws`), so no additional `EXPOSE` directive or port mapping is needed. The existing `run.sh` and Docker configuration work as-is.

## Tasks

### Task 1 - Add `ws` dependency and create WebSocket server module

- `npm install ws` run in `server/` + `npm ls ws` exits 0
  - → `ws@8.21.0` is listed in `server/package.json` dependencies
- `server/src/ws.ts` exports `initWebSocketServer` and `broadcast`
  - → TypeScript compiles without errors (`npm run build -w server` exits 0)
- `initWebSocketServer(server)` called with a running HTTP server
  - → A WebSocket client connecting to `ws://localhost:<PORT>/ws` receives the connection handshake (readyState becomes `OPEN`)

### Task 2 - Broadcast mutations from REST route handlers

- `POST /api/items` with `{ "name": "Milk" }` + a WebSocket client connected
  - → The connected client receives a JSON message `{ "type": "item_created", "item": { "id": 1, "name": "Milk", … } }`
- `PATCH /api/items/1` with `{ "name": "Oat Milk" }` + a WebSocket client connected
  - → The connected client receives `{ "type": "item_updated", "item": { "id": 1, "name": "Oat Milk", … } }`
- `PATCH /api/items/1/checked` with `{ "checked": true }` + a WebSocket client connected
  - → The connected client receives `{ "type": "item_updated", "item": { "id": 1, "checked": 1, … } }`
- `DELETE /api/items/1` + a WebSocket client connected
  - → The connected client receives `{ "type": "item_deleted", "id": 1 }`
- `GET /api/items` (non-mutating) + a WebSocket client connected
  - → No WebSocket message is sent

### Task 3 - Client WebSocket hook and state reconciliation

- App loaded + another client creates an item via `POST /api/items`
  - → The item appears in the local items list without page reload
- App loaded + another client updates an item via `PATCH /api/items/:id`
  - → The item updates in the local list without page reload
- App loaded + another client checks an item via `PATCH /api/items/:id/checked`
  - → The item moves between active and purchased sections without page reload
- App loaded + another client deletes an item via `DELETE /api/items/:id`
  - → The item disappears from the local list without page reload
- App loaded + same client creates an item (HTTP response + WebSocket message both arrive)
  - → Item appears once in the list (no duplicate)
  - → The local state from the HTTP response is preserved or overwritten with identical data from the WebSocket message

### Task 4 - Reconnection and consistency

- WebSocket connected + server restarts
  - → Client reconnects automatically (green dot reappears)
  - → After reconnect, all items are re-fetched and the list is consistent with the server
- WebSocket connected + network interruption (simulated by closing the socket)
  - → Red dot appears within 1 second
  - → Client retries connection with exponential backoff (1 s, 2 s, 4 s, … up to 30 s max)
  - → On successful reconnect, green dot appears and items are re-fetched

### Task 5 - Connection status indicator

- App loaded + WebSocket connected
  - → A green dot is visible in the header area with `aria-label="Connected"`
- App loaded + WebSocket disconnected
  - → The dot turns red with `aria-label="Disconnected"`
- App loaded + WebSocket reconnects after disconnection
  - → The dot turns green again with `aria-label="Connected"`

### Task 6 - Vite dev proxy for WebSocket

- Vite dev server running + client opens `ws://localhost:5173/ws`
  - → The connection is proxied to the Express server on port 3000
  - → WebSocket messages flow correctly through the proxy

### Task 7 - Existing tests still pass

- `npm test` at the workspace root
  - → All existing server unit tests pass
  - → All existing client unit tests pass
  - → All existing integration tests pass

## Bootstrap

```bash
cd /home/mikko/workspace/puutteet

# Add ws dependency to server
npm install -w server ws@8.21.0

# Verify installation
npm ls ws -w server

# Run existing tests to confirm no regressions
npm test
```

## Technical Context

- **ws**: 8.21.0 — the de-facto standard WebSocket library for Node.js. Includes built-in TypeScript definitions (no `@types/ws` needed). Used to create a WebSocket server that shares the Express HTTP server. Supports the `path` option to listen on `/ws` only.
- **Express 5.2.1**: `app.listen()` returns an `http.Server` synchronously. The WebSocket server attaches to this server via `new WebSocketServer({ server, path: '/ws' })`.
- **better-sqlite3**: Synchronous API means the database write is committed before the HTTP response is sent, so broadcasting after the response is safe — the data is already persisted.
- **React 19.2.7**: `useEffect` cleanup and `useRef` are used to manage the WebSocket lifecycle and avoid stale closures. The `lastMessage` pattern (ref + counter state) ensures the consuming `useEffect` always sees the latest message.
- **Vite 6.3.5**: The `proxy` config supports `ws: true` for WebSocket proxying. Adding a `/ws` entry with `ws: true` proxies WebSocket upgrade requests to the target.
- **Docker**: No changes needed — the WebSocket server shares the same HTTP port (3000) and the existing `EXPOSE 3000` covers it.

## Notes

- The WebSocket server does not accept incoming messages from clients. It is a one-way broadcast channel: the server pushes change notifications, and clients reconcile their local state. This keeps the protocol simple and avoids the need for client authentication over WebSocket.
- The `broadcast` function skips clients whose `readyState !== WebSocket.OPEN`. This prevents errors from sending to sockets that are in the process of closing.
- On reconnect, the client performs a full `fetchItems()` HTTP request to reconcile state. This is simpler than tracking missed messages and is fast enough for a single-user shopping list (the payload is small).
- The `WsMessage` type is duplicated between `server/src/types.ts` and `client/src/types.ts` because the monorepo has no shared types package. Changes to the message format must be made in both files.
- The connection status dot is intentionally minimal — a small colored circle in the header. No text label beyond the `aria-label` is needed for this scope.