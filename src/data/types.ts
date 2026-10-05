// The JSON shapes live in the engine (src/engine/types.ts); re-exported here for the app.
import type { Manifest, ManifestGameweek, Pregame } from "../engine";

export type * from "../engine/types";

/** Everything the app needs before the team is locked. */
export interface InitialData {
  manifest: Manifest;
  gameweek: ManifestGameweek;
  pregame: Pregame;
}
