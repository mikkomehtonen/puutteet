import { useState, useEffect, useRef, useCallback, useMemo, type FormEvent } from 'react';
import type { Item, CreateItemInput, WsMessage } from './types';
import { fetchItems, createItem, toggleChecked, deleteItem, updateItem as apiUpdateItem } from './api';
import { useWebSocket } from './useWebSocket';
import './App.css';

function errToMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// Shared dedup logic: if an item with the same id exists, replace it; otherwise prepend.
// This handles the case where a WS broadcast arrives before the HTTP response
// (or vice versa) — the second arrival replaces rather than duplicates.
function upsertItem(items: Item[], incoming: Item): Item[] {
  const exists = items.some((i) => i.id === incoming.id);
  if (exists) {
    return items.map((i) => (i.id === incoming.id ? incoming : i));
  }
  return [incoming, ...items];
}

/**
 * Generate autocomplete suggestions from existing items.
 * Returns up to 5 unique names that start with the query (case-insensitive),
 * excluding exact matches. Results are sorted alphabetically.
 */
export function getSuggestions(items: Item[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lowerQuery = trimmed.toLowerCase();

  // Collect unique names (case-insensitive dedup, first-encountered casing wins)
  const seen = new Set<string>();
  const uniqueNames: string[] = [];
  for (const item of items) {
    const lower = item.name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueNames.push(item.name);
    }
  }

  // Filter by prefix match, exclude exact matches
  const matches = uniqueNames.filter((name) => {
    const lower = name.toLowerCase();
    // Must start with the query
    if (!lower.startsWith(lowerQuery)) return false;
    // Exclude exact match (case-insensitive)
    if (lower === lowerQuery) return false;
    return true;
  });

  // Sort alphabetically (case-insensitive), limit to 5
  return matches
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .slice(0, 5);
}

/**
 * Renders a dropdown list of autocomplete suggestions.
 * Each suggestion is a button with the matching prefix bolded.
 */
