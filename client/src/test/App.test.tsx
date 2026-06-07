import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock the API module
vi.mock('../api', () => ({
  fetchItems: vi.fn(),
  createItem: vi.fn(),
  toggleChecked: vi.fn(),
  deleteItem: vi.fn(),
}));

import { fetchItems, createItem, toggleChecked, deleteItem } from '../api';
import type { Item } from '../types';

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
    // The API returns active items newest-first. Mock that order.
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
    // No confirmation dialog (AC8) — nothing to assert, the point is no dialog appeared
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
