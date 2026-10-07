import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Image as ImageIcon, FileUp, CloudUpload, X as XIcon, FileText, HeartPulse } from 'lucide-react';
import AppLoader from '@/components/shared/AppLoader';
import {
  uploadPatientCareReport,
  getErrorMessage,
  getPatientVitals,
  savePatientVitals,
  type PatientVitals,
} from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';

type FileKind = 'image' | 'pdf' | 'docx' | 'unknown';

/** Vital signs the crew records on the PCR (keys match Task.handoverVitals). */
const VITAL_FIELDS: { key: keyof PatientVitals; label: string; unit: string; inputMode: 'decimal' | 'text' }[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C', inputMode: 'decimal' },
  { key: 'pulseRate', label: 'Pulse', unit: 'bpm', inputMode: 'decimal' },
  { key: 'respirationRate', label: 'Respiration', unit: '/min', inputMode: 'decimal' },
  { key: 'bp', label: 'Blood pressure', unit: 'mmHg', inputMode: 'text' },
  { key: 'spo2', label: 'SpO₂', unit: '%', inputMode: 'decimal' },
  { key: 'gcs', label: 'GCS', unit: '/15', inputMode: 'decimal' },
  { key: 'rbs', label: 'Blood sugar (RBS)', unit: 'mmol/L', inputMode: 'decimal' },
];

function fileKindOf(mimeType: string): FileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return 'unknown';
}

