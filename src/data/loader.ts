import type { InitialData, Manifest, Pregame } from "./types";

// Relative to the page (vite base is "./"), so this works on GitHub Pages and any local server.
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

const SUPPORTED_SCHEMA = 1;

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function checkSchema(file: string, v: unknown): void {
  if (!isObject(v) || v.schema_version !== SUPPORTED_SCHEMA) {
    throw new DataLoadError(`${file} has an unexpected format.`);
  }
}

/** Loads the manifest and the default gameweek's pre-game data. Never loads reveal.json. */
export async function loadInitialData(): Promise<InitialData> {
  const manifestRaw = await fetchJson("manifest.json");
  checkSchema("manifest.json", manifestRaw);
  const manifest = manifestRaw as Manifest;

  const gameweek = manifest.gameweeks.find((g) => g.gameweek === manifest.default_gameweek);
  if (!gameweek) throw new DataLoadError("The default gameweek is missing from manifest.json.");

  const pregameRaw = await fetchJson(gameweek.pregame);
  checkSchema(gameweek.pregame, pregameRaw);
  const pregame = pregameRaw as Pregame;
  if (!Array.isArray(pregame.players) || pregame.players.length === 0) {
    throw new DataLoadError(`${gameweek.pregame} has no players.`);
  }

  return { manifest, gameweek, pregame };
}
