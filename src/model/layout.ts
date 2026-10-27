// Page and spread arithmetic. A binder shows spreads like a book:
// spread 0 = inside of the front cover (left) + page 0 (right),
// spread k = page 2k-1 (left) + page 2k (right).

export const POCKETS = 9;
export const COLUMNS = 3;

export const pageOfSlot = (slot: number) => Math.floor(slot / POCKETS);
export const pocketOfSlot = (slot: number) => slot % POCKETS;
export const slotOf = (page: number, pocket: number) => page * POCKETS + pocket;

/** Pages grow with the content and there is always one empty page after the last card. */
export function pageCount(slots: Iterable<number>): number {
  let max = -1;
  for (const slot of slots) if (slot > max) max = slot;
  return max < 0 ? 1 : pageOfSlot(max) + 2;
}

export const spreadCount = (pages: number) => Math.floor(pages / 2) + 1;

/** Pages visible on a spread; -1 means the inside cover, null means the back cover side. */
export function pagesOfSpread(spread: number, pages: number): { left: number; right: number | null } {
  const left = spread === 0 ? -1 : spread * 2 - 1;
  const right = spread * 2;
  return { left, right: right < pages ? right : null };
}

export const spreadOfPage = (page: number) => Math.floor((page + 1) / 2);

/** First empty slot at or after `from`. */
export function firstFreeSlot(used: Set<number>, from = 0): number {
  let slot = Math.max(0, from);
  while (used.has(slot)) slot++;
  return slot;
}
