import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]):not([tabindex="-1"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Index to focus after Tab / Shift+Tab inside a dialog with `count` focusable elements (wraps around). */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

/** Keeps keyboard focus inside `ref` while mounted (Tab wraps), and gives focus back to whatever had it
 *  before the dialog opened when it closes. Escape is handled by each dialog (only where it's safe). */
export function useFocusTrap(ref: RefObject<HTMLElement | null>): void {
  // Remember the opener during the FIRST RENDER: by the time effects run, an autoFocus field inside the
  // dialog has already taken focus.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) {
    opener.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  useEffect(() => {
    const before = opener.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[nextFocusIndex(i, items.length, e.shiftKey)]?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Return focus to where it was (if that element is still on the page). The opener's element can
      // be replaced by a re-render (e.g. a filled slot), so fall back to the same slot by its data-slot.
      if (before && document.contains(before)) before.focus();
      else if (before?.dataset.slot) document.querySelector<HTMLElement>(`[data-slot="${before.dataset.slot}"]`)?.focus();
    };
  }, [ref]);
}
