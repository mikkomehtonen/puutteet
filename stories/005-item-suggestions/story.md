# Item Name Suggestions on Add

## Context

When adding items to the shopping list, users often re-add the same items week after week (e.g., milk, bread, eggs). Currently they must type the full name every time. This story adds autocomplete suggestions to the "Add item…" input: as the user types, a dropdown appears showing previously used item names that match the typed prefix, case-insensitively. Selecting a suggestion fills the name input, saving keystrokes and reducing typos.

## Out of Scope

- Suggesting quantity or note values from previous items — only the name is suggested.
- A dedicated server-side suggestions/search endpoint — suggestions are derived client-side from the already-loaded items list.
- Persisting a separate "suggestions dictionary" or item history beyond what currently exists in the items table.
- Fuzzy matching (e.g., Levenshtein) — only prefix matching is required.
- Suggestions in the edit form — only the add form.

## Implementation approach

### Client-side only: derive suggestions from loaded items

The client already loads all items via `fetchItems()` and keeps them in `items` state. Suggestions are computed purely client-side by extracting unique `name` values from the items array, filtering by case-insensitive prefix match against the current input, and limiting to 5 results. No new API endpoint is needed.

### Suggestion logic: `getSuggestions` function

A pure function `getSuggestions(items: Item[], query: string): string[]` is added to `App.tsx` (or a separate utility file). Rules:

1. If `query` is empty or only whitespace, return `[]` (no suggestions for blank input).
2. Collect unique `name` values from all items (both active and purchased). Deduplication is by case-insensitive comparison: if "Milk" and "milk" both exist, only one entry appears. The first-encountered casing wins (since items are ordered newest-first, this means the most recently used casing).
3. Filter names where `name.toLowerCase().startsWith(query.trim().toLowerCase())`.
4. Exclude exact matches: if the trimmed query exactly matches a name (case-insensitive), that name is excluded — the user has already fully typed it, so suggesting it adds no value.
5. Sort matches alphabetically (case-insensitive) for stable ordering.
6. Return at most 5 results.

### Suggestion dropdown component

A `SuggestionList` component renders the dropdown below the name input. It receives `suggestions: string[]`, `activeIndex: number` (for keyboard highlight), `onSelect: (name: string) => void`, and `query: string` (for highlighting the matching prefix in each suggestion).

The dropdown is positioned absolutely below the add-row, matching the input width. Each suggestion is a `<button>` element for accessibility, with:
- The matching prefix portion bolded.
- `role="option"` and `aria-selected` for the highlighted item.
- The list container has `role="listbox"`.

### Keyboard interaction in the name input

The existing `handleInputKeyDown` for Enter submission is extended:

- **ArrowDown**: If suggestions are visible, move highlight down (wrapping from last to first). Prevent default to keep cursor in input.
- **ArrowUp**: If suggestions are visible, move highlight up (wrapping from first to last). Prevent default.
- **Enter**: If a suggestion is highlighted, fill the input with that suggestion and close the dropdown (do NOT submit the form). If no suggestion is highlighted, submit the form as before.
- **Escape**: If suggestions are visible, close the dropdown and reset highlight index.

### Click/tap interaction

- Clicking/tapping a suggestion fills the name input and closes the dropdown. The input retains focus so the user can immediately press Enter to submit or continue editing.
- Clicking outside the suggestion dropdown closes it.

### State management

Three new pieces of state in the `App` component:
- `suggestionsOpen: boolean` — whether the dropdown is visible.
- `activeSuggestionIndex: number` — which suggestion is highlighted (-1 = none).

The `suggestions` array itself is derived via `useMemo` from `items` and `name` input, using the `getSuggestions` function. This avoids unnecessary recalculations.

When the name input changes, `suggestionsOpen` is set to `true` if there are matching suggestions, and `activeSuggestionIndex` is reset to -1. When a suggestion is selected or Escape is pressed, `suggestionsOpen` is set to `false`.

### CSS for suggestion dropdown

New styles in `App.css`:
- `.suggestions-container` — relative positioning wrapper around the add form area (or the input row) so the dropdown is positioned relative to it.
- `.suggestions-dropdown` — absolute positioned below the input, full width of the input, z-index above content, with border, border-radius, background, and box-shadow matching the app's design language.
- `.suggestion-item` — each suggestion button, with padding, hover/active states, and focus-visible outline.
- `.suggestion-item--active` — highlighted suggestion (keyboard navigation), with accent background.
- `.suggestion-match` — bold styling for the matching prefix portion of the suggestion text.

## Tasks

### Task 1 - Client: getSuggestions utility function

- Items list contains `[{ name: "Milk" }, { name: "Bread" }, { name: "Eggs" }]` + query `"mi"`
  - → Returns `["Milk"]`
