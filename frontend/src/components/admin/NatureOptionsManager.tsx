import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, Plus, Search, Tag, Trash2, X as XIcon, Layers } from 'lucide-react';
import api from '@/api/client';
import AppLoader from '@/components/shared/AppLoader';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';

interface NatureRow { id: string; nature: string; detail: string | null }
interface Category { name: string; rowId?: string; details: NatureRow[] }

const norm = (s: string) => s.trim().toLowerCase();
const errMsg = (err: any) => err?.response?.data?.message || err?.message || 'Something went wrong.';

/**
 * Incident nature options - the category -> specific nature list the call
 * takers pick from. Master-detail: categories on the left, the selected
 * category's natures on the right with an inline add; one search across all.
 */
function NatureOptionsManager() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const { data: rows = [], isLoading, error, refetch } = useQuery<NatureRow[]>({
    // Flat admin rows - kept apart from the wizard's grouped ['nature-options'] entry.
    queryKey: ['nature-options', 'admin'],
    queryFn: async () => (await api.get('/admin/nature-options')).data.data,
  });

  const categories = useMemo<Category[]>(() => {
    const map = new Map<string, Category>();
    for (const r of rows) {
      const c = map.get(r.nature) ?? { name: r.nature, details: [] };
      if (r.detail) c.details.push(r); else c.rowId = r.id;
      map.set(r.nature, c);
    }
    const list = [...map.values()];
    list.forEach((c) => c.details.sort((a, b) => a.detail!.localeCompare(b.detail!, undefined, { sensitivity: 'base' })));
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [rows]);

  // Keep a valid selection: first category by default, or after the selected one is deleted.
  useEffect(() => {
    if (!categories.length) { setSelected(null); return; }
    if (!selected || !categories.some((c) => c.name === selected)) setSelected(categories[0].name);
  }, [categories, selected]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['nature-options'] });

  const add = useMutation({
    mutationFn: (body: { nature: string; detail?: string }) => api.post('/admin/nature-options', body),
    onSuccess: (_r, body) => {
      invalidate();
      if (!body.detail) setSelected(body.nature);
    },
    onError: (err) => addNotification({ type: 'error', title: 'Could not add', message: errMsg(err) }),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.delete(`/admin/nature-options/${id}`))),
    onSuccess: invalidate,
    onError: (err) => { invalidate(); addNotification({ type: 'error', title: 'Could not delete', message: errMsg(err) }); },
  });

  const current = categories.find((c) => c.name === selected) ?? null;
  const total = categories.reduce((s, c) => s + c.details.length, 0);
  const q = norm(query);
  const searchHits = q
    ? categories
        .map((c) => ({ c, nameHit: norm(c.name).includes(q), hits: c.details.filter((d) => norm(d.detail!).includes(q)) }))
        .filter((x) => x.nameHit || x.hits.length)
    : [];

  const deleteCategory = async (c: Category) => {
    const ok = await confirmDialog({
      title: `Delete "${c.name}"?`,
      text: c.details.length
        ? `This removes the category and its ${c.details.length} specific nature${c.details.length === 1 ? '' : 's'}. Past incidents keep the values they were saved with.`
        : 'Past incidents keep the values they were saved with.',
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    remove.mutate([...c.details.map((d) => d.id), ...(c.rowId ? [c.rowId] : [])], {
      onSuccess: () => addNotification({ type: 'success', title: 'Category deleted', message: c.name }),
    });
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="grid place-items-center rounded-lg flex-shrink-0" style={{ width: 38, height: 38, background: 'var(--green-light)' }}>
          <Tag size={18} style={{ color: 'var(--green)' }} />
        </span>
        <div className="flex-1 min-w-[180px]">
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Incident nature options</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {isLoading ? 'Loading…' : `${categories.length} categories · ${total} specific natures - the list call takers pick from`}
          </p>
        </div>
        <div className="searchbox" style={{ maxWidth: 280, minWidth: 0, flex: '1 1 200px' }}>
          <Search size={15} />
          <input placeholder="Search all natures…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search nature options" />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" style={{ color: 'var(--muted)' }}><XIcon size={14} /></button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center" style={{ minHeight: 260 }}><AppLoader size={28} color="var(--green)" /></div>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--red)' }}>{errMsg(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm mt-3">Retry</button>
        </div>
      ) : q ? (
        /* Search results across every category */
        <div className="p-5">
          {searchHits.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--muted)' }}>No nature matches "{query.trim()}".</p>
          ) : (
            <div className="col" style={{ gap: 16 }}>
              {searchHits.map(({ c, hits }) => (
                <div key={c.name}>
                  <button
                    onClick={() => { setSelected(c.name); setQuery(''); }}
                    className="text-xs font-bold tracking-wide mb-2 hover:underline"
                    style={{ color: 'var(--green)' }}
                  >
                    {c.name} · {c.details.length}
                  </button>
                  {hits.length > 0 && (
                    <div className="nature-grid">
                      {hits.map((d) => <NatureItem key={d.id} row={d} highlight={q} onDelete={() => remove.mutate([d.id])} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="nature-layout">
          {/* Categories */}
          <aside className="nature-cats" aria-label="Categories">
            <div className="nature-cats-list">
              {categories.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelected(c.name)}
                  className={`nature-cat${c.name === selected ? ' on' : ''}`}
                  aria-current={c.name === selected}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="nature-count">{c.details.length}</span>
                </button>
              ))}
            </div>
            {addingCategory ? (
              <InlineAdd
                placeholder="New category, e.g. Trauma"
                busy={add.isPending}
                exists={(v) => categories.some((c) => norm(c.name) === norm(v))}
                existsMsg="That category already exists."
                onCancel={() => setAddingCategory(false)}
                onSubmit={(v, done) => add.mutate({ nature: v }, { onSuccess: () => { done(); setAddingCategory(false); } })}
              />
            ) : (
              <button onClick={() => setAddingCategory(true)} className="btn btn-ghost btn-sm nature-newcat">
                <FolderPlus size={15} /> New category
              </button>
            )}
          </aside>

          {/* Selected category */}
          <section className="nature-panel">
            {!current ? (
              <div className="text-center py-14">
                <Layers size={34} className="mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
                <p className="font-bold" style={{ color: 'var(--ink)' }}>No categories yet</p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create one, e.g. "Trauma", then add the specific natures under it.</p>
                <button onClick={() => setAddingCategory(true)} className="btn btn-primary btn-sm mt-4"><FolderPlus size={15} /> New category</button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">Category</p>
                    <h4 className="text-lg font-bold leading-tight mt-0.5" style={{ color: 'var(--ink)' }}>{current.name}</h4>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      {current.details.length ? `${current.details.length} specific nature${current.details.length === 1 ? '' : 's'}` : 'No specific natures yet'}
                    </p>
                  </div>
                  <button onClick={() => deleteCategory(current)} disabled={remove.isPending} className="btn btn-ghost btn-sm nature-danger">
                    <Trash2 size={14} /> Delete category
                  </button>
                </div>

                <div className="mt-4">
                  <InlineAdd
                    key={current.name}
                    placeholder={`Add a nature to ${current.name}…`}
                    busy={add.isPending}
                    exists={(v) => current.details.some((d) => norm(d.detail!) === norm(v))}
                    existsMsg={`Already in ${current.name}.`}
                    keepOpen
                    onSubmit={(v, done) => add.mutate({ nature: current.name, detail: v }, { onSuccess: done })}
                  />
                </div>

                {current.details.length > 0 ? (
                  <div className="nature-grid mt-4">
                    {current.details.map((d) => <NatureItem key={d.id} row={d} onDelete={() => remove.mutate([d.id])} />)}
                  </div>
                ) : (
                  <p className="text-sm mt-6 text-center" style={{ color: 'var(--muted)' }}>
                    Call takers will only see "{current.name}" until you add specific natures.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** One specific nature. Delete is two-step: the bin turns into "Remove" for a few seconds. */
function NatureItem({ row, onDelete, highlight }: { row: NatureRow; onDelete: () => void; highlight?: string }) {
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(false), 3500);
    return () => clearTimeout(t);
  }, [arming]);

  const text = row.detail!;
  let label: React.ReactNode = text;
  if (highlight) {
    const i = text.toLowerCase().indexOf(highlight);
    if (i >= 0) label = <>{text.slice(0, i)}<mark className="nature-mark">{text.slice(i, i + highlight.length)}</mark>{text.slice(i + highlight.length)}</>;
  }

  return (
    <div className={`nature-item${arming ? ' arming' : ''}`}>
      <span className="truncate" title={text}>{label}</span>
      {arming ? (
        <button onClick={onDelete} className="nature-remove" autoFocus>Remove</button>
      ) : (
        <button onClick={() => setArming(true)} className="nature-bin" aria-label={`Delete ${text}`} title="Delete">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

/** Text field + Add button; Enter submits, Esc cancels, duplicates are caught before the request. */
function InlineAdd({
  placeholder, busy, exists, existsMsg, onSubmit, onCancel, keepOpen,
}: {
  placeholder: string;
  busy: boolean;
  exists: (v: string) => boolean;
  existsMsg: string;
  onSubmit: (value: string, done: () => void) => void;
  onCancel?: () => void;
  keepOpen?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const dup = value.trim() !== '' && exists(value);
  const submit = () => {
    const v = value.trim();
    if (!v || dup || busy) return;
    onSubmit(v, () => { setValue(''); if (keepOpen) ref.current?.focus(); });
  };

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input
          ref={ref}
          autoFocus={!keepOpen}
          className="input flex-1 min-w-0"
          style={{ height: 40 }}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel ? onCancel() : setValue(''); }}
          disabled={busy}
          aria-invalid={dup}
        />
        <button type="submit" disabled={!value.trim() || dup || busy} className="btn btn-primary" style={{ height: 40 }}>
          {busy ? <AppLoader size={16} /> : <Plus size={16} />} Add
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="icon-btn" style={{ height: 40, width: 40 }} aria-label="Cancel"><XIcon size={16} /></button>
        )}
      </form>
      {dup && <p className="field-error mt-1">{existsMsg}</p>}
    </div>
  );
}

export default NatureOptionsManager;
