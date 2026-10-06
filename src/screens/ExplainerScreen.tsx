import { useEffect, useMemo, useState, type Dispatch, type ReactNode } from "react";
import { POSITIONS, type EngineContext } from "../engine";
import { shortName } from "../components/names";
import { buildExplainerData, EXPLAINER_STEPS, moveStep, type ExplainerData } from "../state/explainer";
import type { RevealState } from "../state/reveal";
import type { Action } from "../state/machine";

interface Props {
  ctx: EngineContext;
  reveal: RevealState;
  locked: boolean;
  humanScore: number | null;
  dispatch: Dispatch<Action>;
  onLeaderboard: () => void;
  onPlayAgain: () => void;
}

const TITLES = ["Predict", "Shortlist", "Optimise", "Pick the XI and captain", "Play the gameweek"];

/** "How did FantasyXI build its team?" Every sentence here is backed by CLAUDE.md "Verified AI facts"
 *  or docs/DATA_SOURCE.md (see the S8 sentence table). Numbers come from buildExplainerData(). */
export function ExplainerScreen({ ctx, reveal, locked, humanScore, dispatch, onLeaderboard, onPlayAgain }: Props) {
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
  return <Steps data={buildExplainerData(reveal.reveal, ctx)} humanScore={humanScore} onLeaderboard={onLeaderboard} onPlayAgain={onPlayAgain} />;
}

function Steps({ data, humanScore, onLeaderboard, onPlayAgain }: { data: ExplainerData; humanScore: number | null; onLeaderboard: () => void; onPlayAgain: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === EXPLAINER_STEPS - 1;

  // Keyboard: arrows move, Enter = next (unless a button/summary has focus), Escape = skip to the end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, summary, a, input");
      if (e.key === "ArrowRight") setStep((s) => moveStep(s, 1));
      else if (e.key === "ArrowLeft") setStep((s) => moveStep(s, -1));
      else if (e.key === "Enter" && !onControl) setStep((s) => moveStep(s, 1));
      else if (e.key === "Escape") setStep(EXPLAINER_STEPS - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const content = useMemo(() => stepContent(step, data, humanScore), [step, data, humanScore]);

  return (
    <main className="explainer" aria-roledescription="explainer">
      <header className="explainer__top">
        <p className="screen__eyebrow">How did FantasyXI build its team?</p>
        <ol className="explainer__dots" aria-label="Steps">
          {TITLES.map((t, i) => (
            <li key={t}>
              <button type="button" className={`ex-dot ${i === step ? "ex-dot--on" : i < step ? "ex-dot--done" : ""}`} aria-label={`Step ${i + 1}: ${t}`} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)} />
            </li>
          ))}
        </ol>
        {!last && (
          <button type="button" className="btn btn--ghost btn--small explainer__skip" onClick={() => setStep(EXPLAINER_STEPS - 1)}>
            Skip
          </button>
        )}
      </header>

      <section className="explainer__step" key={step} aria-live="polite">
        <p className="explainer__num">Step {step + 1} of {EXPLAINER_STEPS}</p>
        <h1 className="explainer__title">{TITLES[step]}</h1>
        <div className="explainer__grid">
          <div className="explainer__text">{content.text}</div>
          <div className="explainer__diagram" aria-hidden="true">
            {content.diagram}
          </div>
        </div>
        {content.example && <div className="explainer__example">{content.example}</div>}
      </section>

      {last && <EndNotes data={data} />}

      <footer className="builder-footer explainer__nav">
        <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => moveStep(s, -1))} disabled={step === 0}>
          Back
        </button>
        {!last ? (
          <button type="button" className="btn btn--primary" onClick={() => setStep((s) => moveStep(s, 1))} autoFocus>
            Next
          </button>
        ) : (
          <span className="row-actions">
            <button type="button" className="btn btn--ghost" onClick={onLeaderboard}>
              Leaderboard
            </button>
            <button type="button" className="btn btn--primary" onClick={onPlayAgain} autoFocus>
              Play again
            </button>
          </span>
        )}
      </footer>
    </main>
  );
}

