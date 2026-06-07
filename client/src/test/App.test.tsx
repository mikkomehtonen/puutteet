import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock the API module
vi.mock('../api', () => ({
  fetchItems: vi.fn(),
  createItem: vi.fn(),
  toggleChecked: vi.fn(),
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

// Mock useWebSocket to control connection state and simulate messages
// Using `var` because vi.mock factory is hoisted and cannot access let/const in TDZ
var mockWsConnected = false;
var mockWsOnMessage: ((msg: any) => void) | null = null;
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn((_fetch: () => Promise<void>, onMessage?: (msg: any) => void) => {
    mockWsOnMessage = onMessage || null;
    return { connected: mockWsConnected };
  }),
}));

import { fetchItems, createItem, toggleChecked, deleteItem, updateItem } from '../api';
import type { Item } from '../types';

// Helper to simulate a WebSocket message through the captured callback
function simulateWsMessage(msg: any) {
  act(() => {
    mockWsOnMessage?.(msg);
  });
}

const mockItem = (overrides: Partial<Item> = {}): Item => ({
  id: 1,
  name: 'Test Item',
  quantity: '',
  note: '',
  checked: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  checked_at: null,
  ...overrides,
});

describe('Task 4 — Add and display items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchItems).mockResolvedValue([]);
    mockWsConnected = false;
  });

  it('AC1: type in input + Enter adds item and shows in active list', async () => {
    const user = userEvent.setup();
    vi.mocked(createItem).mockResolvedValue(mockItem({ id: 1, name: 'Toothpaste' }));

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i });
    await user.type(input, 'Toothpaste');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Toothpaste')).toBeInTheDocument();
    });
    expect(createItem).toHaveBeenCalledWith({ name: 'Toothpaste' });
  });

  it('AC2: input field clears after adding an item', async () => {
    const user = userEvent.setup();
    vi.mocked(createItem).mockResolvedValue(mockItem({ id: 1, name: 'Toothpaste' }));

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i }) as HTMLInputElement;
    await user.type(input, 'Toothpaste');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('AC3: tap Add button with item name shows item in list', async () => {
    const user = userEvent.setup();
    vi.mocked(createItem).mockResolvedValue(mockItem({ id: 1, name: 'Milk' }));

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i });
    const addButton = screen.getByRole('button', { name: /add item/i });

    await user.type(input, 'Milk');
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });
  });

  it('AC4: input field clears after adding via Add button', async () => {
    const user = userEvent.setup();
    vi.mocked(createItem).mockResolvedValue(mockItem({ id: 1, name: 'Milk' }));

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i }) as HTMLInputElement;
    const addButton = screen.getByRole('button', { name: /add item/i });

    await user.type(input, 'Milk');
    await user.click(addButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('AC5: submit with empty input does nothing (button is disabled)', async () => {
    render(<App />);

    const addButton = screen.getByRole('button', { name: /add item/i });
    expect(addButton).toBeDisabled();
    expect(createItem).not.toHaveBeenCalled();
  });

  it('AC6: item shows name and quantity in the list', async () => {
    const user = userEvent.setup();
    vi.mocked(createItem).mockResolvedValue(
      mockItem({ id: 1, name: 'Milk', quantity: '2 liters' }),
    );

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i });
    const qtyInput = screen.getByRole('textbox', { name: /quantity/i });

    await user.type(input, 'Milk');
    await user.type(qtyInput, '2 liters');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(screen.getByText('2 liters')).toBeInTheDocument();
    });
  });

  it('AC7: active items displayed in the order returned by the API (server applies reverse chronological)', async () => {
    const older = mockItem({ id: 1, name: 'First', created_at: '2024-01-01T00:00:00.000Z' });
    const newer = mockItem({ id: 2, name: 'Second', created_at: '2024-01-02T00:00:00.000Z' });
    vi.mocked(fetchItems).mockResolvedValue([newer, older]);

    render(<App />);

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Second');
      expect(items[1]).toHaveTextContent('First');
    });
  });
});

