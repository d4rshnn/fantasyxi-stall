import { useState, type Dispatch } from "react";
import { budgetStatus, formatPrice, POSITIONS, type EngineContext } from "../engine";
import { Dialog } from "../components/Dialog";
import { KitBadge } from "../components/PlayerCard";
import { Pitch } from "../components/Pitch";
import { finishedTeam, type BuildState } from "../state/build";
import type { Action } from "../state/machine";

interface Props {
  build: BuildState;
  ctx: EngineContext;
  teamName: string;
  dispatch: Dispatch<Action>;
}

/** Final check before locking: the whole team in a dialog, over a read-only pitch. */
export function LockScreen({ build, ctx, teamName, dispatch }: Props) {
  const [locking, setLocking] = useState(false); // double-click guard (LOCK is also ignored once locked)
  const { team, problem } = finishedTeam(build, ctx);
  const b = budgetStatus(build.lineup, ctx);
  const back = () => dispatch({ type: "GOTO", screen: "captain" });
  const name = (id: number) => ctx.players.get(id)!;

  return (
    <main className="builder">
      <Pitch lineup={build.lineup} ctx={ctx} captainId={build.captainId} viceCaptainId={build.viceCaptainId} />
      <Dialog
        title={team ? "Lock your team?" : "Not ready yet"}
        onClose={back}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={back}>
              Go back
            </button>
            {team && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={locking}
                onClick={() => {
                  if (locking) return;
                  setLocking(true);
                  dispatch({ type: "LOCK" });
                }}
              >
                Lock it in
              </button>
            )}
          </>
        }
      >
        {!team ? (
          <p className="message message--static">{problem}</p>
        ) : (
          <div className="lock-summary">
            <p className="lock-summary__lead">
              <strong>{teamName}</strong> · {build.lineup.formation} · {formatPrice(b.spent)} of {formatPrice(ctx.rules.budget)} used
            </p>
            <div className="lock-summary__xi">
              {POSITIONS.map((pos) => {
                const ids = team.starting.filter((id) => name(id).position === pos);
                return (
                  <p key={pos} className="lock-summary__row">
                    <span className="lock-summary__pos">{pos}</span>
                    {ids.map((id) => (
                      <span key={id} className="lock-summary__player">
                        <KitBadge player={name(id)} ctx={ctx} size="sm" />
                        {name(id).name}
                        {id === team.captainId && <span className="cv-inline cv-inline--C">C</span>}
                        {id === team.viceCaptainId && <span className="cv-inline cv-inline--V">V</span>}
                      </span>
                    ))}
                  </p>
                );
              })}
            </div>
            <p className="lock-summary__row">
              <span className="lock-summary__pos">Bench</span>
              {team.bench.map((id, k) => (
                <span key={id} className="lock-summary__player">
                  {k + 1}. {name(id).name}
                </span>
              ))}
            </p>
            <p className="hint">Once locked, your team can't be changed. Then FantasyXI shows its team.</p>
          </div>
        )}
      </Dialog>
    </main>
  );
}
