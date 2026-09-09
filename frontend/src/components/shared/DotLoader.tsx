import { Loader2 } from 'lucide-react';

/** Small inline spinner for buttons mid-mutation, e.g. `{isPending ? <DotLoader size={14} /> : <SaveIcon size={14} />}`. */
function DotLoader({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden="true" />;
}

export default DotLoader;
