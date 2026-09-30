import { ArrowRight, Repeat } from 'lucide-react';
import type { Task } from '@/types/api';
import { STATUS_LABELS } from '@/utils/taskStatus';

function fmt(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Every time the case moved to another ambulance (e.g. a mechanical
 * breakdown): from which unit to which, why, at what stage, when, by whom
 * and where the first ambulance was.
 */
export default function TransferHistory({ tasks }: { tasks: Task[] }) {
  const ordered = [...tasks].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  const handedOver = ordered.filter((t) => t.status === 'HANDED_OVER');
  return (
    <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center gap-2">
        <Repeat size={16} className="text-amber-600" />
        <h3 className="font-semibold text-amber-700 text-sm">Ambulance transfers</h3>
        <span className="ml-2 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700">{handedOver.length}</span>
      </div>
      <ol className="divide-y divide-slate-100">
        {handedOver.map((t) => {
          const next = ordered.find((n) => n.previousTaskId === t.id);
          return (
            <li key={t.id} className="px-6 py-4">
              <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{t.vehicle?.registrationNumber ?? 'Unit'}</span>
                <ArrowRight size={14} className="text-slate-400" />
                <span className={`px-2 py-0.5 rounded-md ${next ? 'bg-brand-green/10 text-brand-green' : 'bg-amber-100 text-amber-700'}`}>
                  {next?.vehicle?.registrationNumber ?? 'Back to dispatch'}
                </span>
                <span className="ml-auto text-xs font-medium text-slate-400">{fmt(t.handedOverAt)}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <p className="text-slate-500"><span className="font-bold text-slate-400 tracking-wide">REASON </span>{t.handoverReason || '-'}</p>
                <p className="text-slate-500"><span className="font-bold text-slate-400 tracking-wide">AT STAGE </span>{t.handoverStage ? STATUS_LABELS[t.handoverStage] : '-'}</p>
                <p className="text-slate-500"><span className="font-bold text-slate-400 tracking-wide">BY </span>{t.handoverBy?.name ?? '-'}</p>
              </div>
              {t.handoverLat != null && t.handoverLng != null && (
                <a
                  className="inline-block mt-2 text-xs font-semibold text-brand-teal hover:underline"
                  href={`https://www.google.com/maps?q=${t.handoverLat},${t.handoverLng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Where {t.vehicle?.registrationNumber ?? 'the ambulance'} was ({t.handoverLat.toFixed(4)}, {t.handoverLng.toFixed(4)}) →
                </a>
              )}
              {next?.pickupName && <p className="text-xs text-slate-400 mt-1">Replacement collected the patient from {next.pickupName}.</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
