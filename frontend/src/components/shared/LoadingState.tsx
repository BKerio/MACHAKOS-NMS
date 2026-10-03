import type { CSSProperties } from 'react';
import AppLoader from './AppLoader';

interface LoadingStateProps {
  /** Short line under the loader, e.g. "Loading call logs…". */
  label?: string;
  /** Height to hold while loading, so the page doesn't jump when data lands. */
  minHeight?: number;
  /** Loader size in px. */
  size?: number;
  /** Loader beside the label on one line - for table cells and tight spots. */
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The one loading indicator for the dashboard: the sign-in page's spoked
 * AppLoader, centred, with an optional label. Use it instead of skeleton
 * blocks, pulsing placeholders or bare "Loading…" text.
 */
function LoadingState({ label, minHeight, size, inline = false, className, style }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${inline ? 'flex-row gap-2.5' : 'flex-col gap-3'}${className ? ` ${className}` : ''}`}
      style={{ minHeight, padding: inline ? undefined : 24, ...style }}
    >
      <AppLoader size={size ?? (inline ? 18 : 28)} color="var(--green)" />
      <span
        className={label ? 'text-[13px] font-medium' : 'sr-only'}
        style={label ? { color: 'var(--muted)' } : undefined}
      >
        {label ?? 'Loading'}
      </span>
    </div>
  );
}

export default LoadingState;
