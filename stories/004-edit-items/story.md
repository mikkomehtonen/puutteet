# Edit Non-Completed Items

## Context

The shopping list app currently allows adding, checking off, restoring, and deleting items — but there is no way to correct a typo or change the quantity/note after an item has been added. Users must delete and re-add the item, which loses the item's creation timestamp and is cumbersome on mobile. This story adds inline editing for active (non-checked) items only. Purchased items cannot be edited — the user should restore them first if they need changes.

## Out of Scope

- Editing purchased (checked) items — they must be restored to active first.
- Batch editing or reordering items.
- Changing the checked status through the edit form (use the existing checkbox toggle).
- Any new database columns or schema changes.

## Implementation approach

### Server-side: restrict PATCH to active items only

The existing `PATCH /api/items/:id` endpoint currently allows editing any item regardless of `checked` status. The handler is modified to first SELECT the item by ID. If the item is not found, return `404` (preserving existing behavior). If the item is found but `checked === 1`, return `403` with `{ error: "Cannot edit a purchased item" }`. Only then proceed with the UPDATE. This ordering (404 before 403) ensures that non-existent items always get 404, not 403. The restriction is server-enforced so that even direct API calls cannot bypass it.

### Client-side: updateItem API function

Add `updateItem(id: number, input: UpdateItemInput): Promise<Item>` to `api.ts`. It sends `PATCH /api/items/:id` with the partial update body. Add `UpdateItemInput` type to `types.ts` matching the server's `UpdateItemInput` (`name?: string; quantity?: string; note?: string`).

### Client-side: inline edit mode in ItemRow

The `ItemRow` component gains an edit mode that is only available for active items (`item.checked === 0`). The approach:

1. **Edit trigger**: A small "edit" icon button (pencil ✎) is rendered next to the delete button for active items only. It has a 44×44px touch target and an `aria-label` like "Edit {item name}".
2. **Edit mode**: Tapping the edit button switches the item row from display mode to edit mode. The name, quantity, and note fields become pre-filled text inputs. The name input auto-focuses. The checkbox and delete button are hidden during editing.
3. **Save**: A "Save" button (replacing the edit button) commits changes. It calls `updateItem` with only the fields that changed (or all three fields). On success, the item updates in local state via the existing `upsertItem` logic (the WS broadcast will also arrive). On error, the error banner shows the message and edit mode stays open.
4. **Cancel**: A "Cancel" button discards changes and returns to display mode.
5. **Keyboard**: Pressing Enter in the name input submits the form. Pressing Escape cancels.
6. **Concurrency**: While an edit is in flight, the Save button shows "Saving…" and is disabled. The Cancel button is also disabled during the in-flight request to prevent state confusion.

### CSS for edit mode

New styles added to `App.css`:
- `.edit-form` — flex column layout for the edit inputs, matching the add-form styling.
- `.edit-input` — styled like `.detail-input` for name, quantity, and note fields. The name field uses the larger `.add-input` height.
- `.edit-actions` — row of Save/Cancel buttons.
- `.edit-btn` — the pencil icon button, styled like `.delete-btn` but with a different color.
- `.save-btn` — primary action button, styled like `.add-btn` but smaller.
- `.cancel-btn` — secondary button, styled with border and text color.

### WebSocket

No changes needed. The existing `item_updated` WS message type is already handled by the client's `handleWsMessage` callback, which calls `upsertItem`. When the server broadcasts the updated item after a PATCH, the client state reconciles automatically.

## Tasks

### Task 1 - Server: reject edits on purchased items

- Existing checked item (`checked: 1`) + `PATCH /api/items/:id` with `{ "name": "New Name" }`
  - → Returns `403` with `{ error: "Cannot edit a purchased item" }`
  - → Item data is unchanged in the database
- Existing active item (`checked: 0`) + `PATCH /api/items/:id` with `{ "name": "New Name" }`
  - → Returns `200` with the updated item (existing behavior preserved)
- Non-existent item ID + `PATCH /api/items/9999` with `{ "name": "X" }`
  - → Returns `404` (existing behavior preserved)

### Task 2 - Client: add updateItem API function and UpdateItemInput type

- `UpdateItemInput` type is defined in `types.ts` with optional `name`, `quantity`, `note` string fields
- `updateItem(id, input)` function in `api.ts` sends `PATCH /api/items/:id` with JSON body and returns the updated `Item`
- Existing active item + call `updateItem(1, { name: "Sourdough" })`
  - → Returns the updated item with `name: "Sourdough"` and refreshed `updated_at`

### Task 3 - Client: edit button on active items

- Active item (`checked: 0`) rendered in list
  - → An "Edit" button with `aria-label="Edit {item name}"` is visible
  - → The edit button has a minimum 44×44px touch target
- Purchased item (`checked: 1`) rendered in list
  - → No edit button is rendered

### Task 4 - Client: inline edit mode

- Active item in display mode + tap edit button
  - → Item row switches to edit mode showing pre-filled inputs for name, quantity, and note
  - → Name input is auto-focused
  - → Checkbox and delete button are hidden
  - → Save and Cancel buttons appear
- Edit mode + modify name to "Sourdough Bread" + tap Save
  - → `updateItem` is called with the updated fields
  - → Item row returns to display mode showing "Sourdough Bread"
  - → Error banner is cleared
- Edit mode + modify name + press Enter in name input
  - → Same as tapping Save: `updateItem` is called, item updates
- Edit mode + tap Cancel
  - → Item row returns to display mode with original values
  - → No API call is made
- Edit mode + press Escape
  - → Same as Cancel: returns to display mode with original values
- Edit mode + clear name entirely + tap Save
  - → Save button is disabled (name must be non-empty)
  - → No API call is made
- Edit mode + Save while request is in flight
  - → Save button shows "Saving…" and is disabled
  - → Cancel button is disabled
- Edit mode + Save fails with server error
  - → Error banner displays the error message
  - → Edit mode stays open with current input values preserved

### Task 5 - Client: WebSocket reconciliation for edits

- Item is being edited locally + WS `item_updated` message arrives for a different item
  - → The other item updates in the list without disrupting the active edit
- Item edit is saved + WS `item_updated` arrives for the same item
  - → `upsertItem` reconciles the state (existing dedup logic handles this)

## Technical Context

- **Express**: 5.2.1 — PATCH route handler already exists; adding a `checked` guard before the update logic.
- **React**: 19.2.7 — `useState` for edit mode state in `ItemRow`. No new dependencies needed.
- **better-sqlite3**: 12.10.0 — synchronous query to check `checked` status before allowing PATCH.
- **WebSocket**: Existing `item_updated` broadcast in PATCH handler already sends the updated item to all connected clients. No WS changes needed.
- **Testing**: `@testing-library/react` 16.3.2 and `@testing-library/user-event` 14.6.1 for client tests. `supertest` 7.2.2 for server API tests.

## Notes

- The edit restriction is enforced server-side (403 for checked items) so that direct API calls also respect the business rule, not just the UI.
- Inline editing was chosen over a modal or separate page because it keeps the user in context — especially important on mobile where screen real estate is limited and context switching is costly.
- The edit form reuses the same validation rules as the add form: name must be non-empty after trim, quantity and note must be strings.
- Only active (unchecked) items show the edit button. If a user wants to edit a purchased item, they must first uncheck it to restore it to active, then edit it. This two-step process is intentional — it prevents accidental edits to items the user has already decided to purchase.