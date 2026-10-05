// Public API of the game engine (pure TypeScript: no React, DOM or network).
export * from "./types";
export { DataShapeError, parseManifest, parsePregame, parseReveal } from "./parse";
export {
  FORMATIONS,
  POSITION_NAMES,
  benchPositions,
  clubName,
  emptyLineup,
  formatPrice,
  formationCounts,
  formationName,
  isValidFormation,
  isValidXICounts,
  makeContext,
  type PositionCounts,
} from "./rules";
export { lineupToTeam, squadOf, teamFromAi } from "./team";
export {
  budgetStatus,
  canAddPlayer,
  checkCandidates,
  slotChecker,
  isCompletable,
  teamFormation,
  validateTeam,
  type AddBlock,
  type AddCheck,
  type BudgetStatus,
  type Issue,
  type IssueCode,
} from "./validate";
export {
  AUTOCOMPLETE_RULE_TEXT,
  BENCH_AUTOFILL_RULE_TEXT,
  autoComplete,
  autoFillBench,
  type CompleteResult,
  type FillResult,
} from "./autofill";
export { resultsById, scoreTeam, type ResultLookup, type ScoredPlayer, type ScoreResult } from "./score";
