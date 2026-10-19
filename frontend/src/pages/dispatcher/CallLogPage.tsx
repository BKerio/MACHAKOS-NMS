import { useState, useEffect, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff as PhoneDisconnect,
  Search as MagnifyingGlass,
  Link as LinkSimple,
  RotateCw as ArrowClockwise,
  Circle,
  X,
  Bookmark,
  BookmarkCheck,
  Star,
  ClipboardCheck,
} from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import { formatDistanceToNow } from 'date-fns';
import { fmtDate, fmtTime } from '@/lib/datetime';
import api from '@/api/client';
import { CallLog, CallDirection, CallStatus, ActiveCall } from '@/types/api';
import { useActiveCalls } from '@/hooks/useActiveCalls';
import { useNotificationStore } from '@/stores/notificationStore';
import { socket } from '@/lib/socket';
import LoadingState from '@/components/shared/LoadingState';
import { incidentPath } from '@/lib/incidentPath';
import { useAuthStore } from '@/stores/authStore';

type Folder = 'all' | 'pending' | 'done';
const SCORE_WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const DIRECTION_ICONS: Record<CallDirection, ReactElement> = {
  INBOUND: <PhoneIncoming size={15} color="var(--green)" />,
  OUTBOUND: <PhoneOutgoing size={15} color="var(--blue)" />,
  INTERNAL: <Phone size={15} color="var(--muted)" />,
};

