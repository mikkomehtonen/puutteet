export interface Item {
  id: number;
  name: string;
  quantity: string;
  note: string;
  checked: number;
  created_at: string;
  updated_at: string;
  checked_at: string | null;
}

export interface CreateItemInput {
  name: string;
  quantity?: string;
  note?: string;
}

export interface UpdateItemInput {
  name?: string;
  quantity?: string;
  note?: string;
}

export type WsMessage =
  | { type: 'item_created'; item: Item }
  | { type: 'item_updated'; item: Item }
  | { type: 'item_deleted'; id: number };
