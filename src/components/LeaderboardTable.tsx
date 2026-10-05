import { Fragment, useMemo, useState, type ReactNode } from "react";
import { LEADERBOARD_TOP_N } from "../config";
import { markerPosition, rankEntries, visibleRows, type LeaderboardEntry, type RankedEntry } from "../state/leaderboard";

interface Props {
  entries: readonly LeaderboardEntry[];
  aiScore: number;
  /** The current group's entry id (highlighted, and shown even when outside the top 10). */
  currentId?: string | null;
  /** Admin: show a Delete button per row. */
  onDelete?: (entry: LeaderboardEntry) => void;
  /** Admin: always show everyone. */
  showAll?: boolean;
}

/** Ranked leaderboard with FantasyXI's score as a fixed marker line (above it = beat FantasyXI). */
export function LeaderboardTable({ entries, aiScore, currentId = null, onDelete, showAll = false }: Props) {
  const ranked = useMemo(() => rankEntries(entries), [entries]);
  const [expanded, setExpanded] = useState(showAll);
  const marker = markerPosition(ranked, aiScore);
  const { top, extra, hidden } = visibleRows(ranked, currentId, expanded ? ranked.length : LEADERBOARD_TOP_N);

  if (ranked.length === 0) {
    return (
      <div className="board board--empty">
        <MarkerRow aiScore={aiScore} />
        <p className="hint">No scores yet. Be the first to take on FantasyXI!</p>
      </div>
    );
  }

  const row = (r: RankedEntry) => (
    <li key={r.entry.id} className={`board-row ${r.entry.id === currentId ? "board-row--current" : ""} ${r.entry.beatAI ? "board-row--beat" : ""}`} data-entry={r.entry.id}>
      <span className="board-row__rank">{r.rank}</span>
      <span className="board-row__name">
        {r.entry.teamName}
        {r.entry.id === currentId && <span className="board-row__you">you</span>}
      </span>
      <span className={`board-row__tag ${r.entry.beatAI ? "" : "board-row__tag--tie"}`}>{r.entry.beatAI ? "beat FantasyXI" : r.entry.score === r.entry.aiScore ? "tie" : ""}</span>
      <span className="board-row__score">{r.entry.score}</span>
      {onDelete && (
        <button type="button" className="btn btn--ghost btn--tiny" onClick={() => onDelete(r.entry)} aria-label={`Delete ${r.entry.teamName}`}>
          Delete
        </button>
      )}
    </li>
  );

  // Below the visible rows: the marker and (maybe) the current group, in true rank order, with "…" gaps.
  const gap = (key: string) => (
    <li key={key} className="board-row board-row--gap" aria-hidden="true">
      …
    </li>
  );
  const tail: { pos: number; node: ReactNode }[] = [];
  if (marker >= top.length) tail.push({ pos: marker - 0.5, node: <MarkerRow key="marker" aiScore={aiScore} /> });
  if (extra) tail.push({ pos: extra.rank - 1, node: row(extra) });
  tail.sort((a, b) => a.pos - b.pos);
  let shownUpTo = top.length - 1; // index of the last rank already on screen

  return (
    <div className={`board ${expanded ? "board--expanded" : ""}`}>
      <ol className="board__list" aria-label="Leaderboard">
        {top.map((r, i) => (
          <Fragment key={r.entry.id}>
            {i === marker && <MarkerRow aiScore={aiScore} />}
            {row(r)}
          </Fragment>
        ))}
        {tail.map((t, k) => {
          const needsGap = Math.ceil(t.pos) > shownUpTo + 1;
          shownUpTo = Math.max(shownUpTo, Math.floor(t.pos));
          return (
            <Fragment key={k}>
              {needsGap && gap(`gap-${k}`)}
              {t.node}
            </Fragment>
          );
        })}
      </ol>
      {!expanded && hidden > 0 && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setExpanded(true)}>
          See everyone ({ranked.length})
        </button>
      )}
    </div>
  );
}

function MarkerRow({ aiScore }: { aiScore: number }) {
  return (
    <li className="board-marker" aria-label={`FantasyXI scored ${aiScore}`}>
      <span className="board-marker__line" />
      <span className="board-marker__label">FantasyXI · {aiScore}</span>
      <span className="board-marker__line" />
    </li>
  );
}

/** Small top-3 list for the Attract screen. */
export function TopThree({ entries }: { entries: readonly LeaderboardEntry[] }) {
  const top = useMemo(() => rankEntries(entries).slice(0, 3), [entries]);
  if (top.length === 0) return <p className="top3 top3--empty">No scores yet. Be the first to take on FantasyXI!</p>;
  return (
    <ol className="top3" aria-label="Top 3">
      {top.map((r) => (
        <li key={r.entry.id} className="top3__row">
          <span className="top3__rank">{r.rank}</span>
          <span className="top3__name">{r.entry.teamName}</span>
          <span className="top3__score">{r.entry.score}</span>
        </li>
      ))}
    </ol>
  );
}
