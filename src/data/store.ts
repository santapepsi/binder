// App state: binders and the card copies inside them. Local-first: every change
// is written to IndexedDB immediately and marked dirty for the account sync.

import { DEFAULT_BINDERS, binderKindFor } from "../model/classify.ts";
import { firstFreeSlot } from "../model/layout.ts";
import type { Binder, BinderCard, BinderKind, CardSnapshot } from "../model/types.ts";
import * as db from "./db.ts";

export type NewCopy = Pick<BinderCard, "printing" | "artworkId" | "condition" | "language" | "edition" | "notes">;

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );

export class Store extends EventTarget {
  binders = new Map<string, Binder>();
  cards = new Map<string, BinderCard>();

  async load() {
    const [binders, cards] = await Promise.all([db.getAll<Binder>("binders"), db.getAll<BinderCard>("cards")]);
    binders.forEach((binder) => this.binders.set(binder.id, binder));
    cards.forEach((card) => this.cards.set(card.id, card));
    if (!this.liveBinders().length) await this.createDefaults();
  }

  private async createDefaults() {
    const now = Date.now();
    const binders = DEFAULT_BINDERS.map((preset, index) => ({
      id: uuid(),
      ...preset,
      coverImage: null,
      sort: index,
      updatedAt: now,
      deleted: false,
      dirty: true,
    }));
    binders.forEach((binder) => this.binders.set(binder.id, binder));
    await db.put("binders", binders);
  }

  private emit(binderIds: string[]) {
    this.dispatchEvent(new CustomEvent("change", { detail: { binderIds } }));
  }

  liveBinders(): Binder[] {
    return [...this.binders.values()].filter((binder) => !binder.deleted).sort((a, b) => a.sort - b.sort);
  }

  cardsOf(binderId: string): BinderCard[] {
    return [...this.cards.values()].filter((card) => card.binderId === binderId && !card.deleted);
  }

  cardAt(binderId: string, slot: number): BinderCard | undefined {
    for (const card of this.cards.values()) if (card.binderId === binderId && card.slot === slot && !card.deleted) return card;
    return undefined;
  }

  usedSlots(binderId: string): Set<number> {
    return new Set(this.cardsOf(binderId).map((card) => card.slot));
  }

  /** Type binder a card is routed to, or null when it has none (skills, tokens). */
  binderForCard(card: CardSnapshot): Binder | null {
    const kind = binderKindFor(card);
    return kind ? this.liveBinders().find((binder) => binder.kind === kind) ?? null : null;
  }

  /**
   * Adds a copy. In a type binder the card always goes to the binder of its type
   * (the requested slot is kept only if it is free and in that same binder).
   * Personal binders take any card.
   */
  async addCard(binderId: string, card: CardSnapshot, copy: NewCopy, slot?: number): Promise<BinderCard> {
    let target = this.binders.get(binderId)!;
    if (target.kind !== "personal") {
      const routed = this.binderForCard(card);
      if (routed && routed.id !== target.id) {
        target = routed;
        slot = undefined;
      }
    }
    const used = this.usedSlots(target.id);
    const finalSlot = slot !== undefined && !used.has(slot) ? slot : firstFreeSlot(used);
    const entry: BinderCard = {
      id: uuid(),
      binderId: target.id,
      slot: finalSlot,
      card,
      ...copy,
      updatedAt: Date.now(),
      deleted: false,
      dirty: true,
    };
    this.cards.set(entry.id, entry);
    await db.put("cards", [entry]);
    this.emit([target.id]);
    return entry;
  }

  async updateCard(id: string, patch: Partial<NewCopy>) {
    const card = this.cards.get(id);
    if (!card) return;
    Object.assign(card, patch, { updatedAt: Date.now(), dirty: true });
    await db.put("cards", [card]);
    this.emit([card.binderId]);
  }

  /** Moves a copy to a pocket; a copy already there swaps into the vacated pocket. */
  async moveCard(id: string, binderId: string, slot: number) {
    const card = this.cards.get(id);
    if (!card || (card.binderId === binderId && card.slot === slot)) return;
    const occupant = this.cardAt(binderId, slot);
    const now = Date.now();
    const changed = [card];
    const affected = new Set([card.binderId, binderId]);
    if (occupant) {
      Object.assign(occupant, { binderId: card.binderId, slot: card.slot, updatedAt: now, dirty: true });
      changed.push(occupant);
    }
    Object.assign(card, { binderId, slot, updatedAt: now, dirty: true });
    await db.put("cards", changed);
    this.emit([...affected]);
  }

  /** Moves a copy to another binder's first free pocket. */
  async moveToBinder(id: string, binderId: string) {
    const card = this.cards.get(id);
    if (!card || card.binderId === binderId) return;
    await this.moveCard(id, binderId, firstFreeSlot(this.usedSlots(binderId)));
  }

  async removeCard(id: string) {
    const card = this.cards.get(id);
    if (!card) return;
    Object.assign(card, { deleted: true, updatedAt: Date.now(), dirty: true });
    await db.put("cards", [card]);
    this.emit([card.binderId]);
  }

  async updateBinder(id: string, patch: Partial<Pick<Binder, "name" | "coverColor" | "coverImage">>) {
    const binder = this.binders.get(id);
    if (!binder) return;
    Object.assign(binder, patch, { updatedAt: Date.now(), dirty: true });
    await db.put("binders", [binder]);
    this.emit([id]);
  }

  /** Applies records from the account sync (already merged), then fixes pocket collisions. */
  async applyRemote(binders: Binder[], cards: BinderCard[]) {
    binders.forEach((binder) => this.binders.set(binder.id, binder));
    cards.forEach((card) => this.cards.set(card.id, card));
    const fixed = this.resolveCollisions();
    await db.put("binders", binders);
    await db.put("cards", [...cards, ...fixed]);
    this.emit([...new Set([...binders.map((binder) => binder.id), ...cards.map((card) => card.binderId)])]);
  }

  /** Two copies in one pocket (edited on two devices): the newer one moves to a free pocket. */
  resolveCollisions(): BinderCard[] {
    const seen = new Map<string, BinderCard>();
    const moved: BinderCard[] = [];
    const live = [...this.cards.values()].filter((card) => !card.deleted).sort((a, b) => a.updatedAt - b.updatedAt);
    for (const card of live) {
      const key = `${card.binderId}:${card.slot}`;
      if (!seen.has(key)) {
        seen.set(key, card);
        continue;
      }
      card.slot = firstFreeSlot(this.usedSlotsExcluding(card.binderId, card.id));
      card.dirty = true;
      card.updatedAt = Date.now();
      seen.set(`${card.binderId}:${card.slot}`, card);
      moved.push(card);
    }
    return moved;
  }

  private usedSlotsExcluding(binderId: string, id: string) {
    return new Set(this.cardsOf(binderId).filter((card) => card.id !== id).map((card) => card.slot));
  }

  kindLabel(kind: BinderKind) {
    return DEFAULT_BINDERS.find((preset) => preset.kind === kind)?.name ?? "Personal";
  }
}
