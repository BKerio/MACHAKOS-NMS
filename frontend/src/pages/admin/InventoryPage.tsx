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
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '@/stores/notificationStore';
import api from '@/api/client';
import { InventoryItem, InventoryCategory } from '@/types/api';

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'VITALS', label: 'Vitals Equipment' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'AIRWAY', label: 'Airway' },
  { value: 'WOUND_CARE', label: 'Wound Care' },
  { value: 'OTHER', label: 'Other' },
];

const UNITS = ['each', 'box', 'pack', 'set', 'litre', 'roll', 'pair'];

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
  unit: 'each',
  quantityStock: 0,
  reorderLevel: 0,
  notes: '',
};

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function InventoryPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);

  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin', 'inventory', categoryFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (categoryFilter !== 'ALL') params.category = categoryFilter;
      const res = await api.get('/admin/inventory', { params });
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
        unit: form.unit,
        quantityStock: Number(form.quantityStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
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
        unit: form.unit,
        quantityStock: Number(form.quantityStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
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
      setConfirmDelete(null);
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

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setEditTarget(item);
    setForm({
      name: item.name,
      category: (item.category as InventoryCategory) || 'OTHER',
      unit: item.unit || 'each',
      quantityStock: item.quantityStock,
      reorderLevel: item.reorderLevel,
      notes: item.notes ?? '',
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.notes ?? '').toLowerCase().includes(q) ||
      categoryLabel(item.category).toLowerCase().includes(q)
    );
  });

  const lowStock = items.filter(
    (i) => i.isActive && i.reorderLevel > 0 && i.quantityStock <= i.reorderLevel
  ).length;
  const vitalsCount = items.filter((i) => i.category === 'VITALS').length;
  const totalUnits = items.reduce((sum, i) => sum + (i.quantityStock || 0), 0);

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 rounded-xl border shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              Stock Control
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
            Inventory
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Track vitals equipment and other supplies with stock levels
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => seedVitalsMutation.mutate()}
            disabled={seedVitalsMutation.isPending}
            className="flex-1 sm:flex-none px-4 py-3 text-xs font-black tracking-widest rounded-xl border transition-colors disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface-2)' }}
          >
            {seedVitalsMutation.isPending ? 'Adding...' : 'Add Vitals Kit'}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="btn btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs"
          >
            <Plus size={18} />
            Add Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: items.length },
          { label: 'Vitals Items', value: vitalsCount },
          { label: 'Units in Stock', value: totalUnits },
          { label: 'Low Stock', value: lowStock },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-6 rounded-xl border shadow-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="font-sans text-[10px] font-black tracking-[0.2em] mb-2" style={{ color: 'var(--muted)' }}>
              {stat.label}
            </div>
            <div
              className="font-sans text-4xl font-black leading-none"
              style={{ color: stat.label === 'Low Stock' && stat.value > 0 ? 'var(--red)' : 'var(--ink)' }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 flex flex-col sm:flex-row gap-3 shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted-2)' }}
          />
          <input
            className={inputCls + ' pl-11'}
            style={inputStyle}
            placeholder="Search by name or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={inputCls + ' sm:w-52 cursor-pointer'}
          style={inputStyle}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {isLoading ? (
          <p className="text-center py-16 font-bold" style={{ color: 'var(--muted)' }}>
            Loading inventory...
          </p>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
            <p className="font-bold" style={{ color: 'var(--ink)' }}>
              No inventory items yet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Add items manually or use Add Vitals Kit to start with common equipment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Item', 'Category', 'Stock', 'Reorder At', 'Unit', ''].map((h, i) => (
                    <th
                      key={h || `a-${i}`}
                      className="px-5 py-4 font-sans text-[10px] font-black tracking-[0.2em]"
                      style={{ color: 'var(--muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isLow =
                    item.isActive && item.reorderLevel > 0 && item.quantityStock <= item.reorderLevel;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
                          {item.name}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--muted)' }}>
                            {item.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-md text-[10px] font-black tracking-wide"
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            color: 'var(--ink)',
                          }}
                        >
                          {categoryLabel(item.category)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-black text-lg leading-none"
                            style={{ color: isLow ? 'var(--red)' : 'var(--ink)' }}
                          >
                            {item.quantityStock}
                          </span>
                          {isLow && <AlertTriangle size={14} style={{ color: 'var(--red)' }} />}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                        {item.reorderLevel}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                        {item.unit}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--muted)' }}
                            title="Edit"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(item)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--red)' }}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checked out to crew */}
      {checkouts.length > 0 && (
        <div
          className="rounded-xl border shadow-sm overflow-hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="font-sans text-sm font-black" style={{ color: 'var(--ink)' }}>
              Checked Out to Crew
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Stock currently carried on ambulances, drawn from the totals above
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Item', 'Qty Outstanding', 'Ambulance', 'Crew Member', 'Since'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 font-sans text-[10px] font-black tracking-[0.2em]"
                      style={{ color: 'var(--muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkouts.map((co) => (
                  <tr key={co.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-5 py-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>
                      {co.item.name}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {co.quantity - co.returnedQuantity} {co.item.unit}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                      {co.vehicle.registrationNumber}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                      {co.user.name} ({co.user.role})
                    </td>
                    <td className="px-5 py-3 text-sm" style={{ color: 'var(--muted)' }}>
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
            <div className="h-1 w-full bg-brand-green flex-shrink-0" />
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
                  <Check size={15} />
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

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Delete {confirmDelete.name}?
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                This removes the item from inventory permanently.
              </p>
            </div>
            <div className="px-5 py-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-bold rounded-xl border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-bold rounded-xl text-white disabled:opacity-40"
                style={{ background: 'var(--red)' }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InventoryPage;
