import type { TaskStatus } from '@/types/api';
import { STATUS_LABELS, STATUS_PILL } from '@/utils/taskStatus';

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`pill ${STATUS_PILL[status]}`}>{STATUS_LABELS[status]}</span>;
}

export default StatusBadge;
