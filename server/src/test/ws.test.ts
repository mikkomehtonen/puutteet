import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { initWebSocketServer, broadcast } from '../ws.js';
import itemsRouter from '../items.js';
import { getDb, closeDb } from '../db.js';
import { unlinkSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { WsMessage, Item } from '../types.js';

let wsTestDbPath: string;

beforeEach(() => {
  // Use a separate database path to avoid conflicts with other test files
  wsTestDbPath = path.join(import.meta.dirname, '../../../data/ws-test.db');
  const dir = path.dirname(wsTestDbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  process.env.DATABASE_PATH = wsTestDbPath;
});

function connectClient(port: number, path = '/ws'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function collectMessages(ws: WebSocket, count = 1, timeoutMs = 5000): Promise<WsMessage[]> {
  const messages: WsMessage[] = [];
  return new Promise((resolve) => {
    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()) as WsMessage);
      if (messages.length >= count) {
        resolve(messages);
      }
    });
    setTimeout(() => resolve(messages), timeoutMs);
  });
}

// Helper: create app with items router
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', itemsRouter);
  return app;
}

describe('WebSocket server module', () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    const app = createApp();
    server = createServer(app);
    initWebSocketServer(server);
    port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
  });

  afterEach(() => {
    closeDb();
    server.close();
    if (wsTestDbPath && existsSync(wsTestDbPath)) {
      try {
        unlinkSync(wsTestDbPath);
      } catch {
        // Ignore
      }
    }
  });

  it('should accept WebSocket connections on /ws', async () => {
    const ws = await connectClient(port);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should broadcast item_created message to connected clients', async () => {
    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const item: Item = {
      id: 1, name: 'Milk', quantity: '', note: '',
      checked: 0, created_at: '', updated_at: '', checked_at: null,
    };
    broadcast({ type: 'item_created', item });

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'item_created', item });
    ws.close();
  });

  it('should broadcast item_updated message to connected clients', async () => {
    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const item: Item = {
      id: 1, name: 'Oat Milk', quantity: '', note: '',
      checked: 0, created_at: '', updated_at: '', checked_at: null,
    };
    broadcast({ type: 'item_updated', item });

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'item_updated', item });
    ws.close();
  });

  it('should broadcast item_deleted message to connected clients', async () => {
    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    broadcast({ type: 'item_deleted', id: 1 });

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: 'item_deleted', id: 1 });
    ws.close();
  });

  it('should not crash when broadcasting with no connected clients', () => {
    expect(() => {
      broadcast({ type: 'item_deleted', id: 1 });
    }).not.toThrow();
  });

  it('should send messages to multiple clients', async () => {
    const ws1 = await connectClient(port);
    const ws2 = await connectClient(port);

    const msg1Promise = collectMessages(ws1);
    const msg2Promise = collectMessages(ws2);

    broadcast({ type: 'item_deleted', id: 42 });

    const [m1, m2] = await Promise.all([msg1Promise, msg2Promise]);
    expect(m1[0]).toEqual({ type: 'item_deleted', id: 42 });
    expect(m2[0]).toEqual({ type: 'item_deleted', id: 42 });

    ws1.close();
    ws2.close();
  });

  it('should not send to disconnected clients', async () => {
    const ws = await connectClient(port);
    ws.close();
    // Wait for close to propagate
    await new Promise((r) => setTimeout(r, 200));

    // Should not throw even though client disconnected
    expect(() => {
      broadcast({ type: 'item_deleted', id: 1 });
    }).not.toThrow();
  });
});

describe('Items API — WebSocket broadcasts', () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    // Fresh database
    closeDb();
    if (wsTestDbPath && existsSync(wsTestDbPath)) {
      try {
        unlinkSync(wsTestDbPath);
      } catch {
        // Ignore
      }
    }

    const app = createApp();
    server = createServer(app);
    initWebSocketServer(server);
    port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
  });

  afterEach(() => {
    closeDb();
    server.close();
    if (wsTestDbPath && existsSync(wsTestDbPath)) {
      try {
        unlinkSync(wsTestDbPath);
      } catch {
        // Ignore
      }
    }
  });

  it('POST /api/items broadcasts item_created to connected clients', async () => {
    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const res = await fetch(`http://localhost:${port}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Milk' }),
    });
    expect(res.status).toBe(201);
    const item = await res.json() as Item;

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('item_created');
    expect(messages[0]).toEqual({ type: 'item_created', item });
    ws.close();
  });

  it('PATCH /api/items/:id broadcasts item_updated', async () => {
    // Create item first
    const createRes = await fetch(`http://localhost:${port}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bread' }),
    });
    const created = await createRes.json() as Item;

    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const updateRes = await fetch(`http://localhost:${port}/api/items/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sourdough Bread' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json() as Item;

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('item_updated');
    expect(messages[0]).toEqual({ type: 'item_updated', item: updated });
    ws.close();
  });

  it('PATCH /api/items/:id/checked broadcasts item_updated', async () => {
    const createRes = await fetch(`http://localhost:${port}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Apples' }),
    });
    const created = await createRes.json() as Item;

    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const checkRes = await fetch(`http://localhost:${port}/api/items/${created.id}/checked`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: true }),
    });
    expect(checkRes.status).toBe(200);
    const checked = await checkRes.json() as Item;

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('item_updated');
    expect(messages[0]).toEqual({ type: 'item_updated', item: checked });
    ws.close();
  });

  it('DELETE /api/items/:id broadcasts item_deleted', async () => {
    const createRes = await fetch(`http://localhost:${port}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Butter' }),
    });
    const created = await createRes.json() as Item;

    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws);

    const deleteRes = await fetch(`http://localhost:${port}/api/items/${created.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(204);

    const messages = await messagesPromise;
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('item_deleted');
    expect(messages[0]).toEqual({ type: 'item_deleted', id: created.id });
    ws.close();
  });

  it('GET /api/items does not broadcast', async () => {
    const ws = await connectClient(port);
    const messagesPromise = collectMessages(ws, 1, 1500);

    const res = await fetch(`http://localhost:${port}/api/items`);
    expect(res.status).toBe(200);

    const messages = await messagesPromise;
    expect(messages).toHaveLength(0);
    ws.close();
  });
});
