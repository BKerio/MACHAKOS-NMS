import Swal from 'sweetalert2';

/**
 * Central SweetAlert2 wrapper - every popup/toast/confirm dialog in the app
 * should go through here so styling stays consistent and on-brand.
 */

const BUTTON_STYLING = { buttonsStyling: false } as const;

const ICON_COLOR: Record<'success' | 'error' | 'warning' | 'info' | 'question', string> = {
  success: '#169A5B',
  error: '#D62828',
  warning: '#B7791F',
  info: '#2563EB',
  question: '#1B5FAC',
};

/** Toast-style popup in the top-right corner, auto-dismisses - for success/info/warning/error notices. */
export function notify(type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) {
  return Swal.fire({
    ...BUTTON_STYLING,
    toast: true,
    position: 'top-end',
    icon: type,
    iconColor: ICON_COLOR[type],
    title,
    text: message,
    showConfirmButton: false,
    timer: 5000,
    timerProgressBar: true,
    customClass: { popup: 'swal-toast' },
  });
}

interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) and uses the warning icon. */
  danger?: boolean;
}

// Lucide icon paths (24x24, stroke) for the dialog's icon tile.
const ICONS = {
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
} as const;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const iconTile = (icon: keyof typeof ICONS, tone: 'danger' | 'accent') =>
  `<div class="eoc-dlg-icon ${tone}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg></div>`;

/** The shared confirm look: icon tile, title, text, optional extra block, full-width buttons. */
async function fireConfirm(opts: {
  icon: keyof typeof ICONS;
  danger: boolean;
  title: string;
  text?: string;
  extraHtml?: string;
  confirmLabel: string;
  cancelLabel: string;
}): Promise<boolean> {
  const tone = opts.danger ? 'danger' : 'accent';
  const result = await Swal.fire({
    ...BUTTON_STYLING,
    html: `
      <div class="eoc-dlg-body">
        ${iconTile(opts.icon, tone)}
        <h2 class="eoc-dlg-title">${escapeHtml(opts.title)}</h2>
        ${opts.text ? `<p class="eoc-dlg-text">${escapeHtml(opts.text)}</p>` : ''}
        ${opts.extraHtml ?? ''}
      </div>`,
    showCancelButton: true,
    confirmButtonText: opts.confirmLabel,
    cancelButtonText: opts.cancelLabel,
    reverseButtons: true,
    focusCancel: true,
    showClass: { popup: 'eoc-dlg-in' },
    hideClass: { popup: 'eoc-dlg-out' },
    customClass: {
      popup: 'eoc-dlg',
      htmlContainer: 'eoc-dlg-html',
      confirmButton: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
      cancelButton: 'btn btn-ghost',
      actions: 'eoc-dlg-actions',
    },
  });
  return result.isConfirmed;
}

/** Centered modal confirmation - resolves true if confirmed, false if cancelled/dismissed. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return fireConfirm({
    icon: opts.danger ? 'warning' : 'question',
    danger: !!opts.danger,
    title: opts.title,
    text: opts.text,
    confirmLabel: opts.confirmLabel ?? 'Confirm',
    cancelLabel: opts.cancelLabel ?? 'Cancel',
  });
}

/** Sign-out confirmation: shows who is signed in, so a shared console is never logged out by mistake. */
export function confirmSignOut(user?: { name?: string | null; role?: string | null; email?: string | null } | null): Promise<boolean> {
  const name = user?.name?.trim() || 'Your account';
  const initials = name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const role = user?.role ? user.role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  const sub = [role, user?.email].filter(Boolean).join(' · ');
  return fireConfirm({
    icon: 'logout',
    danger: true,
    title: 'Sign out?',
    text: "You'll need to sign in again to use the dashboard.",
    extraHtml: `
      <div class="eoc-dlg-user">
        <span class="eoc-dlg-av">${escapeHtml(initials)}</span>
        <span class="eoc-dlg-who">
          <b>${escapeHtml(name)}</b>
          ${sub ? `<span>${escapeHtml(sub)}</span>` : ''}
        </span>
      </div>`,
    confirmLabel: 'Sign out',
    cancelLabel: 'Stay signed in',
  });
}

/** Simple informational alert with a single acknowledge button. */
export function alertInfo(title: string, text?: string) {
  return Swal.fire({
    ...BUTTON_STYLING,
    title,
    text,
    icon: 'info',
    iconColor: ICON_COLOR.info,
    confirmButtonText: 'OK',
    customClass: { confirmButton: 'btn btn-primary', actions: 'swal-actions' },
  });
}
