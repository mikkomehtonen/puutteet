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

---

## Docker test setup must be scoped inside describe blocks that require it
**Date**: 2026-06-07
**Area**: testing
**What happened**: A top-level `beforeAll` that built a Docker image ran before `.dockerignore` content tests (Task 1), causing false failures when `docker build` failed. Non-Docker tests in the same file were needlessly coupled to Docker infrastructure.
**Takeaway**: When mixing Docker-dependent and Docker-independent tests in the same file, wrap the Docker image build/cleanup setup inside a parent `describe.skipIf(!dockerAvailable)()` block. Tests that don't need Docker (e.g., file-content assertions) stay at the top level outside that block. Use `describe.skipIf` to gate all container/inspect/run operations so the suite gracefully degrades when Docker is not installed.

---

## WebSocket sync useEffect must skip when component is in edit mode
**Date**: 2026-06-07
**Area**: architecture
**What happened**: ItemRow's `useEffect` synced local edit form state from props whenever `item.name/quantity/note` changed. A WebSocket `item_updated` message for the same item silently overwrote the user's in-progress edits, causing data loss.
**Takeaway**: In `ItemRow`, the sync `useEffect` must check `if (editing) return` and include `editing` in the dependency array. This prevents external state changes (WS broadcast from another client) from overwriting local edits. The `editing` ref/state must be part of the effect's dependency list.

---

## Async form submission needs a ref guard, not just state
**Date**: 2026-06-07
**Area**: architecture
**What happened**: The edit form's `saveEdit` used `saving` (React state) as a guard against double-submits. Because state updates are asynchronous, rapid double-clicks or double-Enter could bypass the guard and fire two PATCH requests. The add-item flow already used `submittingRef` for this pattern.
**Takeaway**: Use a `useRef` guard (e.g., `savingRef.current`) alongside state for async form operations. The ref provides synchronous truth — `if (savingRef.current) return` blocks immediately. Mirror the add-item pattern: `submittingRef` for create, `savingRef` for edit.

---

## Blur fires before click on dropdown items — defer blur close
**Date**: 2026-06-07
**Area**: architecture
**What happened**: When a user clicks a suggestion button inside a dropdown, the `onBlur` event on the name input fires before the click event. The blur handler closes the dropdown and unmounts the suggestion buttons, so the click never reaches the button's `onClick` handler. Additionally, focus moves to the button then to `<body>` when it unmounts.
**Takeaway**: Defer the blur handler with `setTimeout(() => closeDropdown(), 0)` so the click event fires first. Also use a `useRef` on the name input and explicitly `focus()` it after selection so the input retains focus. This pattern applies to any dropdown/popover where items are clickable and the trigger is an input that blurs on click.

---

## Tests with `if (existsSync(...))` guards silently pass when files are missing
**Date**: 2026-06-10
**Area**: testing
**What happened**: AC3/AC4 integration tests wrapped dist-file assertions in `if (existsSync(...))` guards. When the build output was missing, the tests silently passed — zero assertions ran — giving false confidence that the build pipeline was working.
**Takeaway**: When verifying build output or file artifacts, assert directly with `expect(existsSync(path)).toBe(true)`. Never use an `if` guard that skips assertions when the precondition fails. If the test requires a build, run it in a `beforeAll` within the same `describe` block so the dependency is explicit.

---

## jsdom doesn't serialize oklch() colors in computed styles
**Date**: 2026-06-07
**Area**: testing
**What happened**: CSS uses `oklch()` color values for the suggestion dropdown background. When testing with `window.getComputedStyle(element).backgroundColor`, jsdom doesn't serialize `oklch` to a recognizable string — the assertion fails or returns an unexpected value.
**Takeaway**: When testing CSS that uses `oklch()` or other modern color functions, assert on the CSS class presence (`toHaveClass`) and on properties jsdom handles reliably (border, box-shadow, dimensions). Avoid asserting on computed color values that use modern color spaces.
