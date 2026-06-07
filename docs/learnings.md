# Learnings

## Express 5 catch-all route syntax uses `/{*path}` instead of `*`
**Date**: 2026-06-07
**Area**: architecture
**What happened**: `app.get('*', handler)` throws `PathError: Missing parameter name at index 1` in Express 5.2. The `path-to-regexp` v8 dependency dropped bare `*` wildcard support.
**Takeaway**: In Express 5, use `app.get('/{*path}', handler)` for catch-all/SPA fallback routes. The old `*` syntax only works in Express 4.

---

## Root-level integration tests need their own vitest config
**Date**: 2026-06-07
**Area**: testing
**What happened**: When adding integration tests at the monorepo root, vitest picked up workspace test files unless excluded. The workspace configs each have their own `vitest.config.ts`.
**Takeaway**: Create a dedicated `vitest.config.ts` at monorepo root with `include: ['tests/**/*.test.ts']` to scope root tests. Wire into `npm test` via `npx vitest run --config vitest.config.ts`. Keep workspace-specific vitest configs in their own directories.

---

## Reviewer iteration: fix and re-run both reviewers in parallel
**Date**: 2026-06-07
**Area**: workflow
**What happened**: The verify loop ran 4 times — each time both reviewers found issues. Fixing only one reviewer's findings caused a re-run that typically failed the other.
**Takeaway**: When both acceptance-reviewer and code-reviewer fail, fix ALL issues from BOTH reports before committing and re-running. Running both in parallel saves a round-trip.

---

## Testing spawned server processes requires port cleanup
**Date**: 2026-06-07
**Area**: testing
**What happened**: Integration tests that start real servers (Vite, Express) left zombie processes on test ports after timeouts or crashes. Subsequent test runs failed with "port already in use".
**Takeaway**: Kill orphaned processes at the start of `beforeAll` (e.g., `spawn('pkill', ['-f', 'pattern'])`). Use unique ports for each test suite. Set generous timeouts (Vite cold-start can take 30-60s).

---

## CSS source text tests as a pragmatic alternative to browser rendering tests
**Date**: 2026-06-07
**Area**: testing
**What happened**: Acceptance criteria required verifying responsive behavior (44px touch targets, overflow-x hidden) but no browser testing framework was available.
**Takeaway**: When acceptance criteria require visual/CSS properties, test by reading the CSS source file and asserting expected rules exist via string/RegExp matching. This validates intent when computed-style testing isn't feasible.
