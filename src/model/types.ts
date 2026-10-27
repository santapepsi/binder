// Core data model. Everything a binder needs to render offline is stored on the
// copy itself (a snapshot of the catalog card), so the catalog is only needed
// when adding cards or choosing a printing.

export type BinderKind =
  | "monster-normal"
  | "monster-effect"
  | "monster-ritual"
  | "monster-fusion"
  | "monster-synchro"
  | "monster-xyz"
  | "monster-link"
  | "monster-pendulum"
  | "spell"
  | "trap"
  | "personal";

export interface Binder {
  id: string;
  name: string;
  kind: BinderKind;
  coverColor: string; // #rrggbb
  /** Key of the cover image blob in the local image store; remote path when synced. */
  coverImage: string | null;
  sort: number;
  updatedAt: number;
  deleted: boolean;
  dirty: boolean;
}

/** Catalog card as stored on a binder copy (subset of Cardmática's CardDetail). */
export interface CardSnapshot {
  catalogId: string; // Cardmática card UUID (or demo id)
  ygoprodeckId: number | null;
  name: string;
  cardType: "Monster" | "Spell" | "Trap" | "Skill" | string;
  subtypes: string[];
  attribute: string | null;
  level: number | null;
  rank: number | null;
  linkRating: number | null;
  pendulumScale: number | null;
  atk: string | null;
  def: string | null;
  text: string;
  pendulumText: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export interface PrintingRef {
  id: string | null; // Cardmática printing UUID when chosen from the catalog
  code: string; // e.g. LOB-EN001
  setName: string;
  rarity: string;
}

export type Condition = "Mint" | "Near Mint" | "Excellent" | "Good" | "Light Played" | "Played" | "Poor";
export type Edition = "1st Edition" | "Unlimited" | "Limited Edition";

export interface BinderCard {
  id: string;
  binderId: string;
  /** Global pocket index inside the binder: page = floor(slot / 9), pocket = slot % 9. */
  slot: number;
  card: CardSnapshot;
  printing: PrintingRef | null;
  condition: Condition;
  language: string;
  edition: Edition;
  notes: string;
  updatedAt: number;
  deleted: boolean;
  dirty: boolean;
}

export const CONDITIONS: Condition[] = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
export const EDITIONS: Edition[] = ["1st Edition", "Unlimited", "Limited Edition"];
export const LANGUAGES = [
  "English",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Spanish",
  "Japanese",
  "Korean",
  "Chinese",
  "Asian-English",
];
