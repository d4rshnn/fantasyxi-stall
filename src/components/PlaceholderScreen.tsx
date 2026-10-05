import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  body?: ReactNode;
  nextLabel?: string;
  onNext?: () => void;
  children?: ReactNode;
}

/** Temporary screen shell used until each real screen is built (S4-S8). */
export function PlaceholderScreen({ eyebrow, title, body, nextLabel = "Next", onNext, children }: Props) {
  return (
    <main className="screen">
      <p className="screen__eyebrow">{eyebrow}</p>
      <h1 className="screen__title">{title}</h1>
      {body && <p className="screen__body">{body}</p>}
      {children}
      {onNext && (
        <button className="btn btn--primary" onClick={onNext} autoFocus>
          {nextLabel}
        </button>
      )}
    </main>
  );
}
