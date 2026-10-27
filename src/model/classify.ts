import type { BinderKind, CardSnapshot } from "./types.ts";

export interface BinderPreset {
  kind: BinderKind;
  name: string;
  coverColor: string;
}

/** The type binders plus two personal ones, created on first launch. */
export const DEFAULT_BINDERS: BinderPreset[] = [
  { kind: "monster-normal", name: "Normal Monsters", coverColor: "#8a6a2c" },
  { kind: "monster-effect", name: "Effect Monsters", coverColor: "#8c4a22" },
  { kind: "monster-ritual", name: "Ritual Monsters", coverColor: "#284f86" },
  { kind: "monster-fusion", name: "Fusion Monsters", coverColor: "#5b3277" },
  { kind: "monster-synchro", name: "Synchro Monsters", coverColor: "#9aa0a8" },
  { kind: "monster-xyz", name: "Xyz Monsters", coverColor: "#1d1d22" },
  { kind: "monster-link", name: "Link Monsters", coverColor: "#1f3f6e" },
  { kind: "monster-pendulum", name: "Pendulum Monsters", coverColor: "#2c6e5e" },
  { kind: "spell", name: "Spells", coverColor: "#1f6b5a" },
  { kind: "trap", name: "Traps", coverColor: "#7a2350" },
  { kind: "personal", name: "Personal I", coverColor: "#3a1820" },
  { kind: "personal", name: "Personal II", coverColor: "#23283a" },
];

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