describe('Task 5 — Check and delete items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsConnected = false;
  });

  it('AC1,AC2: checking an item moves to purchased with strikethrough', async () => {
    const item = mockItem({ id: 1, name: 'Apples' });
    vi.mocked(fetchItems).mockResolvedValue([item]);
    vi.mocked(toggleChecked).mockResolvedValue({ ...item, checked: 1, checked_at: new Date().toISOString() });

    render(<App />);

    // Item starts in active list
    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
    });

    // Click the checkbox to mark as purchased
    const checkbox = screen.getByRole('button', { name: /mark as purchased/i });
    await userEvent.click(checkbox);

    // Open the purchased section
    await waitFor(() => {
      expect(screen.getByText(/purchased/i)).toBeInTheDocument();
    });
    const purchasedBtn = screen.getByText(/purchased/i).closest('button')!;
    fireEvent.click(purchasedBtn);

    // Item now visible in purchased section with checked style
    await waitFor(() => {
      const itemRow = screen.getByText('Apples').closest('li');
      expect(itemRow?.className).toContain('item-checked');
    });
    expect(toggleChecked).toHaveBeenCalledWith(1, true);
  });

  it('AC4,AC5: unchecking an item restores to active', async () => {
    const item = mockItem({ id: 1, name: 'Apples', checked: 1, checked_at: new Date().toISOString() });
    vi.mocked(fetchItems).mockResolvedValue([item]);
    vi.mocked(toggleChecked).mockResolvedValue({ ...item, checked: 0, checked_at: null });

    render(<App />);

    // Open purchased section
    await waitFor(() => {
      const purchasedBtn = screen.getByText(/purchased/i);
      fireEvent.click(purchasedBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
    });

    const uncheckBtn = screen.getByRole('button', { name: /mark as not purchased/i });
    await userEvent.click(uncheckBtn);

    await waitFor(() => {
      // Item row should no longer have checked class
      const itemRow = screen.getByText('Apples').closest('li');
      expect(itemRow?.className).not.toContain('item-checked');
    });
    expect(toggleChecked).toHaveBeenCalledWith(1, false);
  });

  it('AC7,AC8: deleting an item removes it from the list', async () => {
    const item = mockItem({ id: 1, name: 'Butter' });
    vi.mocked(fetchItems).mockResolvedValue([item]);
    vi.mocked(deleteItem).mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Butter')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete butter/i });
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Butter')).not.toBeInTheDocument();
    });
    expect(deleteItem).toHaveBeenCalledWith(1);
  });

  it('AC9: purchased section is hidden when no purchased items exist', async () => {
    vi.mocked(fetchItems).mockResolvedValue([mockItem({ id: 1, name: 'Active Item' })]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Active Item')).toBeInTheDocument();
    });

    expect(screen.queryByText(/purchased/i)).not.toBeInTheDocument();
  });

  it('AC3: checked_at timestamp is set on server when checking', async () => {
    const item = mockItem({ id: 1, name: 'Apples' });
    vi.mocked(fetchItems).mockResolvedValue([item]);
    const checkedAt = new Date().toISOString();
    vi.mocked(toggleChecked).mockResolvedValue({ ...item, checked: 1, checked_at: checkedAt });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('button', { name: /mark as purchased/i });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(toggleChecked).toHaveBeenCalledWith(1, true);
    });
  });

  it('AC6: checked_at is cleared on server when restoring', async () => {
    const item = mockItem({ id: 1, name: 'Apples', checked: 1, checked_at: new Date().toISOString() });
    vi.mocked(fetchItems).mockResolvedValue([item]);
    vi.mocked(toggleChecked).mockResolvedValue({ ...item, checked: 0, checked_at: null });

    render(<App />);

    await waitFor(() => {
      const purchasedBtn = screen.getByText(/purchased/i);
      fireEvent.click(purchasedBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
    });

    const uncheckBtn = screen.getByRole('button', { name: /mark as not purchased/i });
    await userEvent.click(uncheckBtn);

    await waitFor(() => {
      expect(toggleChecked).toHaveBeenCalledWith(1, false);
    });
  });
});

describe('Error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchItems).mockResolvedValue([]);
    mockWsConnected = false;
  });

  it('shows error banner when API call fails', async () => {
    vi.mocked(createItem).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();

    render(<App />);

    const input = screen.getByRole('textbox', { name: /item name/i });
    await user.type(input, 'Milk');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
  });
});

