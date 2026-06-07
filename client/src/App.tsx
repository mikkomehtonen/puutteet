import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { Item, CreateItemInput } from './types';
import { fetchItems, createItem, toggleChecked, deleteItem } from './api';
import './App.css';

function errToMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const pendingToggleIds = useRef(new Set<number>());

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((err) => setError(errToMsg(err, 'Failed to load items')));
  }, []);

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
      setItems((prev) => [item, ...prev]);
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

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Shopping List</h1>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form className="add-form" onSubmit={handleSubmit}>
        <div className="add-row">
          <input
            className="add-input"
            type="text"
            placeholder="Add item…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            aria-label="Item name"
          />
          <button className="add-btn" type="submit" disabled={!canSubmit} aria-label="Add item">
            {submitting ? 'Adding…' : 'Add'}
          </button>
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
              <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
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
}: {
  item: Item;
  onToggle: (item: Item) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
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
      <button
        className="delete-btn"
        onClick={() => onDelete(item.id)}
        aria-label={`Delete ${item.name}`}
      >
        ×
      </button>
    </li>
  );
}

export default App;
