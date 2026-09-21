/**
 * Google Identity Services (GIS) helper for field-crew Sign-In With Google.
 * Supports a custom "Continue with Google" button click (prompt) and an
 * official GIS button mount. Requires VITE_GOOGLE_CLIENT_ID (Web OAuth client).
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
            getNotDisplayedReason: () => string;
            getSkippedReason: () => string;
            getDismissedReason: () => string;
          }) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
              logo_alignment?: string;
            }
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
      if (window.google?.accounts?.id) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function getGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
}

export function isGoogleSignInConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

/**
 * Opens Google account chooser from a custom button click and resolves with
 * the ID token JWT. Uses GIS One Tap / FedCM prompt.
 */
export async function requestGoogleIdToken(): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Google Sign-In is not configured. Add VITE_GOOGLE_CLIENT_ID (Web OAuth client ID) to frontend/.env and restart Vite.'
    );
  }

  await loadGisScript();
  if (!window.google?.accounts?.id) {
    throw new Error('Google Sign-In failed to initialize.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        window.google?.accounts.id.cancel();
      } catch {
        /* ignore */
      }
      fn();
    };

    window.google!.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (!response.credential) {
          finish(() => reject(new Error('Google did not return a credential.')));
          return;
        }
        finish(() => resolve(response.credential));
      },
    });

    window.google!.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        finish(() =>
          reject(
            new Error(
              `Google sign-in could not open (${notification.getNotDisplayedReason()}). Check that this site is listed under Authorized JavaScript origins for your Web client ID.`
            )
          )
        );
      } else if (notification.isSkippedMoment()) {
        finish(() =>
          reject(new Error('Google sign-in was skipped. Try again, or use your phone number.'))
        );
      } else if (notification.isDismissedMoment()) {
        const reason = notification.getDismissedReason();
        if (reason === 'credential_returned') return; // success path via callback
        finish(() =>
          reject(new Error('Google sign-in was cancelled. You can also sign in with your phone number.'))
        );
      }
    });
  });
}

/**
 * Renders Google's official Sign-In button into [parent] as a fallback when
 * the prompt-based flow is blocked by the browser.
 */
export async function mountGoogleSignInButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void,
  onError?: (message: string) => void
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    onError?.(
      'Google Sign-In is not configured. Add VITE_GOOGLE_CLIENT_ID to frontend/.env and restart Vite.'
    );
    return;
  }

  try {
    await loadGisScript();
  } catch {
    onError?.('Failed to load Google Sign-In.');
    return;
  }

  if (!window.google?.accounts?.id) {
    onError?.('Google Sign-In failed to initialize.');
    return;
  }

  parent.replaceChildren();

  window.google.accounts.id.initialize({
    client_id: clientId,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: (response) => {
      if (!response.credential) {
        onError?.('Google did not return a credential.');
        return;
      }
      onCredential(response.credential);
    },
  });

  const width = Math.min(parent.clientWidth || 360, 400);
  window.google.accounts.id.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width,
    logo_alignment: 'left',
  });
}
