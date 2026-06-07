import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { WsMessage } from './types.js';

let wss: WebSocketServer | undefined;

export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.info(`WebSocket client connected (total: ${wss!.clients.size})`);

    ws.on('close', () => {
      console.info(`WebSocket client disconnected (total: ${wss!.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });
}

export function broadcast(message: WsMessage): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
