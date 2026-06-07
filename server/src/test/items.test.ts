import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getDb, closeDb } from '../db.js';
import itemsRouter from '../items.js';
import type { Item } from '../types.js';
import { unlinkSync, existsSync, mkdirSync } from 'node:fs';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', itemsRouter);
  return app;
}

describe('Items API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    // Fresh database for each test
    closeDb();
    const dbPath = process.env.DATABASE_PATH;
    if (dbPath && existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
      } catch {
        // Ignore if file was already deleted
      }
    }
  });

  afterAll(() => {
    closeDb();
  });

  // Task 2: Database initialization
  describe('Task 2 - Database', () => {
    it('should create database and return empty list', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should preserve data across restarts', async () => {
      // Create an item first
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Milk' })
        .set('Content-Type', 'application/json');
      expect(createRes.status).toBe(201);

      // Close and reopen database (same file)
      closeDb();
      app = createApp();

      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Milk');
    });
  });

  // Task 3: REST API endpoints
  describe('Task 3 - REST API', () => {
    it('POST /api/items - creates a new item', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Milk' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.name).toBe('Milk');
      expect(res.body.quantity).toBe('');
      expect(res.body.note).toBe('');
      expect(res.body.checked).toBe(0);
      expect(res.body.created_at).toBeTruthy();
      expect(res.body.updated_at).toBeTruthy();
      expect(res.body.checked_at).toBeNull();
    });

    it('POST /api/items - validates name with whitespace only', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: '  ', quantity: '2 liters' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('POST /api/items - validates quantity must be a string', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Test', quantity: 123 })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity');
    });

    it('POST /api/items - validates note must be a string', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Test', note: true })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Note');
    });

    it('POST /api/items - creates item with quantity and note', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Bread', quantity: '1 loaf', note: 'whole wheat' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Bread');
      expect(res.body.quantity).toBe('1 loaf');
      expect(res.body.note).toBe('whole wheat');
    });

    it('PATCH /api/items/:id - updates item fields', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;
      const originalUpdatedAt = createRes.body.updated_at;

      const updateRes = await request(app)
        .patch(`/api/items/${id}`)
        .send({ name: 'Sourdough Bread' })
        .set('Content-Type', 'application/json');
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Sourdough Bread');
      expect(new Date(updateRes.body.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('PATCH /api/items/:id - rejects empty update body', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');

      const res = await request(app)
        .patch(`/api/items/${createRes.body.id}`)
        .send({})
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('PATCH /api/items/:id - returns 404 for missing item', async () => {
      const res = await request(app)
        .patch('/api/items/9999')
        .send({ name: 'X' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(404);
    });

    // Task 1: reject edits on purchased items
    it('PATCH /api/items/:id - returns 403 for checked (purchased) item', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;

      // Mark as purchased
      await request(app)
        .patch(`/api/items/${id}/checked`)
        .send({ checked: true })
        .set('Content-Type', 'application/json');

      // Try to edit the purchased item
      const res = await request(app)
        .patch(`/api/items/${id}`)
        .send({ name: 'New Name' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Cannot edit a purchased item');
    });

    it('PATCH /api/items/:id - 403 does not modify the item', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;

      // Mark as purchased
      await request(app)
        .patch(`/api/items/${id}/checked`)
        .send({ checked: true })
        .set('Content-Type', 'application/json');

      // Try to edit
      await request(app)
        .patch(`/api/items/${id}`)
        .send({ name: 'New Name' })
        .set('Content-Type', 'application/json');

      // Verify item is unchanged
      const getRes = await request(app).get('/api/items');
      const item = getRes.body.find((i: Item) => i.id === id);
      expect(item.name).toBe('Bread');
    });

    it('PATCH /api/items/:id - 404 takes precedence over 403 for non-existent items', async () => {
      const res = await request(app)
        .patch('/api/items/9999')
        .send({ name: 'X' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(404);
    });

    it('PATCH /api/items/:id/checked - returns 400 for non-boolean checked', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Apples' })
        .set('Content-Type', 'application/json');

      const res = await request(app)
        .patch(`/api/items/${createRes.body.id}/checked`)
        .send({ checked: 'yes' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('PATCH /api/items/:id/checked - returns 404 for non-existent item', async () => {
      const res = await request(app)
        .patch('/api/items/9999/checked')
        .send({ checked: true })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(404);
    });

    it('PATCH /api/items/:id/checked - marks item as purchased', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Apples' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;
      const originalUpdatedAt = createRes.body.updated_at;

      const checkRes = await request(app)
        .patch(`/api/items/${id}/checked`)
        .send({ checked: true })
        .set('Content-Type', 'application/json');
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.checked).toBe(1);
      expect(checkRes.body.checked_at).toBeTruthy();
      expect(new Date(checkRes.body.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('PATCH /api/items/:id/checked - restores item to active', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Apples' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;

      await request(app)
        .patch(`/api/items/${id}/checked`)
        .send({ checked: true })
        .set('Content-Type', 'application/json');

      const uncheckRes = await request(app)
        .patch(`/api/items/${id}/checked`)
        .send({ checked: false })
        .set('Content-Type', 'application/json');
      expect(uncheckRes.status).toBe(200);
      expect(uncheckRes.body.checked).toBe(0);
      expect(uncheckRes.body.checked_at).toBeNull();
    });

    it('DELETE /api/items/:id - deletes an item', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Butter' })
        .set('Content-Type', 'application/json');
      const id = createRes.body.id;

      const deleteRes = await request(app).delete(`/api/items/${id}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await request(app).get('/api/items');
      expect(getRes.body.find((i: Item) => i.id === id)).toBeUndefined();
    });

    it('DELETE /api/items/:id - returns 404 for missing item', async () => {
      const res = await request(app).delete('/api/items/9999');
      expect(res.status).toBe(404);
    });

    it('PATCH /api/items/1abc - returns 400 (no partial match)', async () => {
      const res = await request(app)
        .patch('/api/items/1abc')
        .send({ name: 'X' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
    });

    it('DELETE /api/items/1abc - returns 400 (no partial match)', async () => {
      const res = await request(app).delete('/api/items/1abc');
      expect(res.status).toBe(400);
    });

    it('DELETE /api/items/non-numeric - returns 400', async () => {
      const res = await request(app).delete('/api/items/abc');
      expect(res.status).toBe(400);
    });

    it('PATCH /api/items/:id - validates quantity must be a string', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');

      const res = await request(app)
        .patch(`/api/items/${createRes.body.id}`)
        .send({ quantity: 123 })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Quantity');
    });

    it('PATCH /api/items/:id - validates note must be a string', async () => {
      const createRes = await request(app)
        .post('/api/items')
        .send({ name: 'Bread' })
        .set('Content-Type', 'application/json');

      const res = await request(app)
        .patch(`/api/items/${createRes.body.id}`)
        .send({ note: false })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Note');
    });

    it('PATCH /api/items/:id - returns 400 for non-numeric id', async () => {
      const res = await request(app)
        .patch('/api/items/abc')
        .send({ name: 'X' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
    });

    it('GET /api/items - returns active items first, then purchased', async () => {
      const cRes = await request(app)
        .post('/api/items')
        .send({ name: 'Item C' })
        .set('Content-Type', 'application/json');
      const bRes = await request(app)
        .post('/api/items')
        .send({ name: 'Item B' })
        .set('Content-Type', 'application/json');
      await request(app)
        .post('/api/items')
        .send({ name: 'Item A' })
        .set('Content-Type', 'application/json');

      // Purchase item B
      await request(app)
        .patch(`/api/items/${bRes.body.id}/checked`)
        .send({ checked: true })
        .set('Content-Type', 'application/json');

      const res = await request(app).get('/api/items');
      expect(res.body).toHaveLength(3);

      // Item A (newest active), Item C (older active), Item B (purchased)
      expect(res.body[0].name).toBe('Item A');
      expect(res.body[0].checked).toBe(0);
      expect(res.body[1].name).toBe('Item C');
      expect(res.body[1].checked).toBe(0);
      expect(res.body[2].name).toBe('Item B');
      expect(res.body[2].checked).toBe(1);
    });
  });
});
