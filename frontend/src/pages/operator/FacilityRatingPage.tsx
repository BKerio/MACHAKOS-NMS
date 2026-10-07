import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Hospital, Star } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { getErrorMessage, rateFacility } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import { pcrPath } from '@/utils/caseFlow';

const WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
// Tags that fit the score: praise for a good handover, problems for a poor one (same as the app).
const GOOD_TAGS = ['Quick handover', 'Team was ready', 'Bed available', 'Clear communication', 'Easy access'];
const POOR_TAGS = ['Long wait', 'No bed available', 'Diverted elsewhere', 'Poor communication', 'Hard to access'];

const tagOptions = (stars: number) =>
  stars === 0 ? [] : stars >= 4 ? GOOD_TAGS : stars <= 2 ? POOR_TAGS : [...GOOD_TAGS.slice(0, 3), ...POOR_TAGS.slice(0, 3)];

/**
 * After a case the crew rates the facility they handed the patient to -
 * 1 to 5 stars, one-tap tags and an optional note (the app's
 * FacilityRatingScreen). Skippable. `next=pcr` continues to the PCR upload,
 * `next=history` returns to History; otherwise it goes back.
 */
function FacilityRatingPage() {
  const { taskId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const caseNumber = params.get('caseNumber') ?? '';
  const facility = params.get('facility') ?? 'the facility';
  const next = params.get('next');
  const [stars, setStars] = useState(() => Math.min(5, Math.max(0, Number(params.get('stars')) || 0)));
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const goOn = () => {
    if (next === 'pcr') navigate(pcrPath(taskId, caseNumber), { replace: true });
    else if (next === 'history') navigate('/operator/history', { replace: true });
    else navigate(-1);
  };

  const save = useMutation({
    mutationFn: () => rateFacility(taskId, { stars, tags, comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'history'] });
      addNotification({ type: 'success', title: 'Rating saved', message: `Thanks. Your rating of ${facility} is saved.` });
      goOn();
    },
    onError: (err) => addNotification({ type: 'error', title: "Couldn't save your rating", message: getErrorMessage(err) }),
  });

  const pickStars = (n: number) => {
    setStars(n);
    // Drop tags that no longer fit the new score.
    setTags((t) => t.filter((x) => tagOptions(n).includes(x)));
  };
  const options = tagOptions(stars);

  return (
    <div className="col mx-auto w-full" style={{ gap: 20, maxWidth: 640 }}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Case complete</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Rate the facility</h2>
        </div>
        <button onClick={goOn} disabled={save.isPending} className="btn btn-ghost">Skip</button>
      </div>

      <div className="flex items-center gap-4 rounded-2xl p-5" style={{ background: 'var(--nav-bg)' }}>
        <span className="grid place-items-center rounded-xl flex-shrink-0" style={{ width: 56, height: 56, background: 'var(--green)' }}>
          <Hospital size={28} color="#fff" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,.6)' }}>
            CASE COMPLETE{caseNumber ? ` · ${caseNumber}` : ''}
          </p>
          <p className="text-lg font-bold text-white leading-tight mt-1 line-clamp-2">{facility}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,.6)' }}>Receiving facility</p>
        </div>
      </div>

      <div>
        <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>How was the handover?</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Think about the wait, the team and the space for your patient.</p>
      </div>

      <div className="card card-pad text-center">
        <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={n === stars}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => pickStars(n)}
              disabled={save.isPending}
              className="grid place-items-center rounded-full transition-transform"
              style={{ width: 56, height: 56, transform: n <= stars ? 'scale(1.08)' : undefined }}
            >
              <Star size={42} strokeWidth={1.6} fill={n <= stars ? 'var(--gold)' : 'transparent'} color={n <= stars ? 'var(--gold)' : 'var(--border-strong)'} />
            </button>
          ))}
        </div>
        <p
          className="mt-3 font-bold"
          style={{ fontSize: stars ? 18 : 14, color: stars === 0 ? 'var(--muted)' : stars >= 4 ? 'var(--green)' : stars <= 2 ? 'var(--amber)' : 'var(--ink)' }}
        >
          {stars === 0 ? 'Tap a star to rate' : WORDS[stars - 1]}
        </p>
      </div>

      {stars > 0 && (
        <>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{stars >= 4 ? 'What went well?' : 'What could be better?'}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>Optional. Tap any that apply.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {options.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => setTags((t) => (on ? t.filter((x) => x !== tag) : [...t, tag]))}
                    disabled={save.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
                    style={on
                      ? { borderColor: 'var(--green)', background: 'var(--green-light)', color: 'var(--green)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink-2)' }}
                  >
                    {on && <Check size={14} />} {tag}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="field">
            <span className="label">Note for dispatch (optional)</span>
            <textarea
              className="eoc-textarea"
              style={{ minHeight: 80 }}
              maxLength={500}
              placeholder="Anything the next crew should know"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={save.isPending}
            />
          </label>
        </>
      )}

      <div>
        <button onClick={() => save.mutate()} disabled={stars === 0 || save.isPending} className="btn btn-primary btn-lg btn-block">
          {save.isPending ? <AppLoader size={22} /> : stars === 0 ? 'Choose a rating' : 'Submit rating'}
        </button>
        <p className="text-xs text-center mt-2" style={{ color: 'var(--muted)' }}>
          {next === 'pcr' ? 'Next: upload the patient care report.' : 'Dispatch uses crew ratings when choosing where to take patients.'}
        </p>
      </div>
    </div>
  );
}

export default FacilityRatingPage;
