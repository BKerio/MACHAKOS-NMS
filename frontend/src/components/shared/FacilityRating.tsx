import { Star, StarHalf, Hospital } from 'lucide-react';
import type { FacilityRating } from '@/types/api';

const WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
const ROLE_LABEL: Record<string, string> = { DRIVER: 'Driver', EMT: 'EMT', NURSE: 'Nurse' };

/** Read-only 0-5 stars; averages round to the nearest half star. */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) =>
        rounded >= i ? (
          <Star key={i} size={size} fill="#D4A017" color="#D4A017" strokeWidth={1.5} />
        ) : rounded >= i - 0.5 ? (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} color="var(--border)" strokeWidth={1.5} className="absolute inset-0" />
            <StarHalf size={size} fill="#D4A017" color="#D4A017" strokeWidth={1.5} className="absolute inset-0" />
          </span>
        ) : (
          <Star key={i} size={size} color="var(--border)" strokeWidth={1.5} />
        ),
      )}
    </span>
  );
}

/** Compact "★★★★☆ 4.2 (12)" for tables; "Not rated" when there's nothing yet. */
export function RatingSummary({ average, count }: { average?: number | null; count?: number }) {
  if (average == null || !count) {
    return <span className="text-xs font-semibold" style={{ color: 'var(--muted-2)' }}>Not rated</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <StarRow value={average} size={14} />
      <span className="text-sm font-black" style={{ color: 'var(--ink)' }}>{average.toFixed(1)}</span>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>({count})</span>
    </span>
  );
}

/**
 * How the crew rated the receiving facility for a completed case: the
 * average, then each crew member's stars, tags and note.
 */
export function FacilityRatingPanel({ facilityName, ratings }: { facilityName: string; ratings: FacilityRating[] }) {
  const average = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-surface-border flex items-center gap-2">
        <Hospital size={14} className="text-brand-teal" />
        <p className="text-xs font-semibold text-slate-600 tracking-wide">Facility rating by the crew</p>
        <span className="ml-auto text-xs font-semibold text-slate-500 truncate max-w-[50%]">{facilityName}</span>
      </div>
      <div className="p-5">
        {average == null ? (
          <div className="flex items-center gap-3">
            <StarRow value={0} size={18} />
            <p className="text-sm text-slate-400">The crew hasn't rated this facility for this case yet.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <p className="text-3xl font-black text-brand-teal leading-none">{average.toFixed(1)}</p>
              <div>
                <StarRow value={average} size={18} />
                <p className="text-xs text-slate-400 mt-1">
                  {WORDS[Math.min(4, Math.max(0, Math.round(average) - 1))]} · {ratings.length} crew rating{ratings.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col divide-y divide-slate-100">
              {ratings.map((r) => (
                <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                      {r.user?.name ?? 'Crew member'}
                      {r.user?.role && <span className="font-normal text-slate-400"> · {ROLE_LABEL[r.user.role] ?? r.user.role}</span>}
                    </p>
                    <span className="ml-auto"><StarRow value={r.stars} size={14} /></span>
                  </div>
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.tags.map((t) => (
                        <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{t}</span>
                      ))}
                    </div>
                  )}
                  {r.comment && <p className="text-sm text-slate-500 italic mt-2">“{r.comment}”</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
