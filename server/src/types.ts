export interface Item {
  id: number;
  name: string;
  quantity: string;
  note: string;
  checked: number; // 0 | 1 (SQLite boolean)
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

export interface CheckedInput {
  checked: boolean;
}
