# Serve Favicon as Static File at /favicon.svg

## Context

The Puutteet application currently embeds the favicon as an inline data URI in `client/index.html`. The user operates a dashboard page that lists all their self-hosted services and fetches each service's favicon directly via HTTP at a known path. To support this, the favicon must be available as a standalone file at `/favicon.svg` in both development and production.

## Out of Scope

- Multi-size favicon sets (e.g., `.ico` with multiple resolutions, `apple-touch-icon`).
- Cache-control headers or CDN optimization for the favicon.
- Changing the favicon design or emoji — it remains the shopping cart icon.

## Implementation approach

### Static file placement

1. Create `client/public/favicon.svg` containing the same SVG used in the current inline data URI (`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛒</text></svg>`).
   - Vite automatically serves files in `client/public/` at the root path during development.
   - Vite copies `client/public/` contents into `client/dist/` during `npm run build`, so the file is present in the production build output.

### HTML update

2. Update `client/index.html` to replace the inline data URI `<link rel="icon">` with a reference to the static file path: `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

### Server impact

No server code changes are required. In production, `express.static(clientDist)` is already registered in `server/src/index.ts` before the catch-all route, so `GET /favicon.svg` is served from `client/dist/favicon.svg` automatically. In development, the Vite dev server handles the request.

### Testing

Add a test in `tests/integration.test.ts` inside the existing production-serving `describe` block that verifies `GET /favicon.svg` returns HTTP 200 with `Content-Type: image/svg+xml` and the SVG body contains the shopping cart text element.

## Tasks

### Task 1 — Create favicon.svg

- No preconditions + `cat client/public/favicon.svg`
  - → File exists and contains an SVG root element with `xmlns="http://www.w3.org/2000/svg"`
  - → SVG contains a `<text>` element with the shopping cart emoji (`🛒`)
- No preconditions + `npm run build` in the project root
  - → `client/dist/favicon.svg` is created (copied from `client/public` by Vite)
  - → File content matches the source in `client/public/favicon.svg`

### Task 2 — Update HTML reference

- No preconditions + read `client/index.html`
  - → The `<link rel="icon">` element references `href="/favicon.svg"` instead of a `data:image/svg+xml` URI
  - → `type="image/svg+xml"` attribute is preserved
- No preconditions + `npm run build` + read `client/dist/index.html`
  - → The built HTML still contains the `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` reference

### Task 3 — Production endpoint test

- `npm run build` succeeds + production server is running on the test port
  - → `GET /favicon.svg` returns HTTP 200
  - → Response `Content-Type` header contains `image/svg+xml`
  - → Response body contains the SVG text element with the shopping cart emoji
- Production server running + `GET /favicon.svg` (repeated request)
  - → Still returns HTTP 200 (no regression from the catch-all `/{*path}` route)

## Notes

- The `client/public` directory does not exist yet and must be created as part of this story.
- Because `express.static` is registered before the catch-all `app.get('/{*path}', ...)`, the static file takes precedence. If the file is missing, the catch-all serves `index.html`, which is why the integration test asserts the file exists and is served correctly.
- The favicon must remain visually identical to the existing inline version — the only change is the delivery mechanism.