describe('WebSocket — state reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchItems).mockResolvedValue([]);
    mockWsConnected = true;
  });

  it('item_created: prepends new item when id does not exist', async () => {
    const item = mockItem({ id: 1, name: 'Milk' });

    render(<App />);

    // Simulate a WebSocket message
    simulateWsMessage({ type: 'item_created', item });

    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });
  });

  it('item_created: replaces existing item with same id (dedup)', async () => {
    const existing = mockItem({ id: 1, name: 'Original' });
    const updated = mockItem({ id: 1, name: 'Updated' });
    vi.mocked(fetchItems).mockResolvedValue([existing]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Original')).toBeInTheDocument();
    });

    // Simulate a WS message with same id — should replace
    simulateWsMessage({ type: 'item_created', item: updated });

    await waitFor(() => {
      expect(screen.getByText('Updated')).toBeInTheDocument();
    });
    expect(screen.queryByText('Original')).not.toBeInTheDocument();
  });

  it('item_updated: replaces existing item in the list', async () => {
    const existing = mockItem({ id: 1, name: 'Bread' });
    const updated = mockItem({ id: 1, name: 'Sourdough Bread' });
    vi.mocked(fetchItems).mockResolvedValue([existing]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    simulateWsMessage({ type: 'item_updated', item: updated });

    await waitFor(() => {
      expect(screen.getByText('Sourdough Bread')).toBeInTheDocument();
    });
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });

  it('item_updated: prepends item if not found in state', async () => {
    const item = mockItem({ id: 99, name: 'New Item' });

    render(<App />);

    simulateWsMessage({ type: 'item_updated', item });

    await waitFor(() => {
      expect(screen.getByText('New Item')).toBeInTheDocument();
    });
  });

  it('item_deleted: removes item from the list', async () => {
    const item = mockItem({ id: 1, name: 'Butter' });
    vi.mocked(fetchItems).mockResolvedValue([item]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Butter')).toBeInTheDocument();
    });

    simulateWsMessage({ type: 'item_deleted', id: 1 });

    await waitFor(() => {
      expect(screen.queryByText('Butter')).not.toBeInTheDocument();
    });
  });

  it('item_updated with checked change moves item between sections', async () => {
    const item = mockItem({ id: 1, name: 'Apples', checked: 0 });
    vi.mocked(fetchItems).mockResolvedValue([item]);

    render(<App />);

    // Item starts in active list
    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
      const itemRow = screen.getByText('Apples').closest('li');
      expect(itemRow?.className).not.toContain('item-checked');
    });

    // Simulate WS message checking the item
    simulateWsMessage({ type: 'item_updated', item: { ...item, checked: 1, checked_at: new Date().toISOString() } });

    // Open the purchased section to see the checked item
    await waitFor(() => {
      const purchasedBtn = screen.getByText(/purchased/i);
      fireEvent.click(purchasedBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument();
      const itemRow = screen.getByText('Apples').closest('li');
      expect(itemRow?.className).toContain('item-checked');
    });
  });

  it('sync dot shows green when connected', () => {
    mockWsConnected = true;

    render(<App />);

    const dot = screen.getByLabelText('Connected');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('sync-dot--connected');
  });

  it('sync dot shows red when disconnected', () => {
    mockWsConnected = false;

    render(<App />);

    const dot = screen.getByLabelText('Disconnected');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('sync-dot--disconnected');
  });

  it('sync dot transitions from red to green on reconnect', () => {
    mockWsConnected = false;

    const { rerender } = render(<App />);

    let dot = screen.getByLabelText('Disconnected');
    expect(dot.className).toContain('sync-dot--disconnected');

    // Simulate reconnect
    mockWsConnected = true;
    rerender(<App />);

    dot = screen.getByLabelText('Connected');
    expect(dot.className).toContain('sync-dot--connected');
  });
});

describe('Task 3 — Edit button on active items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsConnected = false;
  });

  it('AC1: active item shows edit button with aria-label', async () => {
    vi.mocked(fetchItems).mockResolvedValue([mockItem({ id: 1, name: 'Bread' })]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    expect(editBtn).toBeInTheDocument();
  });

  it('AC2: edit button has minimum 44x44 touch target', async () => {
    vi.mocked(fetchItems).mockResolvedValue([mockItem({ id: 1, name: 'Bread' })]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    // CSS .edit-btn sets width: 44px; height: 44px
    expect(editBtn).toHaveClass('edit-btn');
    const style = window.getComputedStyle(editBtn);
    expect(style.width).toBe('44px');
    expect(style.height).toBe('44px');
  });

  it('AC3: purchased item does not show edit button', async () => {
    vi.mocked(fetchItems).mockResolvedValue([
      mockItem({ id: 1, name: 'Milk', checked: 1, checked_at: new Date().toISOString() }),
    ]);

    render(<App />);

    await waitFor(() => {
      // Open purchased section
      const purchasedBtn = screen.getByText(/purchased/i);
      fireEvent.click(purchasedBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /edit milk/i })).not.toBeInTheDocument();
  });
});

