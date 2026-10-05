// Kit colours for the badge behind each player's initials (our own colour values; no images or logos).
// Keyed by the club short name in pregame.json. Unknown clubs fall back to neutral grey.

export interface KitColors {
  bg: string;
  fg: string;
}

const KITS: Record<string, KitColors> = {
  ARS: { bg: "#EF0107", fg: "#FFFFFF" },
  AVL: { bg: "#670E36", fg: "#95BFE5" },
  BUR: { bg: "#6C1D45", fg: "#99D6EA" },
  BOU: { bg: "#DA291C", fg: "#111111" },
  BRE: { bg: "#E30613", fg: "#FFFFFF" },
  BHA: { bg: "#0057B8", fg: "#FFFFFF" },
  CHE: { bg: "#034694", fg: "#FFFFFF" },
  CRY: { bg: "#1B458F", fg: "#E8333A" },
  EVE: { bg: "#003399", fg: "#FFFFFF" },
  FUL: { bg: "#FFFFFF", fg: "#111111" },
  LEE: { bg: "#FFFFFF", fg: "#1D428A" },
  LIV: { bg: "#C8102E", fg: "#FFFFFF" },
  MCI: { bg: "#6CABDD", fg: "#1C2C5B" },
  MUN: { bg: "#DA291C", fg: "#FBE122" },
  NEW: { bg: "#241F20", fg: "#FFFFFF" },
  NFO: { bg: "#DD0000", fg: "#FFFFFF" },
  SUN: { bg: "#EB172B", fg: "#FFFFFF" },
  TOT: { bg: "#FFFFFF", fg: "#132257" },
  WHU: { bg: "#7A263A", fg: "#1BB1E7" },
  WOL: { bg: "#FDB913", fg: "#231F20" },
};

export function kitColors(shortName: string | undefined): KitColors {
  return (shortName && KITS[shortName]) || { bg: "#3a4560", fg: "#FFFFFF" };
}
