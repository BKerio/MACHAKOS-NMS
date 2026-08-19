import api from '@/api/client';
import type { InventoryCheckout, InventoryItem } from '@/types/api';

// ── Crew stock cart (driver / EMT / nurse) ─────────────────────────────────────
// Browse central inventory and check items out onto the ambulance the crew
// member is currently checked into; return unused quantities afterward.

export async function getAvailableInventory(): Promise<InventoryItem[]> {
  const res = await api.get('/inventory');
  return res.data.data as InventoryItem[];
}

export async function checkoutInventory(
  items: { itemId: string; quantity: number }[]
): Promise<InventoryCheckout[]> {
  const res = await api.post('/inventory/checkout', { items });
  return res.data.data as InventoryCheckout[];
}

export async function getMyInventory(): Promise<InventoryCheckout[]> {
  const res = await api.get('/inventory/my');
  return res.data.data as InventoryCheckout[];
}

export async function returnInventory(checkoutId: string, quantity: number): Promise<InventoryCheckout> {
  const res = await api.post(`/inventory/checkouts/${checkoutId}/return`, { quantity });
  return res.data.data as InventoryCheckout;
}
