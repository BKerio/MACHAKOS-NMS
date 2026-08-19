import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LoaderCircle, Save } from 'lucide-react';
import { getActiveTask, submitPatientData, getErrorMessage } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';

function VitalsSummary({ title, rows }: { title: string; rows: Array<[string, string | undefined | null]> }) {
  const filled = rows.filter(([, value]) => Boolean(value && String(value).trim()));
  if (!filled.length) return null;

  return (
    <div className="rounded-xl border p-4 mb-4" style={{ borderColor: 'var(--border)' }}>
      <p className="text-sm font-bold mb-2.5" style={{ color: 'var(--ink)' }}>{title}</p>
      {filled.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 py-1 text-sm">
          <span className="font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
          <span style={{ color: 'var(--ink-2)' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function PatientDataPage() {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: task } = useQuery({ queryKey: ['operator', 'active-task'], queryFn: getActiveTask });

  const [preHospitalManagement, setPreHospitalManagement] = useState(task?.incident.preHospitalManagement ?? '');
  const [dispatcherChallenges, setDispatcherChallenges] = useState(task?.incident.dispatcherChallenges ?? '');

  const submitMutation = useMutation({
    mutationFn: () =>
      submitPatientData(taskId!, {
        preHospitalManagement: preHospitalManagement.trim(),
        dispatcherChallenges: dispatcherChallenges.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator', 'active-task'] });
      addNotification({ type: 'success', title: 'Notes saved', message: 'Clinical notes have been saved.' });
      navigate(-1);
    },
    onError: (err) => addNotification({ type: 'error', title: 'Save failed', message: getErrorMessage(err) }),
  });

  const handleSubmit = () => {
    if (!taskId) return;
    if (!preHospitalManagement.trim()) {
      addNotification({ type: 'error', title: 'Clinical notes are required', message: 'Please describe vitals, interventions and treatment given.' });
      return;
    }
    submitMutation.mutate();
  };

  const vitals = task?.incident.vitals;
  const maternity = task?.incident.maternityVitals;

  return (
    <div className="col" style={{ gap: 20, maxWidth: 640 }}>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--green)' }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>Clinical Notes</h2>
      </div>

      <VitalsSummary
        title="Watcher vitals (read-only)"
        rows={[
          ['Temp', vitals?.temperature], ['Pulse', vitals?.pulseRate], ['RR', vitals?.respirationRate],
          ['BP', vitals?.bp], ['SPO₂', vitals?.spo2], ['FH', vitals?.fh],
        ]}
      />
      <VitalsSummary
        title="Maternity vitals (read-only)"
        rows={[
          ['Parity', maternity?.parity], ['Gravid', maternity?.gravid], ['FHR', maternity?.fetalHeartRate],
          ['Dilatation', maternity?.cervicalDilatation], ['BP', maternity?.bp], ['Pulse', maternity?.pulse],
          ['Temp', maternity?.temperature], ['SPO₂', maternity?.spo2], ['Mode of delivery', maternity?.modeOfDelivery],
          ['Baby condition', maternity?.conditionOfBaby],
        ]}
      />

      <div className="field">
        <label className="label">Pre-hospital management *</label>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Vitals, interventions, patient condition, and treatment given.</p>
        <textarea
          className="eoc-textarea"
          style={{ minHeight: 160 }}
          placeholder="e.g. Patient conscious, BP 120/80, O2 administered..."
          value={preHospitalManagement}
          onChange={(e) => setPreHospitalManagement(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">Challenges (optional)</label>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Access issues, delays, or complications encountered.</p>
        <textarea
          className="eoc-textarea"
          style={{ minHeight: 100 }}
          placeholder="e.g. Heavy traffic, narrow access road..."
          value={dispatcherChallenges}
          onChange={(e) => setDispatcherChallenges(e.target.value)}
        />
      </div>

      <button onClick={handleSubmit} disabled={submitMutation.isPending} className="btn btn-primary btn-lg btn-block">
        {submitMutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
        {submitMutation.isPending ? 'Saving…' : 'Save Notes'}
      </button>
    </div>
  );
}

export default PatientDataPage;
