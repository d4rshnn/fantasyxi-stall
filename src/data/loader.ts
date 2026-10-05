import { DataShapeError, parseManifest, parsePregame, parseReveal, type ManifestGameweek, type Reveal } from "../engine";
import type { InitialData } from "./types";

// Relative to the page (vite base is "./"), so this works on GitHub Pages and any local server.
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

export class DataLoadError extends Error {}

async function fetchJson(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(DATA_BASE + path);
  } catch {
    throw new DataLoadError(`Couldn't reach ${path}.`);
  }
  if (!res.ok) throw new DataLoadError(`${path} returned ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new DataLoadError(`${path} is not valid JSON.`);
  }
}

/** Runs a parser and turns shape errors into DataLoadError (shown on the error screen). */
function parseOrFail<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof DataShapeError) throw new DataLoadError(err.message);
    throw err;
  }
}

/** Loads the manifest and the default gameweek's pre-game data. Never loads reveal.json. */
export async function loadInitialData(): Promise<InitialData> {
  const manifestJson = await fetchJson("manifest.json");
  const manifest = parseOrFail(() => parseManifest(manifestJson, "manifest.json"));
  // parseManifest guarantees default_gameweek is listed.
  const gameweek = manifest.gameweeks.find((g) => g.gameweek === manifest.default_gameweek)!;
  const pregameJson = await fetchJson(gameweek.pregame);
  const pregame = parseOrFail(() => parsePregame(pregameJson, gameweek.pregame));
  return { manifest, gameweek, pregame };
}

/** Loads the results/AI team for a gameweek. Call ONLY after the team is locked
 *  (spoiler guard for normal play, not security: the file is public). */
export async function loadReveal(gameweek: ManifestGameweek): Promise<Reveal> {
  const json = await fetchJson(gameweek.reveal);
  return parseOrFail(() => parseReveal(json, gameweek.reveal));
}