const STATUS_PILL: Record<CallStatus | 'RINGING', string> = {
  ANSWERED: 'pill-green',
  NO_ANSWER: 'pill-gray',
  BUSY: 'pill-amber',
  FAILED: 'pill-red',
  RINGING: 'pill-blue',
};

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function CallLogPage() {
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const activeCalls = useActiveCalls();

  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [daysBack, setDaysBack] = useState('7');
  const [linkModal, setLinkModal] = useState<{ callId: string; logId: string } | null>(null);
  const [caseNumber, setCaseNumber] = useState('');
  // Call quality review: which folder is open, and the flag / score dialogs.
  const [folder, setFolder] = useState<Folder>('all');
  const [flagFor, setFlagFor] = useState<CallLog | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [evalFor, setEvalFor] = useState<CallLog | null>(null);
  const [evalScore, setEvalScore] = useState(0);
  const [evalNotes, setEvalNotes] = useState('');
  const role = useAuthStore((s) => s.user?.role);
  const canScore = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const from = new Date(Date.now() - parseInt(daysBack) * 86_400_000).toISOString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pbx', 'cdr', direction, status, daysBack, search, folder],
    queryFn: async () => {
      // The evaluation folders show every flagged call, whatever its date.
      const params = new URLSearchParams(folder === 'all' ? { from, limit: '100' } : { limit: '100', evaluation: folder });
      if (direction) params.set('direction', direction);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const res = await api.get(`/pbx/cdr?${params}`);
      return res.data.data as CallLog[];
    },
  });

  useEffect(() => {
    socket.connect();
    const handler = () => queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
    socket.on('pbx:call:ended', handler);
    return () => { socket.off('pbx:call:ended', handler); };
  }, [queryClient]);

  const { data: pendingEval = 0 } = useQuery({
    queryKey: ['pbx', 'cdr', 'evaluation-count'],
    queryFn: async () => (await api.get('/pbx/cdr/evaluation-count')).data.data.pending as number,
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, flagged, reason }: { id: string; flagged: boolean; reason?: string }) =>
      api.patch(`/pbx/cdr/${id}/evaluation-flag`, { flagged, reason }),
    onSuccess: (_res, { flagged }) => {
      queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
      setFlagFor(null);
      setFlagReason('');
      addNotification({
        type: 'success',
        title: flagged ? 'Added for evaluation' : 'Removed from evaluation',
        message: flagged ? 'The call is in the For evaluation folder.' : 'The call was taken out of the evaluation folder.',
      });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not update', message: err?.response?.data?.message || 'Please try again.' }),
  });

  const evalMutation = useMutation({
    mutationFn: ({ id, score, notes }: { id: string; score: number; notes?: string }) =>
      api.patch(`/pbx/cdr/${id}/evaluation`, { score, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
      setEvalFor(null);
      addNotification({ type: 'success', title: 'Evaluation saved', message: 'The call has been scored.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Could not save', message: err?.response?.data?.message || 'Please try again.' }),
  });

  function openEval(log: CallLog) {
    setEvalFor(log);
    setEvalScore(log.evalScore ?? 0);
    setEvalNotes(log.evalNotes ?? '');
  }

  const linkMutation = useMutation({
    mutationFn: async ({ logId, incidentId }: { logId: string; incidentId: string }) =>
      api.patch(`/pbx/cdr/${logId}/link`, { incidentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
      setLinkModal(null);
      setCaseNumber('');
      addNotification({ type: 'success', title: 'Call Linked', message: 'Call log linked to incident.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Link Failed', message: err?.response?.data?.message || 'Could not link call.' });
    },
  });

  async function handleLinkSubmit() {
    if (!linkModal || !caseNumber.trim()) return;
    try {
      const res = await api.get(`/incidents?caseNumber=${encodeURIComponent(caseNumber.trim())}&limit=5`);
      const incidents = res.data.data as Array<{ id: string; caseNumber: string }>;
      const match = incidents.find((i) => i.caseNumber.toLowerCase() === caseNumber.trim().toLowerCase());
      if (!match) {
        addNotification({ type: 'error', title: 'Not Found', message: `Case "${caseNumber}" not found.` });
        return;
      }
      linkMutation.mutate({ logId: linkModal.logId, incidentId: match.id });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Could not search incidents.' });
    }
  }

  const logs = data ?? [];

  return (
    <>
      {/* Page header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ fontSize: 20 }}>Call Logs</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Yeastar PBX - inbound, outbound, and internal calls</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="status-chip">
            <Circle size={10} style={{ animation: 'pulse-ring 2s infinite' }} />
            Incoming calls logging
          </span>
          <button className="icon-btn" onClick={() => refetch()} title="Refresh">
            <ArrowClockwise size={16} />
          </button>
        </div>
      </div>

      {/* Active calls banner */}
      {activeCalls.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--blue) 25%, transparent)', background: 'var(--blue-soft)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{activeCalls.length} Active Call{activeCalls.length > 1 ? 's' : ''}</div>
          <div className="col" style={{ gap: 8 }}>
            {activeCalls.map((c: ActiveCall) => (
              <div key={c.callId} className="row" style={{ gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--blue)', flexShrink: 0, display: 'inline-block', animation: 'pulse-ring 2s infinite' }} />
                <span className="mono strong" style={{ fontSize: 13 }}>{c.callFrom}</span>
                <span className="muted">→</span>
                <span className="mono strong" style={{ fontSize: 13 }}>{c.callTo}</span>
                <span className="pill pill-blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                  {c.status === 'ANSWERED' ? 'Answered' : 'Ringing'}
                </span>
                <span className="muted mono" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
                  {formatDistanceToNow(new Date(c.startedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Folders: every call, or the calls flagged for quality review */}
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([
          { key: 'all', label: 'All calls' },
          { key: 'pending', label: 'For evaluation', count: pendingEval },
          { key: 'done', label: 'Evaluated' },
        ] as { key: Folder; label: string; count?: number }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFolder(f.key)}
            className={`btn btn-sm ${folder === f.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ height: 32 }}
          >
            {f.key !== 'all' && <ClipboardCheck size={13} />}
            {f.label}
            {!!f.count && (
              <span className="pill pill-amber" style={{ fontSize: 10.5, padding: '1px 7px', marginLeft: 2 }}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="searchbox" style={{ flex: 1, minWidth: 180 }}>
            <MagnifyingGlass size={15} />
            <input
              type="text"
              placeholder="Search number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="eoc-select" style={{ height: 36, width: 'auto', padding: '0 10px' }} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">All Directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
            <option value="INTERNAL">Internal</option>
          </select>
          <select className="eoc-select" style={{ height: 36, width: 'auto', padding: '0 10px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="ANSWERED">Answered</option>
            <option value="NO_ANSWER">No Answer</option>
            <option value="BUSY">Busy</option>
            <option value="FAILED">Failed</option>
          </select>
          <select className="eoc-select" style={{ height: 36, width: 'auto', padding: '0 10px' }} value={daysBack} onChange={(e) => setDaysBack(e.target.value)} disabled={folder !== 'all'} title={folder !== 'all' ? 'Evaluation folders show every flagged call' : undefined}>
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <LoadingState minHeight={160} label="Loading call logs…" />
        ) : logs.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)' }}>
            {folder === 'pending' ? 'No calls waiting for evaluation. Flag a call from All calls to add it here.'
              : folder === 'done' ? 'No calls have been evaluated yet.'
              : 'No call records found'}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Date / Time</th>
                  <th>Duration</th>
                  <th>Talk</th>
                  <th>Status</th>
                  <th>Incident</th>
                  {folder !== 'all' && <th>Evaluation</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {DIRECTION_ICONS[log.direction]}
                        <span className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>{log.direction.toLowerCase()}</span>
                      </div>
                    </td>
                    <td className="mono strong" style={{ fontSize: 13 }}>{log.callFrom}</td>
                    <td className="mono strong" style={{ fontSize: 13 }}>{log.callTo}</td>
                    <td>
                      <div className="strong" style={{ fontSize: 13 }}>{fmtDate(log.startedAt)}</div>
                      <div className="muted mono" style={{ fontSize: 12 }}>{fmtTime(log.startedAt)}</div>
                    </td>
                    <td className="mono" style={{ fontSize: 13 }}>{formatDuration(log.duration)}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{formatDuration(log.talkDuration)}</td>
                    <td>
                      <span className={`pill ${STATUS_PILL[log.status] ?? 'pill-gray'}`} style={{ fontSize: 11 }}>
                        {log.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {log.incident ? (
                        <a href={incidentPath(log.incident)} className="mono strong" style={{ fontSize: 12.5, color: 'var(--green)', textDecoration: 'none' }}>
                          {log.incident.caseNumber}
                        </a>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    {folder !== 'all' && (
                      <td style={{ maxWidth: 260 }}>
                        {log.evalScore != null ? (
                          <div title={log.evalNotes ?? undefined}>
                            <div className="row" style={{ gap: 2 }}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star key={n} size={13} fill={n <= log.evalScore! ? 'var(--gold, #f59e0b)' : 'none'} color={n <= log.evalScore! ? 'var(--gold, #f59e0b)' : 'var(--muted)'} />
                              ))}
                              <span className="strong" style={{ fontSize: 12, marginLeft: 4 }}>{SCORE_WORDS[log.evalScore - 1]}</span>
                            </div>
                            <div className="muted truncate" style={{ fontSize: 11.5, marginTop: 2 }}>
                              {log.evaluatedBy ?? 'Evaluated'}{log.evalNotes ? ` · ${log.evalNotes}` : ''}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="pill pill-amber" style={{ fontSize: 11 }}>Waiting</span>
                            <div className="muted truncate" style={{ fontSize: 11.5, marginTop: 2 }} title={log.evalReason ?? undefined}>
                              {log.evalReason || 'No reason given'}{log.evalFlaggedBy ? ` · ${log.evalFlaggedBy}` : ''}
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        {canScore && log.forEvaluation && (
                          <button
                            className="btn btn-soft btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                            onClick={() => openEval(log)}
                          >
                            <Star size={12} /> {log.evalScore != null ? 'Re-score' : 'Evaluate'}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                          title={log.forEvaluation ? 'Remove from the evaluation folder' : 'Add to the For evaluation folder'}
                          disabled={flagMutation.isPending}
                          onClick={() => {
                            if (log.forEvaluation) flagMutation.mutate({ id: log.id, flagged: false });
                            else { setFlagFor(log); setFlagReason(''); }
                          }}
                        >
                          {log.forEvaluation ? <BookmarkCheck size={12} color="var(--amber)" /> : <Bookmark size={12} />}
                          {log.forEvaluation ? 'Flagged' : 'Flag'}
                        </button>
                        {log.recording && (
                          <a href={log.recording} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ height: 28, padding: '0 8px', fontSize: 12 }}>
                            <PhoneDisconnect size={12} /> Play
                          </a>
                        )}
                        {!log.incident && (
                          <button
                            className="btn btn-soft btn-sm"
                            style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                            onClick={() => setLinkModal({ callId: log.callId, logId: log.id })}
                          >
                            <LinkSimple size={12} /> Link
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && logs.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
            {logs.length} record{logs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Flag for evaluation */}
      {flagFor && (
        <>
          <div className="drawer-back" onClick={() => setFlagFor(null)} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 61, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 16 }}>
            <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24, pointerEvents: 'all', animation: 'fadeUp .3s both' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="card-title">Flag call for evaluation</div>
                <button className="icon-btn" onClick={() => setFlagFor(null)}><X size={16} /></button>
              </div>
              <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
                <span className="mono strong">{flagFor.callFrom}</span> → <span className="mono strong">{flagFor.callTo}</span>
                {' · '}{fmtDate(flagFor.startedAt)} {fmtTime(flagFor.startedAt)}
              </p>
              <div className="field" style={{ marginBottom: 16 }}>
                <label className="label">Why should this call be reviewed? (optional)</label>
                <textarea
                  className="input"
                  rows={3}
                  autoFocus
                  placeholder="e.g. Long delay before dispatch, caller was given unclear advice, good example for training..."
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  style={{ height: 'auto', paddingTop: 8 }}
                />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setFlagFor(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ id: flagFor.id, flagged: true, reason: flagReason })}
                >
                  {flagMutation.isPending ? <><AppLoader size={16} /> Saving…</> : 'Add to folder'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Score a flagged call */}
      {evalFor && (
        <>
          <div className="drawer-back" onClick={() => setEvalFor(null)} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 61, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: 16 }}>
            <div className="card" style={{ width: '100%', maxWidth: 460, padding: 24, pointerEvents: 'all', animation: 'fadeUp .3s both' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="card-title">Evaluate call</div>
                <button className="icon-btn" onClick={() => setEvalFor(null)}><X size={16} /></button>
              </div>
              <p className="muted" style={{ fontSize: 13.5, marginBottom: 6 }}>
                <span className="mono strong">{evalFor.callFrom}</span> → <span className="mono strong">{evalFor.callTo}</span>
                {' · '}{fmtDate(evalFor.startedAt)} {fmtTime(evalFor.startedAt)} · talk {formatDuration(evalFor.talkDuration)}
              </p>
              {evalFor.evalReason && (
                <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--ink-2)' }}>
                  <span className="muted">Flagged{evalFor.evalFlaggedBy ? ` by ${evalFor.evalFlaggedBy}` : ''}:</span> {evalFor.evalReason}
                </p>
              )}
              {evalFor.recording ? (
                <audio controls src={evalFor.recording} style={{ width: '100%', marginBottom: 14 }} />
              ) : (
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>No recording for this call.</p>
              )}
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label">Score</label>
                <div className="row" style={{ gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setEvalScore(n)} aria-label={`${n} - ${SCORE_WORDS[n - 1]}`} style={{ padding: 2 }}>
                      <Star size={26} fill={n <= evalScore ? 'var(--gold, #f59e0b)' : 'none'} color={n <= evalScore ? 'var(--gold, #f59e0b)' : 'var(--muted)'} />
                    </button>
                  ))}
                  <span className="strong" style={{ fontSize: 13, marginLeft: 8 }}>{evalScore ? SCORE_WORDS[evalScore - 1] : 'Tap to score'}</span>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label className="label">Notes / feedback</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="What went well, what to improve - e.g. location confirmed quickly; first aid advice was clear..."
                  value={evalNotes}
                  onChange={(e) => setEvalNotes(e.target.value)}
                  style={{ height: 'auto', paddingTop: 8 }}
                />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEvalFor(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={!evalScore || evalMutation.isPending}
                  onClick={() => evalMutation.mutate({ id: evalFor.id, score: evalScore, notes: evalNotes })}
                >
                  {evalMutation.isPending ? <><AppLoader size={16} /> Saving…</> : 'Save evaluation'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Link to incident modal */}
      {linkModal && (
        <>
          <div className="drawer-back" onClick={() => { setLinkModal(null); setCaseNumber(''); }} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 61, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24, pointerEvents: 'all', animation: 'fadeUp .3s both' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="card-title">Link Call to Incident</div>
                <button className="icon-btn" onClick={() => { setLinkModal(null); setCaseNumber(''); }}><X size={16} /></button>
              </div>
              <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>Enter the case number to link this call record.</p>
              <div className="field" style={{ marginBottom: 16 }}>
                <label className="label">Case Number</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. EOC-2026-001"
                  autoFocus
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
                />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setLinkModal(null); setCaseNumber(''); }}>Cancel</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleLinkSubmit}
                  disabled={!caseNumber.trim() || linkMutation.isPending}
                >
                  {linkMutation.isPending ? <><AppLoader size={16} /> Linking…</> : 'Link call'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default CallLogPage;