function PatientCareReportPage() {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();
  const caseNumber = searchParams.get('caseNumber') ?? '';
  const { addNotification } = useNotificationStore();

  const [note, setNote] = useState('');
  const [vitals, setVitals] = useState<PatientVitals>({});
  const [vitalsTouched, setVitalsTouched] = useState(false);

  // Pre-fill with what the crew already saved; show any vitals logged with the alert.
  const { data: savedVitals, isLoading: vitalsLoading } = useQuery({
    queryKey: ['operator', 'task-vitals', taskId],
    queryFn: () => getPatientVitals(taskId!),
    enabled: !!taskId,
  });
  useEffect(() => {
    if (savedVitals?.vitals && !vitalsTouched) setVitals(savedVitals.vitals);
  }, [savedVitals]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVital = (key: keyof PatientVitals, value: string) => {
    setVitalsTouched(true);
    setVitals((v) => ({ ...v, [key]: value }));
  };
  const hasVitals = Object.values(vitals).some((v) => v && v.trim());
  const alertVitals = Object.entries(savedVitals?.reportedAtAlert ?? {}).filter(([, v]) => v);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const title = caseNumber ? `PCR · ${caseNumber}` : 'Patient Care Report';
  const kind = file ? fileKindOf(file.type) : null;

  const pickFile = (f: File) => {
    setFile(f);
    setPreviewUrl(fileKindOf(f.type) === 'image' ? URL.createObjectURL(f) : null);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (vitalsTouched) await savePatientVitals(taskId!, vitals);
      if (file) await uploadPatientCareReport(taskId!, { note: note.trim() || undefined, file });
    },
    onSuccess: () => {
      addNotification({
        type: 'success',
        title: file ? 'PCR uploaded' : 'Vitals saved',
        message: 'Case saved to History.',
      });
      navigate('/operator/history', { replace: true });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Upload failed', message: getErrorMessage(err) }),
  });

  const submit = () => {
    if (!taskId) {
      addNotification({ type: 'error', title: 'Missing task', message: 'Please return to Assignment and try again.' });
      return;
    }
    if (!file && !hasVitals) {
      addNotification({ type: 'error', title: 'Add the report', message: 'Record the patient vitals, or attach a photo / PDF / DOCX of the PCR.' });
      return;
    }
    uploadMutation.mutate();
  };

  const skipForNow = async () => {
    const confirmed = await confirmDialog({
      title: 'Skip PCR upload?',
      text: 'You can upload later from History, but dispatch may require a report to close the case.',
      confirmLabel: 'Skip',
      cancelLabel: 'Continue',
      danger: true,
    });
    if (confirmed) navigate('/operator/history', { replace: true });
  };

  return (
    <div className="col" style={{ gap: 20, maxWidth: 640 }}>
      <div>
        <p className="eyebrow">Field Operations</p>
        <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{title}</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Patient vitals, the report file, and a note</p>
      </div>

      <div className="card card-pad">
        <p className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <HeartPulse size={18} style={{ color: 'var(--red)' }} /> Patient vitals
        </p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
          Your readings for this patient. Leave a field blank if it wasn't taken.
        </p>
        {vitalsLoading ? (
          <div className="py-6 flex justify-center"><AppLoader size={22} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {VITAL_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{f.label}</span>
                <span className="relative">
                  <input
                    className="input w-full"
                    style={{ paddingRight: 58 }}
                    inputMode={f.inputMode}
                    placeholder={f.key === 'bp' ? '120/80' : ''}
                    value={vitals[f.key] ?? ''}
                    onChange={(e) => setVital(f.key, e.target.value)}
                    disabled={uploadMutation.isPending}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--muted)' }}>{f.unit}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {alertVitals.length > 0 && (
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            Reported when the alert was logged:{' '}
            {alertVitals.map(([k, v]) => `${VITAL_FIELDS.find((f) => f.key === k)?.label ?? k} ${v}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="card card-pad">
        <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Report file</p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>Upload a photo of the PCR, or attach a PDF or DOCX document.</p>

        <input ref={imageInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        <input ref={docInputRef} type="file" accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />

        <div className="flex gap-2.5 mt-4">
          <button onClick={() => imageInputRef.current?.click()} disabled={uploadMutation.isPending} className="btn btn-primary flex-1">
            <Camera size={16} /> Take / choose photo
          </button>
          <button onClick={() => imageInputRef.current?.click()} disabled={uploadMutation.isPending} className="btn btn-soft flex-1">
            <ImageIcon size={16} /> Image
          </button>
        </div>

        <button onClick={() => docInputRef.current?.click()} disabled={uploadMutation.isPending} className="btn btn-soft btn-block mt-2.5">
          <FileUp size={16} /> Choose PDF or DOCX
        </button>

        {file ? (
          <div className="relative mt-4 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {kind === 'image' && previewUrl ? (
              <img src={previewUrl} alt="PCR preview" className="w-full object-cover" style={{ height: 220 }} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10" style={{ background: 'var(--surface-2)' }}>
                <FileText size={40} style={{ color: 'var(--green)' }} />
                <p className="text-sm font-bold mt-2.5 text-center px-4" style={{ color: 'var(--ink)' }}>{file.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{kind === 'pdf' ? 'PDF document' : kind === 'docx' ? 'Word document' : 'Document'}</p>
              </div>
            )}
            <button onClick={() => { setFile(null); setPreviewUrl(null); }} disabled={uploadMutation.isPending} className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center bg-black/60 text-white">
              <XIcon size={16} />
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed flex flex-col items-center justify-center" style={{ height: 150, borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <FileUp size={30} style={{ color: 'var(--muted-2)' }} />
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>No file selected yet</p>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Note (optional)</p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
          Add any quick context for dispatch (handover details, complications, missing fields, etc.).
        </p>
        <textarea
          className="eoc-textarea mt-3"
          placeholder="Write a short note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={uploadMutation.isPending}
        />
      </div>

      <div className="flex gap-3">
        <button onClick={skipForNow} disabled={uploadMutation.isPending} className="btn btn-ghost flex-1">
          Skip for now
        </button>
        <button onClick={submit} disabled={uploadMutation.isPending} className="btn flex-1" style={{ background: 'var(--nav-bg)', color: '#fff' }}>
          {uploadMutation.isPending ? <AppLoader size={22} /> : <CloudUpload size={18} />}
          {uploadMutation.isPending ? 'Saving…' : file ? 'Save & upload report' : 'Save report'}
        </button>
      </div>
    </div>
  );
}

export default PatientCareReportPage;
