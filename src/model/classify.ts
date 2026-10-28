import type { BinderKind, CardSnapshot } from "./types.ts";

export interface BinderPreset {
  kind: BinderKind;
  name: string;
  coverColor: string;
}

/** Cover colours of real 9-pocket binders (black, white, blue, red, green, violet, pink). */
export const BINDER_COLORS = {
  black: "#1c1c1f",
  white: "#eceef1",
  blue: "#1f5fb0",
  red: "#d21f2d",
  green: "#1f5b2c",
  violet: "#8446ad",
  pink: "#c4285b",
  beige: "#d8c8a4",
  brown: "#a8581f", // orange-brown
};

/**
 * A cover colour is one hex value, or "top|bottom" for a cover split in two halves
 * (the Pendulum binder). Stored as text, so it syncs like any other colour.
 */
export const coverTop = (value: string) => value.split("|")[0];
export const coverBottom = (value: string) => value.split("|")[1] ?? value.split("|")[0];
export const isSplitColor = (value: string) => value.includes("|");
export const joinColors = (top: string, bottom: string) => (top.toLowerCase() === bottom.toLowerCase() ? top : `${top}|${bottom}`);
/** CSS background for a cover colour. */
export const coverCss = (value: string) =>
  isSplitColor(value) ? `linear-gradient(${coverTop(value)} 0 50%, ${coverBottom(value)} 50% 100%)` : value;

/** The type binders plus two personal ones, created on first launch. */
export const DEFAULT_BINDERS: BinderPreset[] = [
  { kind: "monster-normal", name: "Normal Monsters", coverColor: BINDER_COLORS.beige },
  { kind: "monster-effect", name: "Effect Monsters", coverColor: BINDER_COLORS.brown },
  { kind: "monster-ritual", name: "Ritual Monsters", coverColor: BINDER_COLORS.blue },
  { kind: "monster-fusion", name: "Fusion Monsters", coverColor: BINDER_COLORS.violet },
  { kind: "monster-synchro", name: "Synchro Monsters", coverColor: BINDER_COLORS.white },
  { kind: "monster-xyz", name: "Xyz Monsters", coverColor: BINDER_COLORS.black },
  { kind: "monster-link", name: "Link Monsters", coverColor: BINDER_COLORS.blue },
  { kind: "monster-pendulum", name: "Pendulum Monsters", coverColor: `${BINDER_COLORS.brown}|${BINDER_COLORS.green}` },
  { kind: "spell", name: "Spells", coverColor: BINDER_COLORS.green },
  { kind: "trap", name: "Traps", coverColor: BINDER_COLORS.pink },
  { kind: "personal", name: "Personal I", coverColor: BINDER_COLORS.black },
  { kind: "personal", name: "Personal II", coverColor: BINDER_COLORS.white },
];

/** Colours the first versions gave each binder; binders still using them get the new ones. */
export const PREVIOUS_DEFAULT_COLORS: Record<string, string> = {
  "monster-normal": "#8a6a2c",
  "monster-effect": "#8c4a22",
  "monster-ritual": "#284f86",
  "monster-fusion": "#5b3277",
  "monster-synchro": "#9aa0a8",
  "monster-xyz": "#1d1d22",
  "monster-link": "#1f3f6e",
  "monster-pendulum": "#2c6e5e",
  spell: "#1f6b5a",
  trap: "#7a2350",
  "Personal I": "#3a1820",
  "Personal II": "#23283a",
};

/**
 * Defaults that changed once more: the binders still on the old default move to the
 * new one, one time only (so a colour the user picks later is never reverted).
 */
export const RECOLORED: Record<string, string[]> = {
  "monster-normal": [BINDER_COLORS.red],
  "monster-effect": [BINDER_COLORS.red],
  "monster-pendulum": [BINDER_COLORS.green],
};

export function recoloredDefault(binder: { kind: BinderKind; coverColor: string }): string | null {
  if (!RECOLORED[binder.kind]?.some((old) => old.toLowerCase() === binder.coverColor.toLowerCase())) return null;
  return DEFAULT_BINDERS.find((preset) => preset.kind === binder.kind)?.coverColor ?? null;
}

