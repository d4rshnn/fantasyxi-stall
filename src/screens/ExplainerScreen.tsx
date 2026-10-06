import { Fragment, useEffect, useRef, type Dispatch, type ReactNode } from "react";
import type { EngineContext } from "../engine";
import { buildExplainerData, type ExplainerData } from "../state/explainer";
import type { RevealState } from "../state/reveal";
import type { Action } from "../state/machine";

interface Props {
  ctx: EngineContext;
  reveal: RevealState;
  locked: boolean;
  dispatch: Dispatch<Action>;
  onLeaderboard: () => void;
  onPlayAgain: () => void;
}

/** One-page "How FantasyXI works". Every sentence here is backed by CLAUDE.md "Verified AI facts",
 *  docs/DATA_SOURCE.md or docs/PHASE2_REPORT.md (see the sentence table agreed for this screen).
 *  Numbers come from buildExplainerData(). */
export function ExplainerScreen({ ctx, reveal, locked, dispatch, onLeaderboard, onPlayAgain }: Props) {
  // After a refresh FantasyXI's data may need reloading (allowed: the team is locked).
  useEffect(() => {
    if (locked && reveal.status === "idle") dispatch({ type: "REVEAL_REQUEST" });
  }, [locked, reveal.status, dispatch]);

  if (!locked) {
    return (
      <main className="screen">
        <h1 className="screen__title">How FantasyXI works</h1>
        <p className="screen__body">Finish a game first, then see how FantasyXI built its team.</p>
        <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
          Play again
        </button>
      </main>
    );
  }
  if (reveal.status === "error") {
    return (
      <main className="screen" role="alert">
        <h1 className="screen__title">Couldn't load FantasyXI's data</h1>
        <p className="screen__body">{reveal.message.replace(/^Couldn't load FantasyXI's team\. /, "")}</p>
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" onClick={onLeaderboard}>
            Leaderboard
          </button>
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "REVEAL_REQUEST" })} autoFocus>
            Retry
          </button>
        </div>
      </main>
    );
  }
  if (reveal.status !== "ready") {
    return (
      <main className="screen" aria-busy="true">
        <h1 className="screen__title">Loading…</h1>
      </main>
    );
  }
  return <HowItWorks data={buildExplainerData(reveal.reveal, ctx)} onLeaderboard={onLeaderboard} onPlayAgain={onPlayAgain} />;
}

interface Box {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  text: ReactNode;
  accent?: boolean;
}

