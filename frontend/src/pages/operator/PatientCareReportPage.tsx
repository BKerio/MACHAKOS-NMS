import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Camera, Image as ImageIcon, FileUp, CloudUpload, X as XIcon, LoaderCircle, FileText } from 'lucide-react';
import { uploadPatientCareReport, getErrorMessage } from '@/api/responder';
import { useNotificationStore } from '@/stores/notificationStore';
import { confirmDialog } from '@/lib/alert';

type FileKind = 'image' | 'pdf' | 'docx' | 'unknown';

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
    mutationFn: () => uploadPatientCareReport(taskId!, { note: note.trim() || undefined, file: file! }),
    onSuccess: () => {
      addNotification({ type: 'success', title: 'PCR uploaded', message: 'Case saved to History.' });
      navigate('/operator/history', { replace: true });
    },
    onError: (err) => addNotification({ type: 'error', title: 'Upload failed', message: getErrorMessage(err) }),
  });

  const submit = () => {
    if (!taskId) {
      addNotification({ type: 'error', title: 'Missing task', message: 'Please return to Assignment and try again.' });
      return;
    }
    if (!file) {
      addNotification({ type: 'error', title: 'Add a report', message: 'Take a photo, choose an image, or pick a PDF/DOCX file.' });
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
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Upload image or document + note</p>
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
          {uploadMutation.isPending ? <LoaderCircle size={18} className="animate-spin" /> : <CloudUpload size={18} />}
          {uploadMutation.isPending ? 'Uploading…' : 'Upload report'}
        </button>
      </div>
    </div>
  );
}

export default PatientCareReportPage;
