import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

let mockWsInstances: any[] = [];
let currentMockWs: any = null;

function createMockWebSocket() {
  mockWsInstances = [];
  currentMockWs = null;
  return vi.fn(function (this: any, url: string) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    currentMockWs = this;
    mockWsInstances.push(this);

    this._open = function () {
      this.readyState = 1;
      if (this.onopen) this.onopen(new Event('open'));
    };

    this._close = function () {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent('close'));
    };

    this._receive = function (data: string) {
      if (this.onmessage) this.onmessage(new MessageEvent('message', { data }));
    };

    this._error = function () {
      if (this.onerror) this.onerror(new Event('error'));
    };

    this.close = function () {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent('close'));
    };
  });
}

const originalWebSocket = globalThis.WebSocket;
let mockWebSocketCtor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWebSocketCtor = createMockWebSocket();
  globalThis.WebSocket = mockWebSocketCtor as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
});

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { protocol: 'http:', host: 'localhost:5173' },
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
  });
});

describe('useWebSocket', () => {
  it('connects to ws://localhost:5173/ws on mount', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    expect(mockWsInstances.length).toBe(1);
    expect(mockWsInstances[0].url).toBe('ws://localhost:5173/ws');
  });

  it('returns connected=true after open', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWebSocket(fetchItems));

    act(() => {
      currentMockWs._open();
    });

    expect(result.current.connected).toBe(true);
  });

  it('returns connected=false after close', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWebSocket(fetchItems));

    act(() => {
      currentMockWs._open();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      currentMockWs._close();
    });
    expect(result.current.connected).toBe(false);
  });

  it('calls onMessage for each received message', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(fetchItems, onMessage));

    act(() => {
      currentMockWs._open();
    });

    const msg1 = JSON.stringify({ type: 'item_created', item: { id: 1, name: 'Milk', checked: 0, quantity: '', note: '', created_at: '', updated_at: '', checked_at: null } });
    const msg2 = JSON.stringify({ type: 'item_created', item: { id: 2, name: 'Bread', checked: 0, quantity: '', note: '', created_at: '', updated_at: '', checked_at: null } });

    act(() => {
      currentMockWs._receive(msg1);
      currentMockWs._receive(msg2);
    });

    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it('calls fetchItems on open (re-fetch on connect)', () => {
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    act(() => {
      currentMockWs._open();
    });

    expect(fetchItems).toHaveBeenCalledTimes(1);
  });

  it('reconnects after close with exponential backoff', async () => {
    vi.useFakeTimers();
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    // Open first connection
    act(() => {
      currentMockWs._open();
    });
    expect(fetchItems).toHaveBeenCalledTimes(1);
    expect(mockWsInstances.length).toBe(1);

    // Close — should schedule reconnect after 1000ms (INITIAL_DELAY)
    act(() => {
      currentMockWs._close();
    });

    // Fast-forward 1000ms — should create new WebSocket
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockWsInstances.length).toBe(2);

    // Open second connection
    act(() => {
      currentMockWs._open();
    });
    expect(fetchItems).toHaveBeenCalledTimes(2); // Refetch on reconnect

    // Close again — backoff should be 2000ms now
    act(() => {
      currentMockWs._close();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockWsInstances.length).toBe(3);

    vi.useRealTimers();
  });

  it('backoff resets to 1s after successful reconnection', async () => {
    vi.useFakeTimers();
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    // Connect
    act(() => { currentMockWs._open(); });

    // Disconnect and reconnect (backoff grows to 2s)
    act(() => { currentMockWs._close(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockWsInstances.length).toBe(2);

    // Open — backoff resets
    act(() => { currentMockWs._open(); });

    // Disconnect again — backoff should be back to 1s, not 4s
    act(() => { currentMockWs._close(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mockWsInstances.length).toBe(3); // Reconnected after 1s, not 2s

    vi.useRealTimers();
  });

  it('backoff caps at 30s max delay', async () => {
    vi.useFakeTimers();
    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    // Simulate connection failures without opening (opening resets the delay).
    // Each error/close doubles the backoff without resetting.
    for (let i = 0; i < 5; i++) {
      // Each iteration: new WS was created by the previous timer.
      // Close it (without opening) to trigger another reconnect with doubled delay.
      act(() => { currentMockWs._close(); });
      const delay = 1000 * Math.pow(2, i);
      await act(async () => { vi.advanceTimersByTime(delay); });
    }

    // After 5 close-reconnect cycles, delay should be 32s (capped at 30s).
    // Instances: initial + 5 reconnects = 6
    expect(mockWsInstances.length).toBe(6);

    // Close again — next reconnect should be at 30s cap
    act(() => { currentMockWs._close(); });
    await act(async () => { vi.advanceTimersByTime(29999); });
    expect(mockWsInstances.length).toBe(6); // Not yet — 30s not elapsed
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(mockWsInstances.length).toBe(7); // Now reconnected after 30s

    // Next reconnect should also be 30s (cap stays)
    act(() => { currentMockWs._close(); });
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(mockWsInstances.length).toBe(8); // Another reconnect at 30s

    vi.useRealTimers();
  });

  it('uses wss:// for https pages', () => {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'example.com' },
      writable: true,
    });

    const fetchItems = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWebSocket(fetchItems));

    expect(mockWsInstances[0].url).toBe('wss://example.com/ws');
  });
});
