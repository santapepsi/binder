// The card spots on the table and the card back. Saved on this device and,
// when signed in, synced with the account (one record per account).

import { defaultTable, type TableSlot } from "../model/table.ts";
import * as db from "./db.ts";
import { uuid } from "./store.ts";

const KEY = "table";
const BACK_KEY = "cardback";

export interface TableState {
  slots: TableSlot[];
  /** Card back picture: null = built-in design, "local-…" = not uploaded yet, else storage path. */
  cardBack: string | null;
  updatedAt: number;
  dirty: boolean;
}

export class TableStore extends EventTarget {
  slots: TableSlot[] = [];
  cardBack: string | null = null;
  updatedAt = 0;
  dirty = false;

  async load() {
    const saved = await db.get<Partial<TableState>>("meta", KEY).catch(() => undefined);
    this.slots = saved?.slots ?? defaultTable(uuid);
    this.cardBack = saved?.cardBack ?? null;
    this.updatedAt = saved?.updatedAt ?? 0; // the untouched default loses to the account's table
    this.dirty = saved?.dirty ?? false;
    if (!saved) await this.persist();
  }

  private async persist() {
    const state: TableState = { slots: this.slots, cardBack: this.cardBack, updatedAt: this.updatedAt, dirty: this.dirty };
    await db.put("meta", [state], [KEY]).catch(() => undefined);
  }

  /** A local change: saved, marked for sync, announced. */
  private async changed() {
    this.updatedAt = Date.now();
    this.dirty = true;
    this.dispatchEvent(new Event("change"));
    await this.persist();
  }

  get(id: string) {
    return this.slots.find((slot) => slot.id === id);
  }

  async update(id: string, patch: Partial<Omit<TableSlot, "id">>) {
    const slot = this.get(id);
    if (!slot) return;
    Object.assign(slot, patch);
    await this.changed();
  }

  /** New spot next to the binder, on the side with fewer spots. */
  async add(): Promise<TableSlot> {
    const right = this.slots.filter((slot) => slot.x > 0).length;
    const left = this.slots.length - right;
    const sign = right <= left ? 1 : -1;
    const count = sign > 0 ? right : left;
    const slot: TableSlot = {
      id: uuid(),
      x: sign * (31 + (count % 3) * 7.5),
      z: -9 + Math.floor(count / 3) * 11,
      rotation: 0,
      card: null,
      artworkId: null,
      faceDown: false,
    };
    this.slots.push(slot);
    await this.changed();
    return slot;
  }

  async remove(id: string) {
    this.slots = this.slots.filter((slot) => slot.id !== id);
    await this.changed();
  }

  /** Picture for face-down cards; null returns to the built-in design. */
  async setCardBack(blob: Blob | null) {
    if (blob) await db.put("images", [blob], [BACK_KEY]);
    else await db.remove("images", BACK_KEY).catch(() => undefined);
    this.cardBack = blob ? `local-${Date.now()}` : null;
    window.dispatchEvent(new Event("cardback"));
    await this.changed();
  }

  // ---- used by the account sync

  /** Takes the account's table (already decided to be newer). */
  async applyRemote(state: { slots: TableSlot[]; cardBack: string | null; updatedAt: number }, backBlob?: Blob | null) {
    if (backBlob !== undefined) {
      if (backBlob) await db.put("images", [backBlob], [BACK_KEY]);
      else await db.remove("images", BACK_KEY).catch(() => undefined);
      window.dispatchEvent(new Event("cardback"));
    }
    this.slots = state.slots;
    this.cardBack = state.cardBack;
    this.updatedAt = state.updatedAt;
    this.dirty = false;
    this.dispatchEvent(new Event("change"));
    await this.persist();
  }

  async markPushed(updatedAt: number, cardBack: string | null) {
    this.cardBack = cardBack;
    if (this.updatedAt === updatedAt) this.dirty = false;
    await this.persist();
  }
}

export async function cardBackBlob(): Promise<Blob | undefined> {
  return db.get<Blob>("images", BACK_KEY).catch(() => undefined);
}
