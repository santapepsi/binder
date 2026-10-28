// Card spots on the table around the binder. Each spot can be moved, rotated or
// removed, and holds a card face up, face down, or nothing.

import type { CardSnapshot } from "./types.ts";

export interface TableSlot {
  id: string;
  x: number; // table position in cm (binder rings at 0)
  z: number;
  rotation: number; // radians, around the vertical axis
  card: CardSnapshot | null;
  artworkId: string | null;
  faceDown: boolean;
  /** Stacking order: the card moved or changed last lies on top. */
  order?: number;
}

/** Outer edge of the open binder's boards, in cm from the rings. */
export const BINDER_EDGE = 25.9;

/** Three spots on each side, like loose cards next to the binder. */
export function defaultTable(id: () => string): TableSlot[] {
  const side = (sign: 1 | -1): TableSlot[] =>
    [
      { x: BINDER_EDGE + 4.5, z: -8.5, rotation: 0.26 },
      { x: BINDER_EDGE + 11.5, z: -8, rotation: 0 },
      { x: BINDER_EDGE + 7, z: 6.5, rotation: -0.9 },
    ].map((spot) => ({
      id: id(),
      x: spot.x * sign,
      z: spot.z,
      rotation: spot.rotation * sign,
      card: null,
      artworkId: null,
      faceDown: false,
    }));
  return [...side(-1), ...side(1)];
}

/** Whether a table point (x, z) falls inside a spot (card-sized rectangle, rotated). */
export function slotContains(slot: TableSlot, x: number, z: number, width = 6.6, depth = 9.3): boolean {
  const dx = x - slot.x;
  const dz = z - slot.z;
  const cos = Math.cos(slot.rotation);
  const sin = Math.sin(slot.rotation);
  // rotate the point into the spot's frame (rotation about +y)
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= width / 2 && Math.abs(localZ) <= depth / 2;
}
