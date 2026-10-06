import { useState, type Dispatch } from "react";
import { LeaderboardTable } from "../components/LeaderboardTable";
import { PinDialog } from "../components/PinDialog";
import { downloadText, stamp } from "../components/download";
import type { EngineContext } from "../engine";
import type { InitialData } from "../data/types";
import { boardKey, mergeEntries, parseBoardFile, serializeBoard, toCsv, verifyEntries, type LeaderboardEntry } from "../state/leaderboard";
import type { Action, LeaderboardState, Settings } from "../state/machine";
import { fetchRevealFor } from "../state/reveal";

interface Props {
  ready: { data: InitialData; ctx: EngineContext } | null;
  leaderboard: LeaderboardState;
  settings: Settings;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  onNewGame: () => void;
}

type Pending =
  | { kind: "delete"; entry: LeaderboardEntry }
  | { kind: "reset" }
  | { kind: "replace"; entries: LeaderboardEntry[]; summary: string };

interface ImportCheck {
  valid: LeaderboardEntry[];
  rejected: string[];
  added: number;
  skipped: number;
}

/** Hidden operator page (#/admin or Ctrl+Shift+A). A convenience page: the PIN only stops accidents. */
export function AdminScreen({ ready, leaderboard, settings, dispatch, onClose, onNewGame }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importCheck, setImportCheck] = useState<ImportCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const meta = ready ? { gameweek: ready.data.gameweek.gameweek, dataVersion: ready.data.manifest.data_version } : null;
  const aiScore = ready?.data.gameweek.ai_target_score ?? 0;

  const exportCsv = () => {
    if (!ready || !meta) return;
    downloadText(`fantasyxi-leaderboard-gw${meta.gameweek}-${stamp()}.csv`, toCsv(leaderboard.entries, ready.ctx), "text/csv;charset=utf-8");
    setNotice(`Exported ${leaderboard.entries.length} entries as CSV.`);
  };
  const exportJson = () => {
    if (!meta) return;
    downloadText(`fantasyxi-leaderboard-gw${meta.gameweek}-${stamp()}.json`, serializeBoard(leaderboard.entries, meta, new Date().toISOString()), "application/json");
    setNotice(`Exported ${leaderboard.entries.length} entries as JSON (use this as a backup).`);
  };

  const onFile = async (file: File) => {
    if (!ready || !meta) return;
    setBusy(true);
    setImportCheck(null);
    setNotice(null);
    try {
      const parsed = parseBoardFile(JSON.parse(await file.text()), meta);
      // Admin only: load the real results to re-check every imported score with the engine.
      const r = await fetchRevealFor(ready.data.gameweek, ready.ctx);
      if (!r.ok) throw new Error(r.message);
      const verified = verifyEntries(parsed.entries, ready.ctx, r.reveal.results, aiScore);
      const merged = mergeEntries(leaderboard.entries, verified.valid);
      setImportCheck({
        valid: verified.valid,
        rejected: [
          ...parsed.rejected.map((x) => `entry ${x.index + 1}: ${x.reason}`),
          ...verified.rejected.map((x) => `${x.id}: ${x.reason}`),
        ],
        added: merged.added,
        skipped: merged.skipped,
      });
    } catch (err) {
      setNotice(`Import failed: ${err instanceof Error ? err.message : "unreadable file"}`);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "delete") {
      dispatch({ type: "LEADERBOARD_DELETE", id: pending.entry.id });
      setNotice(`Deleted "${pending.entry.teamName}".`);
    } else if (pending.kind === "reset") {
      dispatch({ type: "LEADERBOARD_RESET" });
      setNotice("Leaderboard reset. (Tip: export first next time.)");
    } else {
      dispatch({ type: "LEADERBOARD_IMPORT", entries: pending.entries, mode: "replace" });
      setNotice(`Leaderboard replaced: ${pending.summary}`);
      setImportCheck(null);
    }
    setPending(null);
  };

  return (
    <main className="screen screen--top admin">
      <p className="screen__eyebrow">Operator</p>
      <h1 className="screen__title">Admin</h1>
      <p className="hint admin__pin-note">
        Delete, reset and replace need the operator PIN (set in <code>src/config.ts</code>). The PIN only prevents accidents. It is <strong>not</strong> security.
      </p>
      {/* The leaderboard lives in localStorage, which belongs to one exact address + browser profile. */}
      <p className="hint admin__origin">
        This leaderboard is saved in this browser at <strong>{window.location.origin}</strong>. A different address, browser profile or device has its own separate board.
      </p>

      {!leaderboard.storageOk && (
        <p className="message message--static admin__warning" role="alert">
          This browser isn't saving the leaderboard (storage is blocked or full). Scores are kept in memory only and will be lost if the page is closed or refreshed. Export JSON regularly!
        </p>
      )}
      {notice && <p className="admin__notice" role="status">{notice}</p>}

      <section className="admin__section">
        <h2 className="admin__h2">Settings</h2>
        <label className="toggle toggle--big">
          <input type="checkbox" checked={settings.timerEnabled} onChange={(e) => dispatch({ type: "SET_TIMER_ENABLED", enabled: e.target.checked })} />
          3-minute timer {settings.timerEnabled ? "on" : "off"}
        </label>
        <label className="toggle toggle--big">
          <input type="checkbox" checked={settings.soundEnabled} onChange={(e) => dispatch({ type: "SET_SOUND_ENABLED", enabled: e.target.checked })} />
          Sound {settings.soundEnabled ? "on" : "off"} <span className="hint">(no sounds yet: this only saves the setting)</span>
        </label>
      </section>

      {ready && meta && (
        <section className="admin__section">
          <h2 className="admin__h2">Leaderboard ({leaderboard.entries.length})</h2>
          <p className="hint">Saved in this browser under <code>{boardKey(meta)}</code>.</p>
          <div className="row-actions row-actions--left">
            <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={exportJson}>
              Export JSON
            </button>
            <label className="btn btn--ghost btn--small file-btn">
              {busy ? "Checking…" : "Import JSON…"}
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onFile(f);
                }}
              />
            </label>
            <button type="button" className="btn btn--danger btn--small" disabled={leaderboard.entries.length === 0} onClick={() => setPending({ kind: "reset" })}>
              Reset all
            </button>
          </div>

          {importCheck && (
            <div className="admin__import" role="status">
              <p>
                Import check: <strong>{importCheck.valid.length}</strong> valid ({importCheck.added} new, {importCheck.skipped} already on the board),{" "}
                <strong>{importCheck.rejected.length}</strong> rejected.
              </p>
              {importCheck.rejected.length > 0 && (
                <ul className="admin__rejected">
                  {importCheck.rejected.slice(0, 8).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                  {importCheck.rejected.length > 8 && <li>…and {importCheck.rejected.length - 8} more</li>}
                </ul>
              )}
              <div className="row-actions row-actions--left">
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={importCheck.added === 0}
                  onClick={() => {
                    dispatch({ type: "LEADERBOARD_IMPORT", entries: importCheck.valid, mode: "merge" });
                    setNotice(`Imported: added ${importCheck.added} · skipped ${importCheck.skipped} (already there) · rejected ${importCheck.rejected.length}.`);
                    setImportCheck(null);
                  }}
                >
                  Add {importCheck.added} new
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  onClick={() =>
                    setPending({ kind: "replace", entries: importCheck.valid, summary: `${importCheck.valid.length} entries from the file, ${importCheck.rejected.length} rejected.` })
                  }
                >
                  Replace board with file
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setImportCheck(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <LeaderboardTable entries={leaderboard.entries} aiScore={aiScore} showAll onDelete={(entry) => setPending({ kind: "delete", entry })} />
        </section>
      )}

      <div className="row-actions">
        <button className="btn btn--ghost" onClick={onNewGame}>
          New game
        </button>
        <button className="btn btn--primary" onClick={onClose}>
          Close admin
        </button>
      </div>

      {pending && (
        <PinDialog
          title={pending.kind === "delete" ? `Delete "${pending.entry.teamName}"?` : pending.kind === "reset" ? "Reset the whole leaderboard?" : "Replace the leaderboard?"}
          message={
            pending.kind === "delete"
              ? `This removes their score (${pending.entry.score}) from the board.`
              : pending.kind === "reset"
                ? `This removes all ${leaderboard.entries.length} entries from this browser. Export a backup first if you might need them.`
                : `This removes the current ${leaderboard.entries.length} entries and keeps only ${pending.summary}`
          }
          confirmLabel={pending.kind === "delete" ? "Delete" : pending.kind === "reset" ? "Reset all" : "Replace"}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
