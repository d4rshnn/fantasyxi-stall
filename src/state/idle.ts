import { IDLE_RESET_MS, IDLE_WARNING_MS } from "../config";
import type { Screen } from "./machine";

/** Screens that reset to the start after being left alone (no team is mid-build, no replay running). */
export const IDLE_SCREENS: readonly Screen[] = ["name", "result", "leaderboard", "explainer"];

export type IdlePhase = { phase: "active" } | { phase: "warning"; secondsLeft: number } | { phase: "reset" };

/** What should happen after `idleMs` without input. */
export function idlePhase(idleMs: number, resetAfter = IDLE_RESET_MS, warnFor = IDLE_WARNING_MS): IdlePhase {
  if (idleMs >= resetAfter) return { phase: "reset" };
  if (idleMs >= resetAfter - warnFor) return { phase: "warning", secondsLeft: Math.ceil((resetAfter - idleMs) / 1000) };
  return { phase: "active" };
}

/** The operator PIN check. Plain comparison on purpose: the PIN prevents accidents, it isn't security. */
export function pinMatches(input: string, pin: string): boolean {
  return input.trim() === pin;
}
