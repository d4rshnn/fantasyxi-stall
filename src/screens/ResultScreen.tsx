import { Confetti } from "../components/Confetti";
import type { Outcome } from "../state/machine";

interface Props {
  teamName: string;
  outcome: Outcome | null;
  onContinue: () => void;
  onPlayAgain: () => void;
}

/** Three honest outcomes. A tie is not a win. Same rules and same real results decided both scores. */
export function ResultScreen({ teamName, outcome, onContinue, onPlayAgain }: Props) {
  if (!outcome) {
    return (
      <main className="screen">
        <h1 className="screen__title">No result yet</h1>
        <p className="screen__body">Play the gameweek first.</p>
        <button type="button" className="btn btn--ghost" onClick={onPlayAgain}>
          Play again
        </button>
      </main>
    );
  }
  const { human, ai } = outcome;
  const gap = Math.abs(human - ai);
  const kind = human > ai ? "win" : human < ai ? "loss" : "tie";
  const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;

  return (
    <main className={`screen result result--${kind}`}>
      {kind === "win" && <Confetti />}
      {kind === "win" && <span className="result__badge">★ Beat the AI</span>}
      <p className="screen__eyebrow">Full time · same rules, same real results</p>
      <h1 className="screen__title result__title">
        {kind === "win" ? "YOU BEAT FANTASYXI!" : kind === "loss" ? "FantasyXI wins" : "Dead heat with FantasyXI"}
      </h1>
      <div className="result__scores" aria-label={`${teamName} ${human}, FantasyXI ${ai}`}>
        <div className="result__side">
          <span className="result__name">{teamName}</span>
          <span className="result__score">{human}</span>
        </div>
        <span className="result__dash">–</span>
        <div className="result__side result__side--ai">
          <span className="result__name">FantasyXI</span>
          <span className="result__score">{ai}</span>
        </div>
      </div>
      <p className="screen__body">
        {kind === "win"
          ? `You outscored FantasyXI by ${pts(gap)}. Your picks beat our AI this week.`
          : kind === "loss"
            ? `FantasyXI won by ${pts(gap)}. Good effort: check the leaderboard and see how FantasyXI picked its team.`
            : "Exactly level. A tie doesn't count as a win, but you matched our AI point for point."}
      </p>
      <div className="row-actions">
        <button type="button" className="btn btn--ghost" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="btn btn--primary" onClick={onContinue} autoFocus>
          Leaderboard
        </button>
      </div>
    </main>
  );
}
