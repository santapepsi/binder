// The card spots on the table, saved on this device.

import { defaultTable, type TableSlot } from "../model/table.ts";
import * as db from "./db.ts";
import { uuid } from "./store.ts";

const KEY = "table";
const BACK_KEY = "cardback";

export class TableStore extends EventTarget {
  slots: TableSlot[] = [];

  async load() {
    const saved = await db.get<{ slots: TableSlot[] }>("meta", KEY).catch(() => undefined);
    this.slots = saved?.slots ?? defaultTable(uuid);
    if (!saved) await this.save();
  }

  private async save() {
    this.dispatchEvent(new Event("change"));
    await db.put("meta", [{ slots: this.slots }], [KEY]).catch(() => undefined);
  }

  get(id: string) {
    return this.slots.find((slot) => slot.id === id);
  }

  async update(id: string, patch: Partial<Omit<TableSlot, "id">>) {
    const slot = this.get(id);
    if (!slot) return;
    Object.assign(slot, patch);
    await this.save();
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
    await this.save();
    return slot;
  }

  async remove(id: string) {
    this.slots = this.slots.filter((slot) => slot.id !== id);
    await this.save();
  }
}

// ---------------------------------------------------------------- card back

export async function cardBackBlob(): Promise<Blob | undefined> {
  return db.get<Blob>("images", BACK_KEY).catch(() => undefined);
}

export async function saveCardBack(blob: Blob | null) {
  if (blob) await db.put("images", [blob], [BACK_KEY]);
  else await db.remove("images", BACK_KEY);
  window.dispatchEvent(new Event("cardback"));
}
