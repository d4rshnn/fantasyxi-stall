// Stall settings that an operator might want to change. Edit here, then rebuild (npm run build).

/**
 * Operator PIN for destructive admin actions (delete an entry, reset the board, replace on import).
 * It only prevents ACCIDENTS by visitors poking at the admin page. It is NOT security: it is stored as
 * plain text in the website's code, and anyone can read it with the browser's developer tools.
 * To change it: replace "2468" below with any digits or text you like, then run `npm run build`.
 */
export const OPERATOR_PIN = "2468";

/** Idle reset on Name, Result, Leaderboard and Explainer: back to the start screen after this long. */
export const IDLE_RESET_MS = 90_000;
/** How long the "Starting a new game in ..." notice is shown before the idle reset happens. */
export const IDLE_WARNING_MS = 10_000;

/** How many rows the leaderboard shows before "See everyone". */
export const LEADERBOARD_TOP_N = 10;
