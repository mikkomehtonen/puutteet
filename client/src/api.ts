import type { Item, CreateItemInput } from './types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function handleJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

async function handleEmptyOrThrow(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
}

export async function fetchItems(): Promise<Item[]> {
  const res = await fetch(`${BASE_URL}/api/items`);
  return handleJsonOrThrow<Item[]>(res);
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const res = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleJsonOrThrow<Item>(res);
}

export async function toggleChecked(id: number, checked: boolean): Promise<Item> {
  const res = await fetch(`${BASE_URL}/api/items/${id}/checked`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checked }),
  });
  return handleJsonOrThrow<Item>(res);
}

export async function deleteItem(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/items/${id}`, {
    method: 'DELETE',
  });
  return handleEmptyOrThrow(res);
}
