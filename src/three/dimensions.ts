// Physical sizes in centimetres, close to a real 9-pocket page and binder.
import { COLUMNS, POCKETS } from "../model/layout.ts";

export const PAGE_W = 23;
export const PAGE_H = 29.5;
/** Distance from the ring axis to the page's inner edge. */
export const PAGE_GAP = 0.55;
export const PAGE_Y = 0.95;
export const BOARD_W = PAGE_GAP + PAGE_W + 1.6;
export const BOARD_H = PAGE_H + 2.4;
export const BOARD_T = 0.32;
/** Front cover hinge height; the closed cover rests at twice this height. */
export const HINGE_Y = 1.45;
export const RING_R = 1.05;

/** Side of the page with the punched holes, in page-image coordinates. */
export const BINDING_MARGIN = 1.7;
export const POCKET_TOP = 0.75;
export const POCKET_BOTTOM = 0.75;
export const POCKET_SIDE = 0.45;
export const CARD_W = 5.9;
export const CARD_H = 8.6;

export const TEXTURE_SCALE = 32; // pixels per centimetre
export const TEXTURE_W = Math.round(PAGE_W * TEXTURE_SCALE);
export const TEXTURE_H = Math.round(PAGE_H * TEXTURE_SCALE);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pocket rectangle in page-image centimetres (origin top-left of the page image).
 * Right-hand pages have their holes on the left; left-hand pages on the right.
 */
export function pocketRect(pocket: number, holesOnLeft: boolean): Rect {
  const innerW = PAGE_W - BINDING_MARGIN - POCKET_SIDE;
  const innerH = PAGE_H - POCKET_TOP - POCKET_BOTTOM;
  const w = innerW / COLUMNS;
  const h = innerH / (POCKETS / COLUMNS);
  const left = holesOnLeft ? BINDING_MARGIN : POCKET_SIDE;
  return { x: left + (pocket % COLUMNS) * w, y: POCKET_TOP + Math.floor(pocket / COLUMNS) * h, w, h };
}

export function cardRect(pocket: number, holesOnLeft: boolean): Rect {
  const rect = pocketRect(pocket, holesOnLeft);
  return {
    x: rect.x + (rect.w - CARD_W) / 2,
    y: rect.y + (rect.h - CARD_H) / 2 + 0.2,
    w: CARD_W,
    h: CARD_H,
  };
}

/** Pocket under a point of the page image, or -1. */
export function pocketAt(x: number, y: number, holesOnLeft: boolean): number {
  for (let pocket = 0; pocket < POCKETS; pocket++) {
    const rect = pocketRect(pocket, holesOnLeft);
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) return pocket;
  }
  return -1;
}

/** Punched holes: distance from the binding edge and positions down the page. */
export const HOLE_X = RING_R - PAGE_GAP;
export const HOLE_FRACTIONS = [0.11, 0.37, 0.63, 0.89];
