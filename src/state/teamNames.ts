/** Fun built-in names for the "random name" dice. */
export const RANDOM_TEAM_NAMES = [
  "The Overfitters",
  "Gradient Descenders",
  "Backprop Bandits",
  "Neural Net Busters",
  "The Underdogs XI",
  "Bench Boosters",
  "Offside Algorithms",
  "Random Forest FC",
  "Dropout Dynamos",
  "The Loss Minimisers",
  "Clean Sheet Crew",
  "Hat-trick Heroes",
  "Last-Minute Winners",
  "The False Nines",
  "Expected Goals FC",
  "Top Bin Tacticians",
  "Captain Chaos",
  "The Late Subs",
  "Parked Bus United",
  "Tiki-Taka Tensors",
  "Sweeper Keepers",
  "Counter Attack Club",
  "Nutmeg Nation",
  "The Overlap Gang",
  "Golden Boot Seekers",
  "Wonderkid Wanderers",
  "Data Driven Dons",
  "The Freshers XI",
  "Model Citizens",
  "Hyperparameter Heroes",
  "Batch Norm Ballers",
  "The Optimisers",
  "Penalty Box Pythons",
  "Silicon Strikers",
  "Midfield Maestros",
  "Volley Valley",
  "Route One Robots",
  "Stoppage Time Squad",
  "Giant Killers",
  "Beat The Bot",
] as const;

export const TEAM_NAME_MAX = 24;

/** A random name different from `current` (rand is injectable for tests). */
export function randomTeamName(current: string, rand: () => number = Math.random): string {
  const options = RANDOM_TEAM_NAMES.filter((n) => n !== current);
  return options[Math.floor(rand() * options.length)] ?? RANDOM_TEAM_NAMES[0];
}

/** Trimmed, inner spaces collapsed, cut to the max length. */
export function cleanTeamName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, TEAM_NAME_MAX).trim();
}