function SuggestionList({
  suggestions,
  activeIndex,
  onSelect,
  query,
}: {
  suggestions: string[];
  activeIndex: number;
  onSelect: (name: string) => void;
  query: string;
}) {
  const lowerQuery = query.toLowerCase();

  return (
    <ul className="suggestions-dropdown" role="listbox">
      {suggestions.map((suggestion, index) => {
        const matchLen = lowerQuery.length;
        const prefix = suggestion.slice(0, matchLen);
        const rest = suggestion.slice(matchLen);
        const isActive = index === activeIndex;

        return (
          <li
            key={suggestion}
            className={`suggestion-item${isActive ? ' suggestion-item--active' : ''}`}
            role="option"
            aria-selected={isActive}
          >
            <button
              type="button"
              className="suggestion-button"
              onClick={() => onSelect(suggestion)}
            >
              {prefix && <span className="suggestion-match">{prefix}</span>}
              {rest}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const submittingRef = useRef(false);
  const pendingToggleIds = useRef(new Set<number>());
  const addFormRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Derive suggestions from items and current name input
  const suggestions = useMemo(
    () => getSuggestions(items, name),
    [items, name],
  );

  const loadItems = useCallback(async () => {
    try {
      const data = await fetchItems();
      setItems(data);
    } catch (err) {
      setError(errToMsg(err, 'Failed to load items'));
    }
  }, []);

  // Handle incoming WebSocket messages — reconcile state directly.
  // Uses functional updates so every message is processed regardless of render timing.
  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'item_created' || msg.type === 'item_updated') {
      setItems((prev) => upsertItem(prev, msg.item));
    } else if (msg.type === 'item_deleted') {
      setItems((prev) => prev.filter((i) => i.id !== msg.id));
    }
  }, []);

  const { connected } = useWebSocket(loadItems, handleWsMessage);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!suggestionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (addFormRef.current && !addFormRef.current.contains(e.target as Node)) {
        closeSuggestions();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [suggestionsOpen]);

  const activeItems = items.filter((i) => !i.checked);
  const purchasedItems = items.filter((i) => i.checked);

  const submitNewItem = async () => {
    const trimmed = name.trim();
    if (!trimmed || submittingRef.current) return;
    setError(null);
    setSubmitting(true);
    submittingRef.current = true;
    const input: CreateItemInput = { name: trimmed };
    if (quantity.trim()) input.quantity = quantity.trim();
    if (note.trim()) input.note = note.trim();
    try {
      const item = await createItem(input);
      // Use dedup to handle the case where the WS broadcast arrives before the HTTP response
      setItems((prev) => upsertItem(prev, item));
      setName('');
      setQuantity('');
      setNote('');
    } catch (err) {
      setError(errToMsg(err, 'Failed to add item'));
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitNewItem();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitNewItem();
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestionsOpen && suggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && suggestionsOpen && suggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // If a suggestion is highlighted, select it instead of submitting
      if (suggestionsOpen && activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        setName(suggestions[activeSuggestionIndex]);
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
        return;
      }
      submitNewItem();
    }
    if (e.key === 'Escape' && suggestionsOpen) {
      e.preventDefault();
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const handleSelectSuggestion = (selectedName: string) => {
    setName(selectedName);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    // Refocus name input so user can immediately press Enter to submit
    nameInputRef.current?.focus();
  };

  const closeSuggestions = () => {
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  };

  // Defer blur close so click on suggestion buttons can fire first
  const handleNameBlur = () => {
    setTimeout(() => {
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }, 0);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value.trim()) {
      const matching = getSuggestions(items, value);
      setSuggestionsOpen(matching.length > 0);
    } else {
      setSuggestionsOpen(false);
    }
    setActiveSuggestionIndex(-1);
  };

  const handleToggle = async (item: Item) => {
    if (pendingToggleIds.current.has(item.id)) return;
    setError(null);
    pendingToggleIds.current.add(item.id);
    try {
      const updated = await toggleChecked(item.id, !item.checked);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (err) {
      setError(errToMsg(err, 'Failed to update item'));
    } finally {
      pendingToggleIds.current.delete(item.id);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await deleteItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errToMsg(err, 'Failed to delete item'));
    }
  };

  const handleUpdate = async (item: Item, input: { name: string; quantity: string; note: string }) => {
    setError(null);
    try {
      const updated = await apiUpdateItem(item.id, input);
      setItems((prev) => upsertItem(prev, updated));
    } catch (err) {
      setError(errToMsg(err, 'Failed to update item'));
      throw err;
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Shopping List</h1>
        <span
          className={`sync-dot ${connected ? 'sync-dot--connected' : 'sync-dot--disconnected'}`}
          aria-label={connected ? 'Connected' : 'Disconnected'}
        />
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form className="add-form" onSubmit={handleSubmit}>
        <div className="add-row" ref={addFormRef}>
          <input
            ref={nameInputRef}
            className="add-input"
            type="text"
            placeholder="Add item…"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameBlur}
            autoFocus
            aria-label="Item name"
          />
          <button className="add-btn" type="submit" disabled={!canSubmit} aria-label="Add item">
            {submitting ? 'Adding…' : 'Add'}
          </button>
          {suggestionsOpen && suggestions.length > 0 && (
            <SuggestionList
              suggestions={suggestions}
              activeIndex={activeSuggestionIndex}
              onSelect={handleSelectSuggestion}
              query={name.trim()}
            />
          )}
        </div>
        <div className="add-details">
          <input
            className="detail-input"
            type="text"
            placeholder="Quantity (optional)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="Quantity"
          />
          <input
            className="detail-input"
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="Note"
          />
        </div>
      </form>

      <section className="list-section" aria-label="Active items">
        <h2 className="section-heading">Active</h2>
        {activeItems.length === 0 ? (
          <p className="empty-state">Nothing to buy yet — add something above.</p>
        ) : (
          <ul className="item-list">
            {activeItems.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} onUpdate={handleUpdate} />
            ))}
          </ul>
        )}
      </section>

      {purchasedItems.length > 0 && (
        <section className="list-section" aria-label="Purchased items">
          <button
            className="section-heading section-heading-btn"
            onClick={() => setPurchasedOpen((p) => !p)}
            aria-expanded={purchasedOpen}
            aria-controls="purchased-list"
          >
            <span>Purchased ({purchasedItems.length})</span>
            <span className={`chevron ${purchasedOpen ? 'chevron-up' : ''}`} aria-hidden="true">
              ▸
            </span>
          </button>
          {purchasedOpen && (
            <ul id="purchased-list" className="item-list purchased-list">
              {purchasedItems.map((item) => (
                <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onDelete,
  onUpdate,
}: {
  item: Item;
  onToggle: (item: Item) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onUpdate?: (item: Item, input: { name: string; quantity: string; note: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQuantity, setEditQuantity] = useState(item.quantity);
  const [editNote, setEditNote] = useState(item.note);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  // Sync edit form when the item changes via WebSocket, but not while actively editing
  useEffect(() => {
    if (editing) return;
    setEditName(item.name);
    setEditQuantity(item.quantity);
    setEditNote(item.note);
  }, [item.name, item.quantity, item.note, editing]);

  const startEdit = () => {
    setEditName(item.name);
    setEditQuantity(item.quantity);
    setEditNote(item.note);
    setEditing(true);
    // Auto-focus name input
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaving(false);
  };

  const saveEdit = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName || savingRef.current) return;
    setSaving(true);
    savingRef.current = true;
    try {
      await onUpdate?.(item, {
        name: trimmedName,
        quantity: editQuantity.trim(),
        note: editNote.trim(),
      });
      setEditing(false);
    } catch {
      // Error already handled by onUpdate (shows error banner)
      // Keep edit mode open so user can retry
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const canSave = editName.trim().length > 0 && !savingRef.current;

  // Edit mode
  if (editing) {
    return (
      <li className="item-row">
        <div className="edit-form">
          <input
            ref={nameInputRef}
            className="edit-input edit-input--name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleEditKeyDown}
            aria-label="Edit item name"
          />
          <div className="edit-details">
            <input
              className="edit-input"
              type="text"
              placeholder="Quantity"
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="Edit quantity"
            />
            <input
              className="edit-input"
              type="text"
              placeholder="Note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="Edit note"
            />
          </div>
          <div className="edit-actions">
            <button
              className="save-btn"
              onClick={saveEdit}
              disabled={!canSave}
              aria-label="Save changes"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="cancel-btn"
              onClick={cancelEdit}
              disabled={saving}
              aria-label="Cancel editing"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  // Display mode
  return (
    <li className={`item-row ${item.checked ? 'item-checked' : ''}`}>
      <button
        className="check-btn"
        onClick={() => onToggle(item)}
        aria-label={item.checked ? 'Mark as not purchased' : 'Mark as purchased'}
      >
        <span className={`check-box ${item.checked ? 'check-box-done' : ''}`} aria-hidden="true">
          {item.checked ? '✓' : ''}
        </span>
      </button>
      <div className="item-content">
        <span className="item-name">{item.name}</span>
        {(item.quantity || item.note) && (
          <span className="item-meta">
            {item.quantity && <span className="item-qty">{item.quantity}</span>}
            {item.quantity && item.note && <span className="meta-sep">·</span>}
            {item.note && <span className="item-note">{item.note}</span>}
          </span>
        )}
      </div>
      <div className="item-actions">
        {!item.checked && (
          <button
            className="edit-btn"
            onClick={startEdit}
            aria-label={`Edit ${item.name}`}
          >
            ✎
          </button>
        )}
        <button
          className="delete-btn"
          onClick={() => onDelete(item.id)}
          aria-label={`Delete ${item.name}`}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export default App;