/** New default colour for a binder whose colour was never changed by the user, else null. */
export function updatedDefaultColor(binder: { kind: BinderKind; name: string; coverColor: string }): string | null {
  const key = binder.kind === "personal" ? binder.name : binder.kind;
  if (PREVIOUS_DEFAULT_COLORS[key]?.toLowerCase() !== binder.coverColor.toLowerCase()) return null;
  const preset = DEFAULT_BINDERS.find((entry) => (entry.kind === "personal" ? entry.name === key : entry.kind === key));
  return preset?.coverColor ?? null;
}

const has = (card: Pick<CardSnapshot, "subtypes">, word: string) =>
  card.subtypes.some((value) => value.toLowerCase() === word);

/**
 * Which type binder a card belongs to. Pendulums all go together; then the
 * summoning mechanic (ritual, fusion, synchro, xyz, link); then normal/effect.
 * Returns null for cards no type binder takes (skills, tokens).
 */
export function binderKindFor(card: Pick<CardSnapshot, "cardType" | "subtypes">): BinderKind | null {
  const type = card.cardType.toLowerCase();
  if (type === "spell") return "spell";
  if (type === "trap") return "trap";
  if (type !== "monster") return null;
  if (has(card, "pendulum")) return "monster-pendulum";
  if (has(card, "ritual")) return "monster-ritual";
  if (has(card, "fusion")) return "monster-fusion";
  if (has(card, "synchro")) return "monster-synchro";
  if (has(card, "xyz")) return "monster-xyz";
  if (has(card, "link")) return "monster-link";
  if (has(card, "token")) return null;
  if (has(card, "normal") && !has(card, "effect")) return "monster-normal";
  return "monster-effect";
}

/** Frame colour family of a card, used for the type tag and the fallback face. */
export function frameOf(card: Pick<CardSnapshot, "cardType" | "subtypes">):
  | "normal"
  | "effect"
  | "ritual"
  | "fusion"
  | "synchro"
  | "xyz"
  | "link"
  | "spell"
  | "trap"
  | "token"
  | "skill" {
  const type = card.cardType.toLowerCase();
  if (type === "spell") return "spell";
  if (type === "trap") return "trap";
  if (type === "skill") return "skill";
  if (has(card, "token")) return "token";
  for (const frame of ["ritual", "fusion", "synchro", "xyz", "link"] as const) if (has(card, frame)) return frame;
  if (has(card, "normal") && !has(card, "effect")) return "normal";
  return "effect";
}

/** Short type line, e.g. "[Spellcaster / Effect]" or "[Quick-Play Spell]". */
export function typeLine(card: Pick<CardSnapshot, "cardType" | "subtypes">): string {
  const type = card.cardType;
  if (type === "Spell" || type === "Trap") {
    const kind = card.subtypes.find((value) => value !== type && value.toLowerCase() !== "normal");
    return kind ? `${kind} ${type}` : `${type}`;
  }
  const parts = card.subtypes.map((value) => (value === "XYZ" ? "Xyz" : value));
  return parts.join(" / ") || type;
}

const RARITY_TAGS: [RegExp, string][] = [
  [/quarter century/i, "QCSR"],
  [/starlight/i, "STR"],
  [/collector/i, "CR"],
  [/ghost/i, "GR"],
  [/prismatic secret/i, "PSR"],
  [/platinum secret/i, "PLSR"],
  [/ultimate/i, "UTR"],
  [/secret/i, "SCR"],
  [/gold rare/i, "GUR"],
  [/premium gold/i, "PG"],
  [/ultra/i, "UR"],
  [/super/i, "SR"],
  [/short print/i, "SP"],
  [/mosaic/i, "MSR"],
  [/starfoil/i, "SFR"],
  [/shatterfoil/i, "SHR"],
  [/duel terminal/i, "DT"],
  [/rare/i, "R"],
  [/common/i, "C"],
];

/** Compact tag shown on the pocket for a rarity name. */
export function rarityTag(rarity: string | undefined | null): string {
  if (!rarity) return "";
  for (const [pattern, tag] of RARITY_TAGS) if (pattern.test(rarity)) return tag;
  return rarity
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
}
