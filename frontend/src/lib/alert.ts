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

/** Centered modal confirmation - resolves true if confirmed, false if cancelled/dismissed. */
export async function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const result = await Swal.fire({
    ...BUTTON_STYLING,
    title: opts.title,
    text: opts.text,
    icon: opts.danger ? 'warning' : 'question',
    iconColor: opts.danger ? ICON_COLOR.error : ICON_COLOR.question,
    showCancelButton: true,
    confirmButtonText: opts.confirmLabel ?? 'Confirm',
    cancelButtonText: opts.cancelLabel ?? 'Cancel',
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      confirmButton: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
      cancelButton: 'btn btn-ghost',
      actions: 'swal-actions',
    },
  });
  return result.isConfirmed;
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
