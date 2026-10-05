// Display helpers for player names (UI only; no game rules here).

/** Surname prefixes kept with the surname: "Virgil van Dijk" -> "V. van Dijk". */
const PARTICLES = new Set(["van", "von", "de", "da", "das", "do", "dos", "di", "del", "della", "der", "den", "le", "la", "ten", "ter", "mac", "st."]);

/** Short display name for tight spaces. Names up to `max` characters are kept as they are;
 *  longer ones become first initial + last name (with particles), e.g. "B. Fernandes". */
export function shortName(full: string, max = 16): string {
  const name = full.trim().replace(/\s+/g, " ");
  if (name.length <= max) return name;
  const parts = name.split(" ");
  if (parts.length === 1) return name;
  let start = parts.length - 1;
  while (start > 1 && PARTICLES.has(parts[start - 1]!.toLowerCase())) start--;
  const surname = parts.slice(start).join(" ");
  return `${parts[0]![0]}. ${surname}`;
}

/** Very short name for phone-width pitch cards: the whole name if it's tiny, else the surname
 *  (with particles): "Mohamed Salah" -> "Salah", "Virgil van Dijk" -> "van Dijk". */
export function tinyName(full: string, max = 9): string {
  const name = full.trim().replace(/\s+/g, " ");
  if (name.length <= max) return name;
  const parts = name.split(" ");
  let start = parts.length - 1;
  while (start > 1 && PARTICLES.has(parts[start - 1]!.toLowerCase())) start--;
  return parts.slice(start).join(" ");
}

/** Up to two initials for the kit badge: "Bukayo Saka" -> "BS", "Rodri" -> "R". */
export function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter((p) => !PARTICLES.has(p.toLowerCase()));
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Lower-case, accents removed, so "odegaard" finds "Ødegaard" and "kadioglu" finds "Kadıoğlu". */
export function searchKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/ı/g, "i")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .toLowerCase();
}
