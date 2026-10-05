import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import {
  assertReplayTotals,
  buildReplay,
  POSITIONS,
  resultsById,
  scoreTeam,
  type EngineContext,
  type PointEventKind,
  type Replay,
  type ReplayStep,
  type Reveal,
  type Side,
  type Team,
} from "../engine";
import { KitBadge } from "../components/PlayerCard";
import { shortName } from "../components/names";
import { SPEEDS, stepDelay, viewAt, type PlaybackView, type Speed } from "../state/playback";
import type { Action } from "../state/machine";

interface Props {
  ctx: EngineContext;
  teamName: string;
  humanTeam: Team;
  aiTeam: Team;
  reveal: Reveal;
  dispatch: Dispatch<Action>;
}

/** Replays the real gameweek for both teams. Everything shown comes from the scoring engine's result
 *  (scoreTeam) and the real results; the replay only decides the order and pace of telling it. */
export function SimulateScreen({ ctx, teamName, humanTeam, aiTeam, reveal, dispatch }: Props) {
  const replay = useMemo(() => {
    const results = resultsById(reveal.results);
    const r = buildReplay({
      ctx,
      fixtures: reveal.fixtures,
      results,
      human: { team: humanTeam, score: scoreTeam(humanTeam, results) },
      ai: { team: aiTeam, score: scoreTeam(aiTeam, results) },
    });
    if (import.meta.env.DEV) assertReplayTotals(r); // must end exactly on the engine totals
    return r;
  }, [ctx, reveal, humanTeam, aiTeam]);

  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const view = useMemo(() => viewAt(replay, index), [replay, index]);

  // Advance one step at a time.
  useEffect(() => {
    if (paused || view.finished) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), stepDelay(replay, index, speed));
    return () => window.clearTimeout(id);
  }, [replay, index, speed, paused, view.finished]);

  // Store the final totals (the engine's) for the Result screen.
  useEffect(() => {
    if (view.finished) dispatch({ type: "SIMULATION_FINISHED", outcome: replay.totals, finishedAt: Date.now() });
  }, [view.finished, replay, dispatch]);

  const names = { human: teamName, ai: "FantasyXI" };
  return (
    <main className="sim">
      <header className="sim__header">
        <ScoreBox label={names.human} value={view.score.human} />
        <div className="sim__middle">
          <FixtureBanner replay={replay} view={view} ctx={ctx} />
          <ol className="sim__progress" aria-label="Matches">
            {view.fixtureStatus.map((f, k) => (
              <li key={k} className={`dot dot--${f}`} />
            ))}
          </ol>
        </div>
        <ScoreBox label={names.ai} value={view.score.ai} ai />
      </header>

      <div className="sim__controls" role="group" aria-label="Replay controls">
        {!view.finished && (
          <>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setPaused(!paused)}>
              {paused ? "Resume" : "Pause"}
            </button>
            <span className="segmented" role="radiogroup" aria-label="Speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={speed === s} className={`chip ${speed === s ? "chip--on" : ""}`} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </span>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setIndex(replay.steps.length - 1)}>
              Skip to final
            </button>
          </>
        )}
        {view.finished && (
          <div className="sim__final">
            <span className="sim__final-label">Final score</span>
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "GOTO", screen: "result" })} autoFocus>
              Continue
            </button>
          </div>
        )}
      </div>

      <div className="sim__body">
        <TeamList side="human" title={names.human} team={humanTeam} replay={replay} view={view} ctx={ctx} />
        <Feed replay={replay} view={view} ctx={ctx} names={names} />
        <TeamList side="ai" title={names.ai} team={aiTeam} replay={replay} view={view} ctx={ctx} />
      </div>
    </main>
  );
}