- Items list contains `[{ name: "Milk" }, { name: "milk" }]` (different casing) + query `"mi"`
  - → Returns `["Milk"]` (first-encountered casing wins, deduped)
- Items list contains `[{ name: "Milk" }, { name: "Bread" }]` + query `"MIL"`
  - → Returns `["Milk"]` (case-insensitive prefix match)
- Items list contains `[{ name: "Milk" }]` + query `"Milk"` (exact match, case-insensitive)
  - → Returns `[]` (exact match excluded — user already typed the full name)
- Items list contains `[{ name: "Milk" }]` + query `"Milk "` (trailing space, not exact match)
  - → Returns `[]` (no prefix match for "Milk " in "Milk")
- Items list contains `[{ name: "Milk" }, { name: "Bread" }, { name: "Eggs" }]` + query `""`
  - → Returns `[]` (empty query yields no suggestions)
- Items list contains `[{ name: "Milk" }, { name: "Bread" }, { name: "Eggs" }]` + query `" "`
  - → Returns `[]` (whitespace-only query yields no suggestions)
- Items list with 7 names starting with "a" + query `"a"`
  - → Returns 5 items (limited to 5, alphabetically sorted)
- Items list contains `[{ name: "Apple" }, { name: "Banana" }]` + query `"z"`
  - → Returns `[]` (no matches)

### Task 2 - Client: SuggestionList component

- Suggestions `["Milk", "Mushrooms"]` + query `"mi"` + activeIndex 0
  - → Renders a listbox with two options
  - → First option shows "**Mi**lk" (bold prefix) and has `aria-selected="true"`
  - → Second option shows "**Mi**shrooms" and has `aria-selected="false"`
- Suggestions `["Milk"]` + query `"mi"` + activeIndex -1
  - → Renders a listbox with one option, none highlighted
- Empty suggestions array
  - → Nothing is rendered (dropdown hidden)

### Task 3 - Client: integrate suggestions into App component

- Items list contains `[{ name: "Milk" }]` + user types "mi" in name input
  - → Suggestion dropdown appears below the input showing "Milk"
- User types "mi" + suggestion dropdown visible + ArrowDown key
  - → First suggestion is highlighted
- User types "mi" + first suggestion highlighted + ArrowDown key
  - → Second suggestion is highlighted (if exists), or wraps to first
- User types "mi" + suggestion highlighted + ArrowUp key
  - → Previous suggestion is highlighted, or wraps to last
- User types "mi" + suggestion highlighted + Enter key
  - → Name input is filled with the highlighted suggestion text
  - → Suggestion dropdown closes
  - → Form is NOT submitted (user can review and then press Enter again)
- User types "mi" + no suggestion highlighted + Enter key
  - → Form submits as before with "mi" as the name
- User types "mi" + suggestion dropdown visible + Escape key
  - → Suggestion dropdown closes, input text remains unchanged
- User types "mi" + clicks on suggestion "Milk"
  - → Name input is filled with "Milk"
  - → Suggestion dropdown closes
  - → Input retains focus
- User types "Milk" (exact match) in name input
  - → No suggestion dropdown appears (exact match excluded)
- User clears the name input
  - → Suggestion dropdown closes
- User types "mi" + clicks outside the dropdown
  - → Suggestion dropdown closes

### Task 4 - Client: CSS for suggestion dropdown

- Suggestion dropdown is positioned directly below the add-row input
- Dropdown has a visible border, background, and subtle shadow matching the app's design language
- Hovered/active suggestion has accent background color
- Keyboard-highlighted suggestion has accent background color
- Suggestion items have sufficient padding for touch targets (minimum 44px height)
- Matching prefix text within suggestions is bolded
- Dropdown has `z-index` above other content
- Dropdown respects `prefers-reduced-motion` (no animations)

## Technical Context

- **React**: 19.2.7 — `useState`, `useMemo`, `useRef`, `useCallback` for state and memoization. No new dependencies.
- **Testing**: `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.1 for client tests. `vitest` 4.1.8.
- **No new npm packages** — the suggestion dropdown is built with plain React and CSS, no external autocomplete library.

## Notes

- Suggestions are derived from the current items list (both active and purchased). Deleted items are not suggested since they no longer exist in state. This is acceptable for a single-user shopping list — the user is most likely to re-add items they've recently used.
- The "exclude exact match" rule prevents the dropdown from showing when the user has already fully typed an existing item name. This avoids a distracting dropdown that offers no new information.
- The 5-item limit keeps the dropdown compact on mobile screens.
- After selecting a suggestion, the input retains focus so the user can immediately press Enter to submit, or edit the name further. This two-step flow (select → submit) prevents accidental double-adds.