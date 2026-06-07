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
