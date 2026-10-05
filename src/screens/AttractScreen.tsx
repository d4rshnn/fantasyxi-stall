import { TopThree } from "../components/LeaderboardTable";
import type { InitialData } from "../data/types";
import type { LeaderboardEntry } from "../state/leaderboard";

export function AttractScreen({ data, entries, onNext }: { data: InitialData; entries: readonly LeaderboardEntry[]; onNext: () => void }) {
  return (
    <main className="screen attract">
      <p className="screen__eyebrow">{data.gameweek.label}</p>
      <h1 className="screen__title">Build a team. Challenge our AI.</h1>
      <p className="attract__target">
        FantasyXI scored <strong>{data.gameweek.ai_target_score}</strong>. Can you beat it?
      </p>
      <button type="button" className="btn btn--primary btn--hero" onClick={onNext} autoFocus>
        Start
      </button>
      <section className="attract__board" aria-label="Top 3 today">
        <h2 className="attract__board-title">Top 3 today</h2>
        <TopThree entries={entries} />
      </section>
    </main>
  );
}
