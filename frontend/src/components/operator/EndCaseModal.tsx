import { useState } from 'react';
import { TriangleAlert as Warning, X as XIcon, CircleX as XCircle } from 'lucide-react';
import { CLOSURE_REASON_PRESETS, buildClosureReason } from '@/utils/closureReasons';

interface EndCaseModalProps {
  caseNumber: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

function EndCaseModal({ caseNumber, isSubmitting = false, onClose, onConfirm }: EndCaseModalProps) {
  const [selected, setSelected] = useState('');
  const [extraNote, setExtraNote] = useState('');

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const reasonText = buildClosureReason(selected, extraNote);
  const canSubmit = selected.length > 0 && reasonText.length >= 10 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'var(--red)' }}>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-white/80">End Case</p>
            <p className="text-lg font-bold text-white mt-0.5">{caseNumber}</p>
          </div>
          <button onClick={handleClose} disabled={isSubmitting} className="p-1.5 text-white/80 hover:text-white">
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="flex gap-2.5 border rounded-xl p-3 mb-4" style={{ background: 'var(--red-soft)', borderColor: 'var(--red)' }}>
            <Warning size={18} style={{ color: 'var(--red)' }} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--red)' }}>
              This closes the case at the current stage. A reason is required and will be saved to the record.
            </p>
          </div>

          <p className="label mb-2.5">Quick select</p>
          <div className="flex flex-col gap-2">
            {CLOSURE_REASON_PRESETS.map((preset) => {
              const active = selected === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setSelected(preset)}
                  disabled={isSubmitting}
                  className="text-left px-3.5 py-3 rounded-xl border-2 text-sm transition-all"
                  style={
                    active
                      ? { borderColor: 'var(--red)', background: 'var(--red-soft)', color: 'var(--red)', fontWeight: 700 }
                      : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
                  }
                >
                  {preset}
                </button>
              );
            })}
          </div>

          <p className="label mt-4 mb-2">Additional notes (optional)</p>
          <textarea
            className="eoc-textarea"
            style={{ minHeight: 80 }}
            placeholder="Any extra detail for dispatch…"
            value={extraNote}
            onChange={(e) => setExtraNote(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="px-5 py-4 flex gap-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={handleClose} disabled={isSubmitting} className="btn btn-ghost flex-1">
            Cancel
          </button>
          <button
            onClick={() => canSubmit && onConfirm(reasonText)}
            disabled={!canSubmit}
            className="btn btn-danger flex-1"
          >
            <XCircle size={16} />
            {isSubmitting ? 'Ending…' : 'End case'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EndCaseModal;