// ---- Score counter ---------------------------------------------------------------------------

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts up/down to the new value in under 300 ms (instantly with reduced motion). */
function ScoreBox({ label, value, ai }: { label: string; value: number; ai?: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) return setShown(value);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 250);
      setShown(Math.round(a + (value - a) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return (
    <div className={`score-box ${ai ? "score-box--ai" : ""}`}>
      <span className="score-box__label">{label}</span>
      <span className="score-box__value" aria-live="polite" data-score={value}>
        {shown}
      </span>
    </div>
  );
}

// ---- Fixture banner --------------------------------------------------------------------------

function FixtureBanner({ replay, view, ctx }: { replay: Replay; view: PlaybackView; ctx: EngineContext }) {
  if (view.finished) return <div className="fixture-banner fixture-banner--final">Full time: all matches</div>;
  const g = replay.fixtures[view.currentFixture];
  if (!g) return <div className="fixture-banner">Kick-off…</div>;
  if (!g.fixture) return <div className="fixture-banner">Other matches</div>;
  const f = g.fixture;
  const club = (id: number) => ctx.teams.get(id)?.short_name ?? "?";
  const done = view.fixtureStatus[view.currentFixture] === "finished";
  return (
    <div className="fixture-banner" aria-live="polite">
      <span>{club(f.home_team_id)}</span>
      <span className={`fixture-banner__score ${done ? "fixture-banner__score--done" : ""}`}>{done ? `${f.home_score} – ${f.away_score}` : "– : –"}</span>
      <span>{club(f.away_team_id)}</span>
    </div>
  );
}

// ---- Feed ------------------------------------------------------------------------------------

const ICONS: Record<PointEventKind, string> = {
  played60: "⏱",
  played: "⏱",
  goal: "⚽",
  assist: "🅰️",
  clean_sheet: "🛡️",
  goals_conceded: "🥅",
  saves: "🧤",
  pen_saved: "🧤",
  pen_missed: "❌",
  own_goal: "😬",
  yellow: "🟨",
  red: "🟥",
  bonus: "⭐",
  defensive: "🧱",
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const tone = (n: number) => (n > 0 ? "pts--plus" : n < 0 ? "pts--minus" : "pts--zero");

function Feed({ replay, view, ctx, names }: { replay: Replay; view: PlaybackView; ctx: EngineContext; names: Record<Side, string> }) {
  const items = useMemo(() => {
    const out: { key: number; step: ReplayStep }[] = [];
    for (let k = view.index; k >= 0 && out.length < 40; k--) {
      const s = replay.steps[k]!;
      if (s.kind !== "fixture-start") out.push({ key: k, step: s });
    }
    return out;
  }, [replay, view.index]);
  return (
    <section className="feed" aria-label="What happened">
      <ol className="feed__list">
        {items.map(({ key, step }) => (
          <li key={key} className={`feed__item ${key === view.index ? "feed__item--new" : ""}`}>
            <FeedRow step={step} ctx={ctx} names={names} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeedRow({ step, ctx, names }: { step: ReplayStep; ctx: EngineContext; names: Record<Side, string> }) {
  const pl = (id: number) => ctx.players.get(id)!;
  const club = (id: number) => ctx.teams.get(id)?.short_name ?? "?";
  switch (step.kind) {
    case "player": {
      const p = pl(step.playerId);
      const owners = (["human", "ai"] as const).filter((s) => step.teams[s]);
      const counts = owners.some((s) => step.teams[s]!.countsNow);
      const notes = owners.map((s) => {
        const t = step.teams[s]!;
        const who = owners.length === 2 ? names[s] : "";
        // "Didn't play" is already shown once for the player; only bench status needs a note.
        if (t.role === "bench") return `${who} bench ${t.benchOrder}`.trim();
        return null;
      });
      return (
        <div className={`feed-row ${counts ? "" : "feed-row--muted"}`}>
          <KitBadge player={p} ctx={ctx} size="sm" />
          <div className="feed-row__main">
            <span className="feed-row__name">
              {shortName(p.name, 18)} <span className="feed-row__club">{club(p.team_id)}</span>
              <span className="feed-row__owners">{owners.length === 2 ? "Both teams" : names[owners[0]!]}</span>
            </span>
            <span className="feed-row__events">
              {step.minutes === 0 ? (
                <span className="event">Didn't play</span>
              ) : step.explanation.addsUp ? (
                step.explanation.items.map((it) => (
                  <span key={it.kind} className="event">
                    <span aria-hidden="true">{ICONS[it.kind]}</span> {it.label} <span className={tone(it.points)}>{signed(it.points)}</span>
                  </span>
                ))
              ) : (
                step.explanation.items.map((it) => (
                  <span key={it.kind} className="event">
                    <span aria-hidden="true">{ICONS[it.kind]}</span> {it.label}
                  </span>
                ))
              )}
              {notes.filter(Boolean).map((n) => (
                <span key={n} className="event event--note">
                  {n}
                </span>
              ))}
            </span>
          </div>
          <span className={`feed-row__pts ${counts ? tone(step.points) : "pts--zero"}`}>{signed(step.points)}</span>
        </div>
      );
    }
    case "captain-bonus":
      return (
        <div className="feed-row feed-row--special">
          <span className="cv-inline cv-inline--C">C</span>
          <div className="feed-row__main">
            <span className="feed-row__name">Captain bonus: {shortName(pl(step.playerId).name, 18)}</span>
            <span className="feed-row__events">{names[step.side]} · points count double</span>
          </div>
          <span className={`feed-row__pts ${tone(step.points)}`}>{signed(step.points)}</span>
        </div>
      );
    case "fixture-end": {
      const f = step.fixture;
      return (
        <div className="feed-row feed-row--fulltime">
          {f ? `Full time: ${club(f.home_team_id)} ${f.home_score} – ${f.away_score} ${club(f.away_team_id)}` : "Other matches finished"}
        </div>
      );
    }
    case "auto-sub":
      return (
        <div className="feed-row feed-row--special">
          <span className="feed-row__icon" aria-hidden="true">🔁</span>
          <div className="feed-row__main">
            <span className="feed-row__name">
              {shortName(pl(step.outId).name, 18)} didn't play, so {shortName(pl(step.inId).name, 18)} comes on
            </span>
            <span className="feed-row__events">{names[step.side]} · auto-sub</span>
          </div>
          <span className={`feed-row__pts ${tone(step.points)}`}>{signed(step.points)}</span>
        </div>
      );
    case "vice-captain":
      return (
        <div className="feed-row feed-row--special">
          <span className="cv-inline cv-inline--V">V</span>
          <div className="feed-row__main">
            <span className="feed-row__name">
              {step.viceId === step.captainId
                ? `Captain bonus: ${shortName(pl(step.viceId).name, 18)}`
                : `Captain didn't play: ${shortName(pl(step.viceId).name, 18)}'s points count double`}
            </span>
            <span className="feed-row__events">{names[step.side]}</span>
          </div>
          <span className={`feed-row__pts ${tone(step.points)}`}>{signed(step.points)}</span>
        </div>
      );
    case "final":
      return <div className="feed-row feed-row--fulltime">All matches finished.</div>;
    case "fixture-start":
      return null;
  }
}

// ---- Team lists ------------------------------------------------------------------------------

function TeamList({ side, title, team, replay, view, ctx }: { side: Side; title: string; team: Team; replay: Replay; view: PlaybackView; ctx: EngineContext }) {
  const order = (id: number) => POSITIONS.indexOf(ctx.players.get(id)!.position);
  const starters = [...team.starting].sort((a, b) => order(a) - order(b));
  const row = (id: number, bench: number | null) => {
    const p = ctx.players.get(id)!;
    const v = view.players[side].get(id);
    const revealed = !!v && v.revealedAt >= 0;
    const step = revealed ? replay.steps[v.revealedAt] : undefined;
    const minutes = step?.kind === "player" ? step.minutes : 0;
    const lit = revealed && v.revealedAt === view.index;
    const counted = bench === null ? !v?.subbedOutBy : !!v?.cameOnFor;
    const pts = step?.kind === "player" ? step.points : 0;
    const status = !revealed ? "·" : minutes === 0 ? "DNP" : signed(pts);
    return (
      <li key={id} className={`team-row ${lit ? "team-row--lit" : ""} ${counted ? "" : "team-row--out"} ${bench !== null ? "team-row--bench" : ""}`}>
        {bench !== null && <span className="team-row__bench">{bench}</span>}
        <KitBadge player={p} ctx={ctx} size="sm" />
        <span className="team-row__name">
          {shortName(p.name, 16)}
          {id === team.captainId && <span className="cv-inline cv-inline--C">C</span>}
          {id === team.viceCaptainId && <span className="cv-inline cv-inline--V">V</span>}
          {v?.subbedOutBy && <span className="team-row__note">off</span>}
          {v?.cameOnFor && <span className="team-row__note">on</span>}
        </span>
        <span className={`team-row__pts ${revealed && minutes > 0 ? tone(pts) : "pts--zero"}`}>
          {status}
          {v?.doubled && pts !== 0 && <span className="team-row__x2"> ×2</span>}
        </span>
      </li>
    );
  };
  return (
    <section className={`team-list ${side === "ai" ? "team-list--ai" : ""}`} aria-label={`${title} players`}>
      <h2 className="team-list__title">{title}</h2>
      <ol className="team-list__rows">{starters.map((id) => row(id, null))}</ol>
      <ol className="team-list__rows team-list__rows--bench">{team.bench.map((id, k) => row(id, k + 1))}</ol>
    </section>
  );
}
