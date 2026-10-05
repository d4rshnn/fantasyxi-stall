import { useMemo } from "react";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { rankEntries, type LeaderboardEntry } from "../state/leaderboard";

interface Props {
  entries: readonly LeaderboardEntry[];
  aiScore: number;
  currentId: string | null;
  onExplainer: () => void;
  onPlayAgain: () => void;
}

export function LeaderboardScreen({ entries, aiScore, currentId, onExplainer, onPlayAgain }: Props) {
  const rank = useMemo(() => rankEntries(entries).find((r) => r.entry.id === currentId)?.rank, [entries, currentId]);
  return (
    <main className="screen screen--top leaderboard">
      <p className="screen__eyebrow">Today at the stall</p>
      <h1 className="screen__title">Leaderboard</h1>
      {rank !== undefined && (
        <p className="screen__body">
          You're <strong>#{rank}</strong> of {entries.length}.
        </p>
      )}
      <LeaderboardTable entries={entries} aiScore={aiScore} currentId={currentId} />
      <div className="row-actions">
        <button type="button" className="btn btn--ghost" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="btn btn--primary" onClick={onExplainer} autoFocus>
          How did FantasyXI do it?
        </button>
      </div>
    </main>
  );
}
