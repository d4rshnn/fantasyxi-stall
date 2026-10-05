import { DEFAULT_SETTINGS, type Settings } from "./machine";

const KEY = "fantasyxi-stall:settings";

/** Operator settings from this browser's storage. Falls back to defaults if storage is blocked or empty. */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { timerEnabled: typeof parsed.timerEnabled === "boolean" ? parsed.timerEnabled : DEFAULT_SETTINGS.timerEnabled };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, blocked): the setting just won't survive a reload.
  }
}
