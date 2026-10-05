import { useEffect, useMemo, useState, type Dispatch } from "react";
import { teamToLineup, type EngineContext, type Team } from "../engine";
import { BenchStrip, Pitch } from "../components/Pitch";
import type { RevealState } from "../state/reveal";
import type { Action } from "../state/machine";

const BEAT_MS = 2500;

interface Props {
  ctx: EngineContext;
  teamName: string;
  humanTeam: Team;
  reveal: RevealState;
  dispatch: Dispatch<Action>;
}

/** FantasyXI's team appears next to the group's locked team. Shows ONLY team info (names, clubs,
 *  prices, formation, C/V) - no points, predictions or minutes; those belong to the gameweek reveal. */
export function MeetScreen({ ctx, teamName, humanTeam, reveal, dispatch }: Props) {
  // Ask for reveal.json the first time this screen is shown after the lock.
  useEffect(() => {
    if (reveal.status === "idle") dispatch({ type: "REVEAL_REQUEST" });
  }, [reveal.status, dispatch]);

  if (reveal.status === "idle" || reveal.status === "loading") {
    return (
      <main className="screen" aria-busy="true">
        <div className="thinking" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1 className="screen__title">FantasyXI is thinking…</h1>
        <p className="screen__body">Your team is locked in.</p>
      </main>
    );
  }

  if (reveal.status === "error") {
    return (
      <main className="screen" role="alert">
        <p className="screen__eyebrow">Your team is safe and still locked</p>
        <h1 className="screen__title">Couldn't load FantasyXI's team</h1>
        <p className="screen__body">{reveal.message.replace(/^Couldn't load FantasyXI's team\. /, "")}</p>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "REVEAL_REQUEST" })} autoFocus>
          Retry
        </button>
      </main>
    );
  }

  return <MeetTeams ctx={ctx} teamName={teamName} humanTeam={humanTeam} aiTeam={reveal.aiTeam} dispatch={dispatch} />;
}

function MeetTeams({ ctx, teamName, humanTeam, aiTeam, dispatch }: Omit<Props, "reveal"> & { aiTeam: Team }) {
  const [beat, setBeat] = useState(true);
  useEffect(() => {
    if (!beat) return;
    const id = window.setTimeout(() => setBeat(false), BEAT_MS);
    return () => window.clearTimeout(id);
  }, [beat]);

  const human = useMemo(() => teamToLineup(humanTeam, ctx), [humanTeam, ctx]);
  const ai = useMemo(() => teamToLineup(aiTeam, ctx), [aiTeam, ctx]);

  if (beat) {
    return (
      <main className="screen beat" onClick={() => setBeat(false)}>
        <p className="screen__eyebrow">Your challenger</p>
        <h1 className="screen__title beat__title">FantasyXI has picked its team</h1>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setBeat(false)} autoFocus>
          Skip
        </button>
      </main>
    );
  }

  return (
    <main className="meet">
      <h1 className="meet__title">
        <span>{teamName}</span> <span className="meet__vs">vs</span> <span className="meet__ai">FantasyXI</span>
      </h1>
      <div className="versus">
        <TeamPanel title={teamName} subtitle="Your team" lineup={human} team={humanTeam} ctx={ctx} />
        <TeamPanel title="FantasyXI" subtitle="Our AI" lineup={ai} team={aiTeam} ctx={ctx} ai />
      </div>
      <footer className="builder-footer">
        <span className="builder-footer__hint">Same rules, same real results. Let's play the gameweek.</span>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "GOTO", screen: "simulate" })}>
          Play the gameweek
        </button>
      </footer>
    </main>
  );
}

function TeamPanel(props: { title: string; subtitle: string; lineup: ReturnType<typeof teamToLineup>; team: Team; ctx: EngineContext; ai?: boolean }) {
  const { title, subtitle, lineup, team, ctx, ai } = props;
  return (
    <section className={`team-panel ${ai ? "team-panel--ai" : ""}`} aria-label={`${title}'s team`}>
      <header className="team-panel__header">
        <span className="team-panel__subtitle">{subtitle}</span>
        <h2 className="team-panel__title">{title}</h2>
        <span className="team-panel__formation">{lineup.formation}</span>
      </header>
      <Pitch lineup={lineup} ctx={ctx} captainId={team.captainId} viceCaptainId={team.viceCaptainId} label={`${title} starting XI`} />
      <BenchStrip lineup={lineup} ctx={ctx} />
    </section>
  );
}
