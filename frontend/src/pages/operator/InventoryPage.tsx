import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Search as SearchIcon,
  Plus,
  Minus,
  ShoppingCart,
  X as XIcon,
  Check,
  Undo2,
  Ambulance,
} from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import { getAvailableInventory, checkoutInventory, getMyInventory, returnInventory } from '@/api/inventory';
import { getMyCheckIn } from '@/api/responder';
import type { InventoryCategory, InventoryCheckout, InventoryItem } from '@/types/api';

const CATEGORIES: { value: InventoryCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'VITALS', label: 'Vitals' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'AIRWAY', label: 'Airway' },
  { value: 'WOUND_CARE', label: 'Wound Care' },
  { value: 'OTHER', label: 'Other' },
];

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function getErrorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || fallback;
}

function InventoryPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | 'ALL'>('ALL');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<InventoryCheckout | null>(null);
  const [returnQty, setReturnQty] = useState(1);

  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: myVehicle } = useQuery({ queryKey: ['operator', 'my-checkin'], queryFn: getMyCheckIn });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['operator', 'inventory', 'available'],
    queryFn: getAvailableInventory,
  });

  const { data: myStock = [] } = useQuery({
    queryKey: ['operator', 'inventory', 'mine'],
    queryFn: getMyInventory,
    enabled: !!myVehicle,
  });

  const checkoutMutation = useMutation({
    mutationFn: (lines: { itemId: string; quantity: number }[]) => checkoutInventory(lines),
    onSuccess: (_data, lines) => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'inventory'] });
      const count = lines.reduce((sum, l) => sum + l.quantity, 0);
      setCart({});
      setCartOpen(false);
      addNotification({
        type: 'success',
        title: 'Added to ambulance stock',
        message: `${count} unit${count === 1 ? '' : 's'} moved onto ${myVehicle?.registrationNumber ?? 'your ambulance'}.`,
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Checkout failed', message: getErrorMessage(err, 'Could not check out stock.') });
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => returnInventory(id, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'inventory'] });
      setReturnTarget(null);
      addNotification({ type: 'success', title: 'Returned', message: 'Stock returned to central inventory.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Return failed', message: getErrorMessage(err, 'Could not return stock.') });
    },
  });

  const filtered = items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || categoryLabel(item.category).toLowerCase().includes(q);
  });

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ item: items.find((i) => i.id === itemId), qty }))
        .filter((l): l is { item: InventoryItem; qty: number } => !!l.item),
    [cart, items]
  );
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);

  function inCart(itemId: string) {
    return cart[itemId] ?? 0;
  }

  function setQty(item: InventoryItem, qty: number) {
    const clamped = Math.max(0, Math.min(qty, item.quantityStock));
    setCart((c) => {
      if (clamped <= 0) {
        const { [item.id]: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, [item.id]: clamped };
    });
  }

  function submitCheckout() {
    if (!cartLines.length) return;
    checkoutMutation.mutate(cartLines.map((l) => ({ itemId: l.item.id, quantity: l.qty })));
  }

  function openReturn(checkout: InventoryCheckout) {
    setReturnTarget(checkout);
    setReturnQty(checkout.quantity - checkout.returnedQuantity);
  }

  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Inventory</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Browse central stock and add it to your ambulance
        </p>
      </div>

      {!myVehicle && (
        <div className="card card-pad flex items-center gap-3" style={{ borderColor: 'var(--gold)' }}>
          <Ambulance size={20} style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Check in to a vehicle on the <b>Crew</b> tab before taking or returning stock.
          </p>
        </div>
      )}

      {myVehicle && myStock.length > 0 && (
        <div className="card card-pad">
          <div className="flex items-center justify-between mb-2">
            <p className="label">On {myVehicle.registrationNumber}</p>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {myStock.map((co) => {
              const outstanding = co.quantity - co.returnedQuantity;
              return (
                <div
                  key={co.id}
                  className="flex items-center gap-3 py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{co.item.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {outstanding} {co.item.unit}{outstanding === 1 ? '' : 's'} onboard
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openReturn(co)}
                    className="btn btn-sm btn-ghost flex items-center gap-1.5"
                  >
                    <Undo2 size={14} /> Return
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + category filter */}
      <div className="col" style={{ gap: 10 }}>
        <div className="input-icon">
          <input
            className="input"
            placeholder="Search stock..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchIcon />
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ paddingBottom: 2 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategoryFilter(c.value)}
              className="btn btn-sm flex-shrink-0"
              style={
                categoryFilter === c.value
                  ? { background: 'var(--green)', color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--border)' }
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Available stock */}
      {isLoading ? (
        <div className="skel" style={{ height: 200 }} />
      ) : filtered.length === 0 ? (
        <div className="card card-pad text-center" style={{ padding: 36 }}>
          <Package size={36} style={{ color: 'var(--muted-2)' }} className="mx-auto mb-3" />
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>No stock found</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>Try a different search or category.</p>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {filtered.map((item) => {
            const qty = inCart(item.id);
            const outOfStock = item.quantityStock <= 0;
            return (
              <div key={item.id} className="card card-pad flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.name}</p>
                    <span
                      className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                    >
                      {categoryLabel(item.category)}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: outOfStock ? 'var(--red)' : 'var(--muted)' }}>
                    {outOfStock ? 'Out of stock' : `${item.quantityStock} ${item.unit}${item.quantityStock === 1 ? '' : 's'} available`}
                  </p>
                </div>

                {qty > 0 ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => setQty(item, qty - 1)} className="btn btn-sm btn-ghost" style={{ width: 32, padding: 0 }}>
                      <Minus size={14} />
                    </button>
                    <span className="text-sm font-black w-5 text-center" style={{ color: 'var(--ink)' }}>{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(item, qty + 1)}
                      disabled={qty >= item.quantityStock}
                      className="btn btn-sm btn-ghost"
                      style={{ width: 32, padding: 0 }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => setQty(item, 1)}
                    className="btn btn-sm btn-primary flex-shrink-0"
                  >
                    Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="btn btn-lg btn-primary flex items-center justify-center gap-2"
          style={{ position: 'sticky', bottom: 14, boxShadow: 'var(--shadow-lg)' }}
        >
          <ShoppingCart size={18} />
          Review cart · {cartCount} item{cartCount === 1 ? '' : 's'}
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <>
          <div className="drawer-back" onClick={() => setCartOpen(false)} />
          <div className="drawer">
            <div className="card-head" style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <div>
                <div className="eyebrow">Cart</div>
                <div className="card-title">Add to {myVehicle?.registrationNumber ?? 'ambulance'}</div>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} className="btn btn-sm btn-ghost" style={{ padding: 6 }}>
                <XIcon size={16} />
              </button>
            </div>
            <div className="col" style={{ gap: 12, padding: 16, overflowY: 'auto', flex: 1 }}>
              {cartLines.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Your cart is empty.</p>
              ) : (
                cartLines.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{item.unit}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" onClick={() => setQty(item, qty - 1)} className="btn btn-sm btn-ghost" style={{ width: 30, padding: 0 }}>
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-black w-5 text-center" style={{ color: 'var(--ink)' }}>{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(item, qty + 1)}
                        disabled={qty >= item.quantityStock}
                        className="btn btn-sm btn-ghost"
                        style={{ width: 30, padding: 0 }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="col" style={{ gap: 8, padding: 16, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={submitCheckout}
                disabled={!cartLines.length || !myVehicle || checkoutMutation.isPending}
                className="btn btn-lg btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Check size={16} />
                {checkoutMutation.isPending ? 'Checking out...' : 'Confirm checkout'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Return modal */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReturnTarget(null)} />
          <div className="relative w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Return {returnTarget.item.name}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Adds the quantity back to central inventory.
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="label mb-1.5 block">Quantity to return</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setReturnQty((q) => Math.max(1, q - 1))} className="btn btn-sm btn-ghost" style={{ width: 34, padding: 0 }}>
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  className="input text-center"
                  style={{ width: 80 }}
                  min={1}
                  max={returnTarget.quantity - returnTarget.returnedQuantity}
                  value={returnQty}
                  onChange={(e) => {
                    const max = returnTarget.quantity - returnTarget.returnedQuantity;
                    setReturnQty(Math.max(1, Math.min(max, parseInt(e.target.value, 10) || 1)));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setReturnQty((q) => Math.min(returnTarget.quantity - returnTarget.returnedQuantity, q + 1))}
                  className="btn btn-sm btn-ghost"
                  style={{ width: 34, padding: 0 }}
                >
                  <Plus size={14} />
                </button>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  of {returnTarget.quantity - returnTarget.returnedQuantity} onboard
                </span>
              </div>
            </div>
            <div className="px-5 py-4 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setReturnTarget(null)} className="px-4 py-2 text-sm font-bold rounded-xl border" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => returnMutation.mutate({ id: returnTarget.id, quantity: returnQty })}
                disabled={returnMutation.isPending}
                className="btn btn-primary px-4 py-2 text-sm disabled:opacity-40"
              >
                {returnMutation.isPending ? 'Returning...' : 'Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPage;
