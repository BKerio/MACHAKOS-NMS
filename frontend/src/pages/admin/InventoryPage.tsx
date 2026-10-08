import { useState } from 'react';
import {
  Plus,
  Search as MagnifyingGlass,
  Package,
  Pencil as PencilSimple,
  Trash2,
  X as XIcon,
  Check,
  TriangleAlert as AlertTriangle,
  Minus,
  Layers,
  Sparkles,
  ClipboardCheck,
  Truck,
  HeartPulse,
  Syringe,
  Pill,
  Wind,
  Bandage,
  Boxes,
} from 'lucide-react';
import { confirmDialog } from '@/lib/alert';
import AppLoader from '@/components/shared/AppLoader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/api/client';
import { InventoryItem, InventoryCategory, InventoryItemType } from '@/types/api';
import LoadingState from '@/components/shared/LoadingState';

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'VITALS', label: 'Vitals Equipment' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'AIRWAY', label: 'Airway' },
  { value: 'WOUND_CARE', label: 'Wound Care' },
  { value: 'OTHER', label: 'Other' },
];

const CATEGORY_ICONS: Record<InventoryCategory, typeof Package> = {
  VITALS: HeartPulse,
  CONSUMABLES: Syringe,
  MEDICATION: Pill,
  AIRWAY: Wind,
  WOUND_CARE: Bandage,
  OTHER: Boxes,
};

const UNITS = ['each', 'box', 'pack', 'set', 'litre', 'roll', 'pair', 'check'];

const ITEM_TYPES: { value: InventoryItemType; label: string }[] = [
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'VEHICLE', label: 'Vehicle' },
];

/** Suggested starter items for vitals monitoring (admin can edit stock after add). */
const VITALS_PRESETS: { name: string; unit: string; reorderLevel: number }[] = [
  { name: 'Digital Thermometer', unit: 'each', reorderLevel: 5 },
  { name: 'Pulse Oximeter', unit: 'each', reorderLevel: 4 },
  { name: 'BP Cuff (Adult)', unit: 'each', reorderLevel: 4 },
  { name: 'BP Cuff (Paediatric)', unit: 'each', reorderLevel: 2 },
  { name: 'Stethoscope', unit: 'each', reorderLevel: 3 },
  { name: 'Glucometer', unit: 'each', reorderLevel: 2 },
  { name: 'Glucometer Strips', unit: 'box', reorderLevel: 3 },
  { name: 'GCS Reference Card', unit: 'each', reorderLevel: 2 },
];

const inputCls =
  'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
  color: 'var(--ink)',
};
const labelCls = 'block text-[10px] font-black tracking-widest mb-1.5';

