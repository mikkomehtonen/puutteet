import { Router, type Request, type Response } from 'express';
import { getDb } from './db.js';
import type { Item, CreateItemInput, UpdateItemInput, CheckedInput } from './types.js';

const router = Router();

function parseItemId(raw: string | string[]): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

// GET /api/items — returns all items, active first (newest first), then purchased (most recently purchased first)
router.get('/items', (_req: Request, res: Response) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM items
    ORDER BY
      CASE WHEN checked = 0 THEN 0 ELSE 1 END,
      CASE WHEN checked = 0 THEN created_at ELSE '' END DESC,
      CASE WHEN checked = 1 THEN checked_at ELSE '' END DESC
  `).all() as Item[];
  res.json(items);
});

// POST /api/items — creates a new item
router.post('/items', (req: Request, res: Response) => {
  const body = req.body as CreateItemInput;

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required and must be a non-empty string' });
    return;
  }

  const now = new Date().toISOString();

  if (body.quantity !== undefined && typeof body.quantity !== 'string') {
    res.status(400).json({ error: 'Quantity must be a string' });
    return;
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    res.status(400).json({ error: 'Note must be a string' });
    return;
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO items (name, quantity, note, checked, created_at, updated_at, checked_at)
    VALUES (?, ?, ?, 0, ?, ?, NULL)
  `);

  const result = stmt.run(
    body.name.trim(),
    body.quantity || '',
    body.note || '',
    now,
    now,
  );
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;
  res.status(201).json(item);
});

// PATCH /api/items/:id — updates item fields
router.patch('/items/:id', (req: Request, res: Response) => {
  const id = parseItemId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const body = req.body as UpdateItemInput;
  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      res.status(400).json({ error: 'Name must be a non-empty string' });
      return;
    }
    fields.push('name = ?');
    values.push(body.name.trim());
  }

  if (body.quantity !== undefined) {
    if (typeof body.quantity !== 'string') {
      res.status(400).json({ error: 'Quantity must be a string' });
      return;
    }
    fields.push('quantity = ?');
    values.push(body.quantity);
  }

  if (body.note !== undefined) {
    if (typeof body.note !== 'string') {
      res.status(400).json({ error: 'Note must be a string' });
      return;
    }
    fields.push('note = ?');
    values.push(body.note);
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'At least one field must be provided' });
    return;
  }

  const now = new Date().toISOString();
  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  const db = getDb();
  const stmt = db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
  res.json(item);
});

// PATCH /api/items/:id/checked — toggles purchased status
router.patch('/items/:id/checked', (req: Request, res: Response) => {
  const id = parseItemId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const body = req.body as CheckedInput;
  if (typeof body.checked !== 'boolean') {
    res.status(400).json({ error: 'Checked must be a boolean' });
    return;
  }

  const now = new Date().toISOString();
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE items
    SET checked = ?, checked_at = ?, updated_at = ?
    WHERE id = ?
  `);
  const result = stmt.run(body.checked ? 1 : 0, body.checked ? now : null, now, id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
  res.json(item);
});

// DELETE /api/items/:id — deletes an item
router.delete('/items/:id', (req: Request, res: Response) => {
  const id = parseItemId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const db = getDb();
  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  res.status(204).send();
});

export default router;
