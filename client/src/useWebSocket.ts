import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage } from './types';

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const BACKOFF_MULTIPLIER = 2;

/** Runtime type guard for WsMessage — validates the shape of an incoming message. */
function isValidWsMessage(data: unknown): data is WsMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  if (msg.type === 'item_created' || msg.type === 'item_updated') {
    const item = msg.item as Record<string, unknown> | undefined;
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'number' &&
      typeof item.name === 'string' &&
      typeof item.checked === 'number'
    );
  }
  if (msg.type === 'item_deleted') {
    return typeof msg.id === 'number';
  }
  return false;
}

export function useWebSocket(
  fetchItems: () => Promise<void>,
  onMessage?: (msg: WsMessage) => void,
): {
  connected: boolean;
} {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const delayRef = useRef(INITIAL_DELAY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const fetchRef = useRef(fetchItems);
  fetchRef.current = fetchItems;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      delayRef.current = INITIAL_DELAY;
      // Re-fetch items on reconnect to ensure consistency
      fetchRef.current().catch((err: unknown) => {
        console.error('Re-fetch after reconnect failed:', err);
      });
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (!isValidWsMessage(parsed)) return;
        // Call the consumer's handler synchronously for every message.
        // This ensures no messages are dropped, regardless of render timing.
        onMessageRef.current?.(parsed);
      } catch {
        // Ignore malformed JSON
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      // Schedule reconnect with exponential backoff
      timerRef.current = setTimeout(() => {
        connect();
      }, delayRef.current);
      delayRef.current = Math.min(delayRef.current * BACKOFF_MULTIPLIER, MAX_DELAY);
    };

    ws.onerror = () => {
      // The onclose handler will fire after this, triggering reconnect
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // connect is intentionally stable — fetchItems/onMessage accessed via ref

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}
