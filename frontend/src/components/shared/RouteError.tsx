import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

/**
 * Route-level errorElement. A crash while rendering one page lands here instead of
 * React Router's default developer screen, so the user can retry or move on.
 * The router clears it automatically on the next navigation.
 */
function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  // After a deploy, an open tab can reference lazy chunks that no longer exist.
  const staleBundle =
    error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : staleBundle
      ? 'A newer version of the app is available. Reload to continue.'
      : 'This page hit an unexpected problem. Your data is safe - try again or go back.';

  if (error) console.error(error);

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <AlertTriangle size={44} style={{ color: 'var(--red)' }} />
      <h2 className="font-sans text-xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
        Something went wrong
      </h2>
      <p className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{message}</p>
      <div className="flex gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-ghost px-4 py-2 text-sm">Go Back</button>
        <button onClick={() => window.location.reload()} className="btn btn-primary px-5 py-2 text-sm">Reload</button>
      </div>
    </div>
  );
}

export default RouteError;
