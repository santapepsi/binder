// Card and cover images. Downloaded once from the catalog and kept as blobs in
// IndexedDB, so binders render offline. Anything missing falls back to a
// drawn card face.

import type { CardSnapshot } from "../model/types.ts";
import { drawCardFace } from "./cardFace.ts";
import * as db from "./db.ts";

export type Drawable = ImageBitmap | HTMLCanvasElement;
export type ImageSize = "thumb" | "full";

const memory = new Map<string, Promise<Drawable>>();
const MEMORY_LIMIT = 160;

const cardKey = (card: CardSnapshot, size: ImageSize) => `card:${card.catalogId}:${size}`;

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

async function loadCard(card: CardSnapshot, size: ImageSize): Promise<Drawable> {
  const key = cardKey(card, size);
  let blob = await db.get<Blob>("images", key).catch(() => undefined);
  if (!blob) {
    const url = size === "thumb" ? card.thumbnailUrl ?? card.imageUrl : card.imageUrl ?? card.thumbnailUrl;
    if (url && navigator.onLine !== false) {
      blob = (await fetchBlob(url)) ?? undefined;
      if (blob) await db.put("images", [blob], [key]).catch(() => undefined);
    }
  }
  if (blob) {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* corrupt blob: fall through to the drawn face */
    }
  }
  return drawCardFace(card, size === "thumb" ? 236 : 472);
}

/** Card image, from memory, the offline store, the catalog, or drawn. */
export function cardImage(card: CardSnapshot, size: ImageSize = "thumb"): Promise<Drawable> {
  const key = cardKey(card, size);
  let pending = memory.get(key);
  if (!pending) {
    if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
    pending = loadCard(card, size);
    memory.set(key, pending);
  } else {
    memory.delete(key);
    memory.set(key, pending);
  }
  return pending;
}

/** Downloads both sizes ahead of time so a newly added card is available offline. */
export async function prefetchCard(card: CardSnapshot) {
  await Promise.all([cardImage(card, "thumb"), cardImage(card, "full")]);
}

export const coverKey = (binderId: string) => `cover:${binderId}`;

export async function saveCover(binderId: string, blob: Blob) {
  await db.put("images", [blob], [coverKey(binderId)]);
  memory.delete(coverKey(binderId));
}

export async function coverImage(binderId: string): Promise<ImageBitmap | null> {
  const blob = await db.get<Blob>("images", coverKey(binderId)).catch(() => undefined);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export async function coverBlob(binderId: string): Promise<Blob | undefined> {
  return db.get<Blob>("images", coverKey(binderId));
}

export async function deleteCover(binderId: string) {
  await db.remove("images", coverKey(binderId));
}