function HowItWorks({ data: d, onLeaderboard, onPlayAgain }: { data: ExplainerData; onLeaderboard: () => void; onPlayAgain: () => void }) {
  // Focus Play again for keyboard users without scrolling the page (the diagram stays in view).
  const playAgain = useRef<HTMLButtonElement>(null);
  useEffect(() => playAgain.current?.focus({ preventScroll: true }), []);
  const boxes: Box[] = [
    { id: "data", icon: <IconData />, title: "Data", text: "Past player stats and prices." },
    { id: "dl", icon: <IconNetwork />, title: "Deep learning (BiLSTM)", text: "Reads each player's last 5 gameweeks." },
    { id: "pred", icon: <IconChart />, title: "Predicted points", text: "Tree models turn that into an estimated score for every player." },
    {
      id: "opt",
      icon: <IconGears />,
      title: (
        <>
          RL & optimisation layer <span className="arch__bracket">(PPO strategy + MILP optimiser)</span>
        </>
      ),
      text: "The optimiser builds the best legal squad within £100m; over a season, PPO decides how bold to be.",
    },
    {
      id: "xi",
      icon: <IconShirt />,
      title: "Final XI",
      accent: true,
      text: (
        <>
          FantasyXI's team for this week
          <span className="arch__facts">
            <span>{d.formation}</span>
            <span>Captain: {d.captainName}</span>
            <span>
              <strong>{d.aiTotal}</strong> points
            </span>
          </span>
        </>
      ),
    },
  ];

  return (
    <main className="how">
      <h1 className="how__title">How FantasyXI works</h1>

      <ol className="arch" aria-label="How FantasyXI picks its team, step by step">
        {boxes.map((b, i) => (
          <Fragment key={b.id}>
            {i > 0 && (
              <li className="arch__arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="32" height="32">
                  <path d="M4 12h14m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
            )}
            <li className={`arch__box ${b.accent ? "arch__box--accent" : ""}`}>
              <span className="arch__icon" aria-hidden="true">
                {b.icon}
              </span>
              <h2 className="arch__title">{b.title}</h2>
              <p className="arch__text">{b.text}</p>
            </li>
          </Fragment>
        ))}
      </ol>

      <p className="how__note">
        In a single week like this one, the strategy layer kept the optimiser's squad as it was, so most of the work here came from the predictions and the optimiser.
      </p>

      <details className="learn-more">
        <summary>Learn more (for the curious)</summary>
        <ul>
          <li>The BiLSTM turns each player's history into a summary; three tree models (LightGBM) use it to make the final points estimate.</li>
          <li>That estimate is then blended: 65% model and 35% a price-based guess, with a boost of up to 20% for players in good form, and a minimum of 6.5 for players costing £9.5m or more.</li>
          <li>
            Captain: the starter with the highest predicted points × a position weight (forwards ×1.25, midfielders ×1.2, defenders ×0.85, goalkeepers ×0.5). The second highest is
            vice-captain.
          </li>
          <li>The squad and the starting 11 are each picked by a MILP optimiser (a maths solver), not by reinforcement learning.</li>
          <li>PPO outputs strategy settings (aggressiveness, budget, position bias). This week it asked for a wildcard, but chips are switched off at the stall, so nothing changed.</li>
          <li>
            A flaw we found: because of a data-matching bug in our pipeline, {d.flaggedPlayers} of the {d.totalPlayers} players this week got an estimate meant for a different player from an
            earlier season.
          </li>
          <li>
            {d.flaggedPicks} of FantasyXI's 15 picks were chosen using one of those estimates. This leaked no 2025-26 results, but those picks weren't based on a real estimate for that player.
          </li>
        </ul>
      </details>

      <footer className="row-actions how__actions">
        <button type="button" className="btn btn--ghost" onClick={onLeaderboard}>
          Leaderboard
        </button>
        <button type="button" className="btn btn--primary" onClick={onPlayAgain} ref={playAgain}>
          Play again
        </button>
      </footer>
    </main>
  );
}

// ---- Simple line icons (decorative) ----

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    {children}
  </svg>
);

const IconData = () => (
  <Svg>
    <ellipse cx="24" cy="11" rx="15" ry="5" />
    <path d="M9 11v26c0 2.8 6.7 5 15 5s15-2.2 15-5V11" />
    <path d="M9 24c0 2.8 6.7 5 15 5s15-2.2 15-5" />
  </Svg>
);

const IconNetwork = () => (
  <Svg>
    <circle cx="10" cy="14" r="4" />
    <circle cx="10" cy="34" r="4" />
    <circle cx="24" cy="10" r="4" />
    <circle cx="24" cy="24" r="4" />
    <circle cx="24" cy="38" r="4" />
    <circle cx="38" cy="24" r="4" />
    <path d="M14 14l6-3M14 15l6 7M14 33l6-7M14 34l6 3M28 11l6 11M28 24h6M28 37l6-11" />
  </Svg>
);

const IconChart = () => (
  <Svg>
    <path d="M6 42h36" />
    <path d="M12 36V26M21 36V18M30 36V22M39 36V10" strokeWidth="5" />
  </Svg>
);

const IconGears = () => (
  <Svg>
    <circle cx="18" cy="20" r="6" />
    <path d="M18 8v4M18 28v4M6 20h4M26 20h4M9.5 11.5l2.8 2.8M23.7 25.7l2.8 2.8M9.5 28.5l2.8-2.8M23.7 14.3l2.8-2.8" />
    <circle cx="34" cy="34" r="4" />
    <path d="M34 26v3M34 39v3M26 34h3M39 34h3" />
  </Svg>
);

const IconShirt = () => (
  <Svg>
    <path d="M17 6l-11 7 5 8 4-2v23h18V19l4 2 5-8-11-7c-1 3-4 5-7 5s-6-2-7-5z" />
  </Svg>
);
