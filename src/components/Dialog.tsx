import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface Props {
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
}

/** A simple modal dialog. Escape closes it when onClose is given. Focus starts on the first action. */
export function Dialog({ title, children, actions, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(".dialog__actions button")?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2 id="dialog-title" className="dialog__title">
          {title}
        </h2>
        {children && <div className="dialog__body">{children}</div>}
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  );
}
