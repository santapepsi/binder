// Decks kept in deckboxes. Each deck lists card copies in Main, Extra and Side.
// Saved on the device and synced with the account as one private file.

import { frameOf } from "../model/classify.ts";
import type { CardSnapshot } from "../model/types.ts";
import * as db from "./db.ts";
import { uuid } from "./store.ts";

export type DeckZone = "main" | "extra" | "side";

export interface DeckEntry {
  catalogId: string;
  artworkId: string | null;
  card: CardSnapshot;
}

export interface Deck {
  id: string;
  name: string;
  main: DeckEntry[];
  extra: DeckEntry[];
  side: DeckEntry[];
  updatedAt: number;
  deleted: boolean;
}

export const LIMITS: Record<DeckZone, number> = { main: 60, extra: 15, side: 15 };
export const MAIN_MINIMUM = 40;
export const COPIES_PER_CARD = 3;

/** Fusion, Synchro, Xyz and Link monsters live in the Extra Deck. */
export const isExtraDeckCard = (card: Pick<CardSnapshot, "cardType" | "subtypes">) =>
  ["fusion", "synchro", "xyz", "link"].includes(frameOf(card));

const KEY = "decks";

export interface DecksState {
  decks: Deck[];
  updatedAt: number;
  dirty: boolean;
}

export class DeckStore extends EventTarget {
  decks: Deck[] = [];
  updatedAt = 0;
  dirty = false;

  async load() {
    const saved = await db.get<DecksState>("meta", KEY).catch(() => undefined);
    this.decks = saved?.decks ?? [];
    this.updatedAt = saved?.updatedAt ?? 0;
    this.dirty = saved?.dirty ?? false;
  }

  private async persist() {
    await db.put("meta", [{ decks: this.decks, updatedAt: this.updatedAt, dirty: this.dirty }], [KEY]).catch(() => undefined);
  }

  private async changed(deck?: Deck) {
    const now = Date.now();
    if (deck) deck.updatedAt = now;
    this.updatedAt = now;
    this.dirty = true;
    this.dispatchEvent(new Event("change"));
    await this.persist();
  }

  live(): Deck[] {
    return this.decks.filter((deck) => !deck.deleted).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string) {
    return this.decks.find((deck) => deck.id === id && !deck.deleted);
  }

  async create(name = "New Deck"): Promise<Deck> {
    const deck: Deck = { id: uuid(), name, main: [], extra: [], side: [], updatedAt: Date.now(), deleted: false };
    this.decks.push(deck);
    await this.changed(deck);
    return deck;
  }

  async rename(id: string, name: string) {
    const deck = this.get(id);
    if (!deck || !name.trim()) return;
    deck.name = name.trim();
    await this.changed(deck);
  }

  async remove(id: string) {
    const deck = this.get(id);
    if (!deck) return;
    Object.assign(deck, { deleted: true, main: [], extra: [], side: [] });
    await this.changed(deck);
  }

  /** Copies of a card (by id) across the three zones of a deck. */
  copiesIn(deck: Deck, catalogId: string) {
    return [...deck.main, ...deck.extra, ...deck.side].filter((entry) => entry.catalogId === catalogId).length;
  }

  /**
   * Adds a copy; "deck" puts it in Main or Extra by card type. Returns the
   * reason when it cannot be added.
   */
  async add(id: string, entry: DeckEntry, target: "deck" | "side", owned: number): Promise<string | null> {
    const deck = this.get(id);
    if (!deck) return "Deck not found.";
    const zone: DeckZone = target === "side" ? "side" : isExtraDeckCard(entry.card) ? "extra" : "main";
    const copies = this.copiesIn(deck, entry.catalogId);
    if (copies >= COPIES_PER_CARD) return `A deck can hold at most ${COPIES_PER_CARD} copies of a card.`;
    if (copies >= owned) return `You own ${owned} ${owned === 1 ? "copy" : "copies"} of this card.`;
    if (deck[zone].length >= LIMITS[zone]) return `The ${zone === "main" ? "Main" : zone === "extra" ? "Extra" : "Side"} Deck is full (${LIMITS[zone]}).`;
    deck[zone].push({ ...entry });
    await this.changed(deck);
    return null;
  }

  async removeAt(id: string, zone: DeckZone, index: number) {
    const deck = this.get(id);
    if (!deck || !deck[zone][index]) return;
    deck[zone].splice(index, 1);
    await this.changed(deck);
  }

  // ---- used by the account sync

  snapshot(): DecksState {
    return { decks: this.decks, updatedAt: this.updatedAt, dirty: this.dirty };
  }

  /** Merges the account's decks: for each deck the most recently changed version wins. */
  async merge(remote: Deck[]) {
    const byId = new Map(this.decks.map((deck) => [deck.id, deck]));
    let changed = false;
    for (const deck of remote) {
      const local = byId.get(deck.id);
      if (!local || deck.updatedAt > local.updatedAt) {
        byId.set(deck.id, deck);
        changed = true;
      }
    }
    // Local still has decks or edits the account lacks: it must be uploaded.
    this.dirty = [...byId.values()].some((deck) => {
      const other = remote.find((entry) => entry.id === deck.id);
      return !other || other.updatedAt < deck.updatedAt;
    });
    this.decks = [...byId.values()];
    if (changed) this.dispatchEvent(new Event("change"));
    await this.persist();
  }

  async markPushed() {
    this.dirty = false;
    await this.persist();
  }
}

/** Standard .ydk deck file (passcodes), as used by most deck tools and simulators. */
export function toYdk(deck: Deck): string {
  const lines = (entries: DeckEntry[]) => entries.map((entry) => entry.catalogId);
  return ["#created by Binder", "#main", ...lines(deck.main), "#extra", ...lines(deck.extra), "!side", ...lines(deck.side), ""].join("\n");
}