const emptyForm = {
  name: '',
  category: 'VITALS' as InventoryCategory,
  itemType: 'MEDICAL' as InventoryItemType,
  unit: 'each',
  quantityStock: 0,
  reorderLevel: 0,
  requiredForDispatch: true,
  notes: '',
};

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function InventoryPage() {
  const [search, setSearch] = useState('');
  /** 'ALL', 'LOW' (low stock) or a category value. */
  const [view, setView] = useState<string>('ALL');
  const [quickName, setQuickName] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | InventoryItemType>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    // Everything at once; categories, low stock and search filter it here.
    queryKey: ['admin', 'inventory', 'all'],
    queryFn: async () => {
      const res = await api.get('/admin/inventory');
      return res.data.data as InventoryItem[];
    },
  });

  const { data: checkouts = [] } = useQuery({
    queryKey: ['admin', 'inventory', 'checkouts'],
    queryFn: async () => {
      const res = await api.get('/admin/inventory/checkouts');
      return res.data.data as Array<{
        id: string;
        quantity: number;
        returnedQuantity: number;
        checkedOutAt: string;
        item: { name: string; unit: string };
        user: { name: string; role: string };
        vehicle: { registrationNumber: string };
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/inventory', {
        name: form.name.trim(),
        category: form.category,
        itemType: form.itemType,
        unit: form.unit,
        quantityStock: Number(form.quantityStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        requiredForDispatch: form.requiredForDispatch,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      closeModal();
      addNotification({ type: 'success', title: 'Item Added', message: 'Inventory item created.' });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed',
        message: err?.response?.data?.message || 'Could not add item.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/inventory/${editTarget!.id}`, {
        name: form.name.trim(),
        category: form.category,
        itemType: form.itemType,
        unit: form.unit,
        quantityStock: Number(form.quantityStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        requiredForDispatch: form.requiredForDispatch,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      closeModal();
      addNotification({ type: 'success', title: 'Updated', message: 'Inventory item saved.' });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed',
        message: err?.response?.data?.message || 'Could not update item.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/inventory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      addNotification({ type: 'success', title: 'Deleted', message: 'Item removed from inventory.' });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed',
        message: err?.response?.data?.message || 'Could not delete item.',
      });
    },
  });

  // Quick +/- from the list: one PATCH, the row updates in place.
  const stockMutation = useMutation({
    mutationFn: (v: { id: string; quantityStock: number }) =>
      api.patch(`/admin/inventory/${v.id}`, { quantityStock: Math.max(0, v.quantityStock) }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'inventory', 'all'] });
      queryClient.setQueryData<InventoryItem[]>(['admin', 'inventory', 'all'], (old) =>
        old?.map((i) => (i.id === v.id ? { ...i, quantityStock: Math.max(0, v.quantityStock) } : i)));
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      addNotification({ type: 'error', title: 'Stock not updated', message: err?.response?.data?.message || 'Could not change the stock level.' });
    },
  });

  async function deleteItem(item: InventoryItem) {
    const ok = await confirmDialog({
      title: `Delete ${item.name}?`,
      text: 'This removes the item from inventory and the dispatch checklist. Past checkouts keep their records.',
      confirmLabel: 'Delete item',
      danger: true,
    });
    if (ok) deleteMutation.mutate(item.id);
  }

  const seedVitalsMutation = useMutation({
    mutationFn: async () => {
      const existing = new Set(items.map((i) => i.name.toLowerCase()));
      const toAdd = VITALS_PRESETS.filter((p) => !existing.has(p.name.toLowerCase()));
      for (const preset of toAdd) {
        await api.post('/admin/inventory', {
          name: preset.name,
          category: 'VITALS',
          unit: preset.unit,
          quantityStock: 0,
          reorderLevel: preset.reorderLevel,
        });
      }
      return toAdd.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      addNotification({
        type: 'success',
        title: count ? 'Vitals Kit Added' : 'Already Complete',
        message: count
          ? `Added ${count} vitals equipment item${count === 1 ? '' : 's'}. Set stock numbers as needed.`
          : 'All suggested vitals items are already in inventory.',
      });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed',
        message: err?.response?.data?.message || 'Could not seed vitals items.',
      });
    },
  });

  function openCreate(prefill?: Partial<typeof emptyForm>) {
    setEditTarget(null);
    setForm({ ...emptyForm, ...(view !== 'ALL' && view !== 'LOW' ? { category: view as InventoryCategory } : {}), ...prefill });
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setEditTarget(item);
    setForm({
      name: item.name,
      category: (item.category as InventoryCategory) || 'OTHER',
      itemType: item.itemType || 'MEDICAL',
      unit: item.unit || 'each',
      quantityStock: item.quantityStock,
      reorderLevel: item.reorderLevel,
      requiredForDispatch: item.requiredForDispatch ?? true,
      notes: item.notes ?? '',
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  const isLow = (i: InventoryItem) => i.isActive && i.reorderLevel > 0 && i.quantityStock <= i.reorderLevel;
  const byType = items.filter((i) => typeFilter === 'ALL' || i.itemType === typeFilter);
  const lowItems = byType.filter(isLow);
  const q = search.trim().toLowerCase();
  const inView = (i: InventoryItem) => (view === 'ALL' ? true : view === 'LOW' ? isLow(i) : i.category === view);
  const filtered = byType
    .filter((i) => (q ? true : inView(i)))
    .filter((i) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.notes ?? '').toLowerCase().includes(q) ||
      categoryLabel(i.category).toLowerCase().includes(q))
    .sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name));

  const totalUnits = items.reduce((sum, i) => sum + (i.quantityStock || 0), 0);
  const requiredCount = items.filter((i) => i.requiredForDispatch).length;
  const viewTitle = q
    ? `Results for "${search.trim()}"`
    : view === 'ALL' ? 'All items' : view === 'LOW' ? 'Low stock' : categoryLabel(view);
  const viewCategory = CATEGORIES.some((c) => c.value === view) ? (view as InventoryCategory) : null;

  const navRows: { id: string; label: string; Icon: typeof Package; count: number; low: number }[] = [
    { id: 'ALL', label: 'All items', Icon: Layers, count: byType.length, low: lowItems.length },
    { id: 'LOW', label: 'Low stock', Icon: AlertTriangle, count: lowItems.length, low: 0 },
    ...CATEGORIES.map((c) => ({
      id: c.value,
      label: c.label,
      Icon: CATEGORY_ICONS[c.value],
      count: byType.filter((i) => i.category === c.value).length,
      low: lowItems.filter((i) => i.category === c.value).length,
    })),
  ];

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Stock control</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1" style={{ color: 'var(--ink)' }}>Inventory</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Medical and vehicle supplies, stock levels and what crews have on board.
          </p>
        </div>
        <button type="button" onClick={() => openCreate()} className="btn btn-primary">
          <Plus size={17} /> Add item
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Items', value: items.length, note: `${requiredCount} on the dispatch checklist` },
          { label: 'Units in stock', value: totalUnits, note: 'Across all items' },
          { label: 'Low stock', value: items.filter(isLow).length, note: 'At or below reorder level', alert: true },
          { label: 'On ambulances', value: checkouts.reduce((s, c) => s + c.quantity - c.returnedQuantity, 0), note: `${checkouts.length} checkout${checkouts.length === 1 ? '' : 's'} open` },
        ].map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => s.alert && s.value > 0 && (setView('LOW'), setSearch(''))}
            className="card card-pad text-left"
            style={{ cursor: s.alert && s.value > 0 ? 'pointer' : 'default' }}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1 leading-none" style={{ color: s.alert && s.value > 0 ? 'var(--red)' : 'var(--ink)' }}>{s.value}</p>
            <p className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>{s.note}</p>
          </button>
        ))}
      </div>

      {/* Master-detail */}
      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="searchbox" style={{ maxWidth: 340, minWidth: 0, flex: '1 1 220px' }}>
            <MagnifyingGlass size={15} />
            <input placeholder="Search items, notes or categories…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search inventory" />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search" style={{ color: 'var(--muted)' }}><XIcon size={14} /></button>
            )}
          </div>
          <div className="seg ml-auto" role="tablist" aria-label="Item type">
            {(['ALL', 'MEDICAL', 'VEHICLE'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={typeFilter === t} className={typeFilter === t ? 'on' : ''} onClick={() => setTypeFilter(t)}>
                {t === 'ALL' ? 'All' : t === 'MEDICAL' ? 'Medical' : 'Vehicle'}
              </button>
            ))}
          </div>
        </div>

        <div className="nature-layout">
          <aside className="nature-cats" aria-label="Categories">
            <div className="nature-cats-list">
              {navRows.map(({ id, label, Icon, count, low }) => (
                <button
                  key={id}
                  onClick={() => { setView(id); setSearch(''); }}
                  className={`nature-cat${!q && view === id ? ' on' : ''}`}
                  aria-current={!q && view === id}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon size={16} style={{ color: id === 'LOW' && count > 0 ? 'var(--red)' : undefined, flexShrink: 0 }} />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {low > 0 && <span className="inv-lowdot" title={`${low} low`} />}
                    <span className="nature-count" style={id === 'LOW' && count > 0 ? { background: 'var(--red-soft)', color: 'var(--red)' } : undefined}>{count}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="nature-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">{q ? 'Search' : view === 'ALL' || view === 'LOW' ? 'View' : 'Category'}</p>
                <h3 className="text-lg font-bold leading-tight mt-0.5" style={{ color: 'var(--ink)' }}>{viewTitle}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  {filtered.length} item{filtered.length === 1 ? '' : 's'}
                  {typeFilter !== 'ALL' ? ` · ${typeFilter === 'MEDICAL' ? 'medical' : 'vehicle'} only` : ''}
                </p>
              </div>
              {viewCategory === 'VITALS' && (
                <button
                  type="button"
                  onClick={() => seedVitalsMutation.mutate()}
                  disabled={seedVitalsMutation.isPending}
                  className="btn btn-ghost btn-sm"
                >
                  {seedVitalsMutation.isPending ? <AppLoader size={14} /> : <Sparkles size={14} />} Add vitals kit
                </button>
              )}
            </div>

            {viewCategory && !q && (
              <form
                className="flex gap-2 mt-4"
                onSubmit={(e) => { e.preventDefault(); if (quickName.trim()) { openCreate({ name: quickName.trim(), category: viewCategory }); setQuickName(''); } }}
              >
                <input
                  className="input flex-1 min-w-0"
                  style={{ height: 40 }}
                  placeholder={`Add an item to ${categoryLabel(viewCategory)}…`}
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                />
                <button type="submit" disabled={!quickName.trim()} className="btn btn-primary" style={{ height: 40 }}>
                  <Plus size={16} /> Add
                </button>
              </form>
            )}

            {isLoading ? (
              <LoadingState minHeight={200} label="Loading inventory…" />
            ) : filtered.length === 0 ? (
              <div className="text-center py-14">
                <Package size={34} className="mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
                <p className="font-bold" style={{ color: 'var(--ink)' }}>
                  {q ? 'No items match your search' : view === 'LOW' ? 'Nothing is running low' : 'No items here yet'}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  {q ? 'Try another name, or clear the search.'
                    : view === 'LOW' ? 'Every item is above its reorder level.'
                    : viewCategory === 'VITALS' ? 'Add items above, or use "Add vitals kit" for the common equipment.'
                    : 'Add the first item with the field above.'}
                </p>
              </div>
            ) : (
              <div className="col mt-4" style={{ gap: 8 }}>
                {filtered.map((item) => {
                  const low = isLow(item);
                  const scale = Math.max(item.reorderLevel * 3, item.quantityStock, 1);
                  const adjusting = stockMutation.isPending && stockMutation.variables?.id === item.id;
                  return (
                    <div key={item.id} className={`inv-row${low ? ' low' : ''}${item.isActive ? '' : ' inactive'}`}>
                      <div className="inv-main">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.name}</p>
                          {(q || view === 'ALL' || view === 'LOW') && <span className="pill pill-gray" style={{ fontSize: 10.5 }}>{categoryLabel(item.category)}</span>}
                          {item.itemType === 'VEHICLE' && <span className="pill pill-blue" style={{ fontSize: 10.5 }}>Vehicle</span>}
                          {item.requiredForDispatch && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--green)' }} title="Must be confirmed before dispatch">
                              <ClipboardCheck size={12} /> Checklist
                            </span>
                          )}
                        </div>
                        {item.notes && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--muted)' }}>{item.notes}</p>}
                      </div>

                      <div className="inv-stock">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-lg font-bold leading-none" style={{ color: low ? 'var(--red)' : 'var(--ink)' }}>
                            {item.quantityStock} <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{item.unit}</span>
                          </span>
                          {item.reorderLevel > 0 && (
                            <span className="text-[11px]" style={{ color: low ? 'var(--red)' : 'var(--muted)' }}>
                              {low ? 'Reorder' : `Reorder at ${item.reorderLevel}`}
                            </span>
                          )}
                        </div>
                        <div className="inv-bar" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, (item.quantityStock / scale) * 100)}%`, background: low ? 'var(--red)' : 'var(--green)' }} />
                          {item.reorderLevel > 0 && <i style={{ left: `${(item.reorderLevel / scale) * 100}%` }} />}
                        </div>
                      </div>

                      <div className="inv-actions">
                        <div className="inv-stepper" role="group" aria-label={`Adjust stock of ${item.name}`}>
                          <button
                            type="button"
                            onClick={() => stockMutation.mutate({ id: item.id, quantityStock: item.quantityStock - 1 })}
                            disabled={adjusting || item.quantityStock <= 0}
                            aria-label="Remove one"
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => stockMutation.mutate({ id: item.id, quantityStock: item.quantityStock + 1 })}
                            disabled={adjusting}
                            aria-label="Add one"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button type="button" onClick={() => openEdit(item)} className="inv-icon" title="Edit" aria-label={`Edit ${item.name}`}>
                          <PencilSimple size={15} />
                        </button>
                        <button type="button" onClick={() => deleteItem(item)} className="inv-icon danger" title="Delete" aria-label={`Delete ${item.name}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Checked out to crew */}
      {checkouts.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="grid place-items-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'var(--green-light)' }}>
              <Truck size={17} style={{ color: 'var(--green)' }} />
            </span>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>On ambulances</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Stock crews have checked out, drawn from the totals above</p>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Item</th><th>Outstanding</th><th>Ambulance</th><th>Crew member</th><th>Since</th>
                </tr>
              </thead>
              <tbody>
                {checkouts.map((co) => (
                  <tr key={co.id}>
                    <td className="strong">{co.item.name}</td>
                    <td>{co.quantity - co.returnedQuantity} {co.item.unit}</td>
                    <td className="mono">{co.vehicle.registrationNumber}</td>
                    <td>{co.user.name} <span className="muted">· {co.user.role}</span></td>
                    <td className="muted">
                      {new Date(co.checkedOutAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div
            className="relative w-full max-w-md rounded-2xl shadow-xl overflow-hidden border flex flex-col max-h-[90vh]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-xs font-bold tracking-widest" style={{ color: 'var(--muted)' }}>
                  {editTarget ? 'Edit Item' : 'New Item'}
                </p>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {editTarget ? editTarget.name : 'Add to inventory'}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="p-2" style={{ color: 'var(--muted)' }}>
                <XIcon size={18} />
              </button>
            </div>

            <form
              className="overflow-y-auto px-5 py-4 flex flex-col gap-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (editTarget) updateMutation.mutate();
                else createMutation.mutate();
              }}
            >
              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Item name *
                </label>
                <input
                  required
                  className={inputCls}
                  style={inputStyle}
                  placeholder="e.g. Pulse Oximeter"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Type *
                  </label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.itemType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, itemType: e.target.value as InventoryItemType }))
                    }
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Category *
                  </label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as InventoryCategory }))
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Unit
                  </label>
                  <select
                    className={inputCls + ' cursor-pointer'}
                    style={inputStyle}
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                    <input
                      type="checkbox"
                      checked={form.requiredForDispatch}
                      onChange={(e) => setForm((f) => ({ ...f, requiredForDispatch: e.target.checked }))}
                    />
                    Required for dispatch checklist
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Stock quantity *
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    className={inputCls}
                    style={inputStyle}
                    value={form.quantityStock}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quantityStock: parseInt(e.target.value, 10) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className={labelCls} style={{ color: 'var(--muted)' }}>
                    Reorder level
                  </label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    style={inputStyle}
                    value={form.reorderLevel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reorderLevel: parseInt(e.target.value, 10) || 0 }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelCls} style={{ color: 'var(--muted)' }}>
                  Notes
                </label>
                <textarea
                  className={inputCls + ' min-h-[72px] resize-y'}
                  style={inputStyle}
                  placeholder="Optional notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div
                className="flex gap-2 pt-3 mt-1"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    updateMutation.isPending ||
                    !form.name.trim()
                  }
                  className="btn btn-primary flex-[1.4] flex items-center justify-center gap-2 text-sm disabled:opacity-40"
                >
                  {createMutation.isPending || updateMutation.isPending ? <AppLoader size={19} /> : <Check size={15} />}
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editTarget
                      ? 'Save Changes'
                      : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPage;