function stepContent(step: number, d: ExplainerData, humanScore: number | null): { text: ReactNode; diagram: ReactNode; example?: ReactNode } {
  switch (step) {
    case 0:
      return {
        text: (
          <>
            <p>First, FantasyXI estimates how many points each player will score this week.</p>
            <p>A neural network called a BiLSTM reads each player's last 5 gameweeks.</p>
            <p>Tree models (LightGBM) turn that into a points estimate.</p>
            <p>The estimate is then blended with the player's price and recent form.</p>
          </>
        ),
        diagram: <PredictDiagram />,
        example:
          d.examples.length > 0 ? (
            <>
              <p className="explainer__example-lead">Some of FantasyXI's estimates for its own starters, and what really happened:</p>
              <table className="est-table">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Estimate</th>
                    <th scope="col">Real points</th>
                  </tr>
                </thead>
                <tbody>
                  {d.examples.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className="est-table__name">{e.name}</span> <span className="est-table__club">{e.club}</span>
                      </td>
                      <td>{e.estimate.toFixed(1)}</td>
                      <td className={e.actual >= e.estimate ? "pts--plus" : "pts--minus"}>{e.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">Estimates are only estimates: some were close, some were way off.</p>
            </>
          ) : undefined,
      };
    case 1:
      return {
        text: (
          <>
            <p>Out of {d.totalPlayers} players, FantasyXI keeps a shortlist of the most promising ones.</p>
            <p>It takes the top estimates in each position, plus the most expensive stars and players in good form.</p>
          </>
        ),
        diagram: <ShortlistDiagram d={d} />,
        example: (
          <p>
            This week's shortlist: <strong>{d.pool.GK}</strong> goalkeepers, <strong>{d.pool.DEF}</strong> defenders, <strong>{d.pool.MID}</strong> midfielders and{" "}
            <strong>{d.pool.FWD}</strong> forwards.
          </p>
        ),
      };
    case 2:
      return {
        text: (
          <>
            <p>A solver (a maths optimiser) picks the best legal 15-player squad it can find.</p>
            <p>
              It follows the same rules you did: {d.budget.replace(".0m", "m")}, {d.squadPositions.GK} goalkeepers, {d.squadPositions.DEF} defenders, {d.squadPositions.MID} midfielders,{" "}
              {d.squadPositions.FWD} forwards, max {d.maxPerClub} per club.
            </p>
          </>
        ),
        diagram: <OptimiseDiagram d={d} />,
        example: (
          <p>
            FantasyXI's squad cost <strong>{d.squadCost}</strong> of {d.budget}.
          </p>
        ),
      };
    case 3:
      return {
        text: (
          <>
            <p>A second optimiser picks the starting 11 with the highest total estimate.</p>
            <p>For captain, it multiplies each starter's estimate by a position weight: forwards ×1.25, midfielders ×1.2, defenders ×0.85, goalkeepers ×0.5.</p>
            <p>The highest becomes captain and the second highest vice-captain.</p>
          </>
        ),
        diagram: <XiDiagram d={d} />,
        example: (
          <>
            <p>This week it chose a {d.formation}.</p>
            <p>
              Captain: <strong>{d.captain.name}</strong>
              {d.captain.score !== null && ` (${d.captain.estimate!.toFixed(1)} × ${d.captain.weight} = ${d.captain.score.toFixed(1)})`}. Vice: <strong>{d.vice.name}</strong>
              {d.vice.score !== null && ` (${d.vice.estimate!.toFixed(1)} × ${d.vice.weight} = ${d.vice.score.toFixed(1)})`}.
            </p>
          </>
        ),
      };
    default:
      return {
        text: (
          <>
            <p>Then the real Gameweek {d.gameweek} results decide the score, for FantasyXI and for you.</p>
            <p>Both teams use exactly the same scoring rules.</p>
          </>
        ),
        diagram: <PlayDiagram ai={d.aiTotal} human={humanScore} />,
        example: (
          <>
            <p>
              FantasyXI scored <strong>{d.aiTotal}</strong>: {d.startingPoints} from its starting 11 plus {d.captainBonus} captain bonus ({shortName(d.activeCaptainName, 16)}).
            </p>
            {d.autoSubCount > 0 && (
              <p>
                {d.autoSubCount} of its starters didn't play, so bench players came on automatically.
              </p>
            )}
            {humanScore !== null && (
              <p>
                Your team scored <strong>{humanScore}</strong>.
              </p>
            )}
          </>
        ),
      };
  }
}

function EndNotes({ data }: { data: ExplainerData }) {
  return (
    <section className="explainer__notes">
      <p className="explainer__footnote">
        FantasyXI also has a reinforcement-learning layer (PPO) for season-long strategy. In a single week like this, it kept the optimised squad.
      </p>
      <details className="learn-more">
        <summary>Learn more (for the curious)</summary>
        <ul>
          <li>The BiLSTM and tree models were trained on seasons 2016-17 to 2023-24; 2025-26 was kept as the test season.</li>
          <li>
            We can't fully prove the estimates used no future information: one input (chance of playing) came from a script we no longer have, and some settings may have been tuned while
            looking at 2025-26.
          </li>
          <li>The final estimate is 65% model and 35% a price-based guess, with a boost of up to 20% for players in good form and a minimum of 6.5 for players costing £9.5m or more.</li>
          <li>Form only uses earlier gameweeks, never the week being estimated.</li>
          <li>
            A flaw we found: because of a data-matching bug in our pipeline, {data.flaggedPlayers} of the {data.totalPlayers} players this week got an estimate meant for a different player from an
            earlier season.
          </li>
          <li>
            {data.flaggedPicks} of FantasyXI's 15 picks were chosen using one of those estimates. This leaked no 2025-26 results, but those picks weren't based on a real estimate for that player.
          </li>
          <li>That's why the examples above only use players with a genuine estimate.</li>
          <li>PPO asked for a "wildcard" this week, but chips are switched off at the stall, so nothing changed.</li>
          <li>Auto-subs here don't check the formation, so FantasyXI's goalkeeper was replaced by a defender. The same rule applied to your team.</li>
        </ul>
      </details>
    </section>
  );
}

// ---- Simple diagrams (CSS/SVG; decorative, hidden from screen readers) -------------------------

function PredictDiagram() {
  return (
    <div className="dia dia--predict">
      {/* No gameweek numbers on purpose: which exact weeks the model reads was never verified. */}
      <div className="dia__gws">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="dia__gw dia__gw--blank" style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
      <span className="dia__caption">Last 5 gameweeks</span>
      <span className="dia__arrow">↓</span>
      <span className="dia__box">BiLSTM</span>
      <span className="dia__arrow">↓</span>
      <span className="dia__box">Tree models</span>
      <span className="dia__arrow">↓</span>
      <span className="dia__box dia__box--accent">Estimate · blended with price & form</span>
    </div>
  );
}

function ShortlistDiagram({ d }: { d: ExplainerData }) {
  return (
    <div className="dia dia--funnel">
      <svg viewBox="0 0 200 120" className="dia__svg">
        <polygon points="10,10 190,10 130,110 70,110" className="dia__funnel" />
      </svg>
      <span className="dia__funnel-top">{d.totalPlayers} players</span>
      <span className="dia__funnel-bottom">{d.poolTotal} shortlisted</span>
    </div>
  );
}

function OptimiseDiagram({ d }: { d: ExplainerData }) {
  const cost = Number(d.squadCost.replace(/[£m]/g, ""));
  const budget = Number(d.budget.replace(/[£m]/g, ""));
  return (
    <div className="dia dia--optimise">
      <div className="dia__budget">
        <span className="dia__budget-fill" style={{ width: `${(cost / budget) * 100}%` }} />
      </div>
      <span className="dia__caption">
        {d.squadCost} / {d.budget}
      </span>
      <div className="dia__squad">
        {POSITIONS.map((p) => (
          <div key={p} className="dia__squad-row">
            <span className="dia__pos">{p}</span>
            {Array.from({ length: d.squadPositions[p] }, (_, i) => (
              <span key={i} className="dia__chip" />
            ))}
          </div>
        ))}
      </div>
      <span className="dia__caption">max {d.maxPerClub} per club</span>
    </div>
  );
}

function XiDiagram({ d }: { d: ExplainerData }) {
  const [def, mid, fwd] = d.formation.split("-").map(Number) as [number, number, number];
  // C and V go on the rows of the real captain's and vice's positions.
  const marksFor = (pos: string) => [d.captain.position === pos ? "C" : null, d.vice.position === pos ? "V" : null].filter(Boolean) as string[];
  const row = (n: number, marks: (string | null)[] = []) => (
    <div className="dia__xi-row">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={`dia__dot ${marks[i] ? "dia__dot--mark" : ""}`}>
          {marks[i]}
        </span>
      ))}
    </div>
  );
  return (
    <div className="dia dia--xi">
      {row(fwd, marksFor("FWD"))}
      {row(mid, marksFor("MID"))}
      {row(def, marksFor("DEF"))}
      {row(1, marksFor("GK"))}
      <span className="dia__caption">{d.formation}</span>
    </div>
  );
}

function PlayDiagram({ ai, human }: { ai: number; human: number | null }) {
  return (
    <div className="dia dia--play">
      <div className="dia__score">
        <span className="dia__score-label">You</span>
        <span className="dia__score-value">{human ?? "–"}</span>
      </div>
      <span className="dia__vs">vs</span>
      <div className="dia__score dia__score--ai">
        <span className="dia__score-label">FantasyXI</span>
        <span className="dia__score-value">{ai}</span>
      </div>
    </div>
  );
}
