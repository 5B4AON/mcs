/**
 * Morse Code Studio
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0);
}

/** Focus the preferred control in a dialog, or the dialog itself as a fallback. */
export function focusDialog(dialog: HTMLElement, selector?: string): void {
  const focusable = getFocusableElements(dialog);
  const target = selector
    ? focusable.find(element => element.matches(selector))
    : focusable[0];
  (target ?? dialog).focus();
}

/** Keep keyboard tab navigation within an open dialog. */
export function trapDialogTabKey(event: KeyboardEvent, dialog: HTMLElement): void {
  if (event.defaultPrevented || event.key !== 'Tab') return;

  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!dialog.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Return focus to the opener, or to a visible fallback if the opener was hidden or removed. */
export function restoreDialogFocus(target: HTMLElement | null, fallback?: HTMLElement | null): void {
  window.setTimeout(() => {
    if (target?.isConnected && target.getClientRects().length > 0) {
      target.focus();
    } else if (fallback?.isConnected && fallback.getClientRects().length > 0) {
      fallback.focus();
    }
  }, 0);
}