describe('Task 4 — Inline edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchItems).mockResolvedValue([mockItem({ id: 1, name: 'Bread', quantity: '2 loaves', note: 'sourdough' })]);
    mockWsConnected = false;
  });

  it('AC1: tap edit button switches to edit mode with pre-filled inputs', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    // Edit mode inputs are visible
    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const qtyInput = screen.getByLabelText('Edit quantity');
    expect(qtyInput).toHaveValue('2 loaves');

    const noteInput = screen.getByLabelText('Edit note');
    expect(noteInput).toHaveValue('sourdough');

    // Save and Cancel buttons appear
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel editing/i })).toBeInTheDocument();
  });

  it('AC2: checkbox and delete button are hidden during editing', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    // Checkbox and delete button should not be visible
    expect(screen.queryByRole('button', { name: /mark as purchased/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete bread/i })).not.toBeInTheDocument();
  });

  it('AC3: modify name and save calls updateItem', async () => {
    const user = userEvent.setup();
    const updatedItem = mockItem({ id: 1, name: 'Sourdough Bread', quantity: '2 loaves', note: 'sourdough' });
    vi.mocked(updateItem).mockResolvedValue(updatedItem);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'Sourdough Bread');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateItem).toHaveBeenCalledWith(1, {
        name: 'Sourdough Bread',
        quantity: '2 loaves',
        note: 'sourdough',
      });
    });
  });

  it('AC4: save returns to display mode showing updated name', async () => {
    const user = userEvent.setup();
    const updatedItem = mockItem({ id: 1, name: 'Sourdough Bread', quantity: '2 loaves', note: 'sourdough' });
    vi.mocked(updateItem).mockResolvedValue(updatedItem);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'Sourdough Bread');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Sourdough Bread')).toBeInTheDocument();
    });

    // Back in display mode
    expect(screen.queryByLabelText('Edit item name')).not.toBeInTheDocument();
  });

  it('AC5: Enter key in name input saves', async () => {
    const user = userEvent.setup();
    const updatedItem = mockItem({ id: 1, name: 'Sourdough Bread', quantity: '2 loaves', note: 'sourdough' });
    vi.mocked(updateItem).mockResolvedValue(updatedItem);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'Sourdough Bread{Enter}');

    await waitFor(() => {
      expect(updateItem).toHaveBeenCalled();
    });
  });

  it('AC6: Cancel returns to display mode with original values', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'Something Different');

    const cancelBtn = screen.getByRole('button', { name: /cancel editing/i });
    await user.click(cancelBtn);

    // Back to display mode with original name
    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    expect(updateItem).not.toHaveBeenCalled();
  });

  it('AC7: Escape key cancels editing', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name');
    await user.type(nameInput, '{Escape}');

    // Back to display mode
    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Edit item name')).not.toBeInTheDocument();
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('AC8: clearing name disables save button', async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Edit item name');
      expect(nameInput).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });

  it('AC9: save shows Saving text and disables buttons while in flight', async () => {
    const user = userEvent.setup();
    // Simulate a slow request
    let resolve: () => void;
    vi.mocked(updateItem).mockReturnValue(new Promise((r) => {
      resolve = () => r(mockItem({ id: 1, name: 'New Name' }));
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit item name')).toHaveValue('Bread');
    });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn).toHaveTextContent('Saving…');
      expect(saveBtn).toBeDisabled();
    });

    const cancelBtn = screen.getByRole('button', { name: /cancel editing/i });
    expect(cancelBtn).toBeDisabled();

    // Resolve the promise
    resolve!();
  });

  it('AC10: save failure shows error banner and keeps edit mode open', async () => {
    const user = userEvent.setup();
    vi.mocked(updateItem).mockRejectedValue(new Error('Server error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await user.click(editBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit item name')).toHaveValue('Bread');
    });

    const nameInput = screen.getByLabelText('Edit item name') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });

    // Edit mode stays open with current values preserved
    await waitFor(() => {
      expect(screen.getByLabelText('Edit item name')).toHaveValue('New Name');
    });
  });
});

describe('Task 5 — WebSocket reconciliation for edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWsConnected = true;
  });

  it('AC1: WS item_updated for a different item does not disrupt active edit', async () => {
    const item1 = mockItem({ id: 1, name: 'Bread' });
    const item2 = mockItem({ id: 2, name: 'Milk' });
    vi.mocked(fetchItems).mockResolvedValue([item1, item2]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
      expect(screen.getByText('Milk')).toBeInTheDocument();
    });

    // Start editing item 1
    const editBtn = screen.getByRole('button', { name: /edit bread/i });
    await userEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Edit item name')).toHaveValue('Bread');
    });

    // Simulate WS update for item 2
    simulateWsMessage({ type: 'item_updated', item: { ...item2, name: 'Almond Milk' } });

    // Item 2 is updated in the list
    await waitFor(() => {
      expect(screen.getByText('Almond Milk')).toBeInTheDocument();
    });

    // Edit mode for item 1 is still active
    expect(screen.getByLabelText('Edit item name')).toHaveValue('Bread');
  });

  it('AC2: WS item_updated for the same item reconciles via upsertItem', async () => {
    const item1 = mockItem({ id: 1, name: 'Bread' });
    vi.mocked(fetchItems).mockResolvedValue([item1]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Bread')).toBeInTheDocument();
    });

    // Simulate WS update for the same item (e.g., from another client)
    simulateWsMessage({ type: 'item_updated', item: { ...item1, name: 'Sourdough Bread' } });

    await waitFor(() => {
      expect(screen.getByText('Sourdough Bread')).toBeInTheDocument();
    });
    expect(screen.queryByText('Bread')).not.toBeInTheDocument();
  });
});
