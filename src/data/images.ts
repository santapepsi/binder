// Card and cover images. Only cards that are in a binder are downloaded, once,
// and kept as blobs in IndexedDB so they stay visible offline.
//
// Where a card image comes from, in order:
//   1. this device (IndexedDB)
//   2. the account's shared image bucket (Supabase Storage), if sync is set up
//   3. the account's `card-image` function, which copies the image from YGOPRODeck
//      into that bucket (needed on the web: YGOPRODeck images do not allow
//      cross-site downloads in browsers)
//   4. YGOPRODeck directly through the Android app's native HTTP
//   5. YGOPRODeck / Cardmática with a normal request
// If all fail (e.g. offline), a stand-in face is drawn and the download is
// retried later.

import { pickArtwork } from "../model/artworks.ts";
import type { CardSnapshot } from "../model/types.ts";
import { drawCardFace } from "./cardFace.ts";
import * as db from "./db.ts";

export type Drawable = (ImageBitmap | HTMLCanvasElement) & { placeholder?: boolean };
export type ImageSize = "thumb" | "full";

interface ImageSource {
  supabaseUrl: string;
  supabaseKey: string;
}

let source: ImageSource | null = null;

/** Called when settings change; enables the account bucket and function. */
export function configureImages(settings: ImageSource) {
  source = settings.supabaseUrl && settings.supabaseKey ? settings : null;
}

const memory = new Map<string, Promise<Drawable>>();
const MEMORY_LIMIT = 160;

interface NativeHttp {
  request(options: { url: string; method: string; responseType: string }): Promise<{ status: number; data: string; headers: Record<string, string> }>;
}

function nativeHttp(): NativeHttp | null {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { CapacitorHttp?: NativeHttp } } }).Capacitor;
  return capacitor?.isNativePlatform?.() ? capacitor.Plugins?.CapacitorHttp ?? null : null;
}

async function fetchImage(url: string, headers?: Record<string, string>): Promise<Blob | null> {
  try {
    const response = await fetch(url, { mode: "cors", headers });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith("image/") || blob.type === "application/octet-stream" ? blob : null;
  } catch {
    return null;
  }
}

async function fetchNative(url: string): Promise<Blob | null> {
  const http = nativeHttp();
  if (!http) return null;
  try {
    const response = await http.request({ url, method: "GET", responseType: "blob" });
    if (response.status !== 200 || !response.data) return null;
    const bytes = Uint8Array.from(atob(response.data), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: "image/jpeg" });
  } catch {
    return null;
  }
}

async function download(card: CardSnapshot, size: ImageSize, artworkId?: string | null): Promise<Blob | null> {
  const artwork = pickArtwork(card, artworkId);
  if (artwork) {
    const variant = size === "thumb" ? "small" : "full";
    if (source) {
      const base = source.supabaseUrl.replace(/\/+$/, "");
      const stored = await fetchImage(`${base}/storage/v1/object/public/card-images/${variant}/${artwork.id}.jpg`);
      if (stored) return stored;
      const copied = await fetchImage(`${base}/functions/v1/card-image?id=${artwork.id}&size=${variant}`, {
        apikey: source.supabaseKey,
        Authorization: `Bearer ${source.supabaseKey}`,
      });
      if (copied) return copied;
    }
    const url = size === "thumb" ? artwork.smallUrl : artwork.url;
    const blob = (await fetchNative(url)) ?? (await fetchImage(url));
    if (blob) return blob;
  }
  const fallbackUrl = size === "thumb" ? card.thumbnailUrl ?? card.imageUrl : card.imageUrl ?? card.thumbnailUrl;
  return fallbackUrl ? fetchImage(fallbackUrl) : null;
}

const imageKey = (card: CardSnapshot, size: ImageSize, artworkId?: string | null) => {
  const artwork = pickArtwork(card, artworkId);
  return artwork ? `art:${artwork.id}:${size}` : `card:${card.catalogId}:${size}`;
};

async function load(card: CardSnapshot, size: ImageSize, artworkId: string | null | undefined, key: string): Promise<Drawable> {
  let blob = await db.get<Blob>("images", key).catch(() => undefined);
  if (!blob && navigator.onLine !== false) {
    blob = (await download(card, size, artworkId)) ?? undefined;
    if (blob) await db.put("images", [blob], [key]).catch(() => undefined);
  }
  if (blob) {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* unreadable: fall through */
    }
  }
  memory.delete(key); // try again next time instead of keeping the stand-in
  const face: Drawable = drawCardFace(card, size === "thumb" ? 236 : 472);
  face.placeholder = true;
  return face;
}

/** Card image from memory, the device, or a download; a drawn stand-in if unavailable. */
export function cardImage(card: CardSnapshot, size: ImageSize = "thumb", artworkId?: string | null): Promise<Drawable> {
  const key = imageKey(card, size, artworkId);
  let pending = memory.get(key);
  if (pending) {
    memory.delete(key);
  } else {
    if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
    pending = load(card, size, artworkId, key);
  }
  memory.set(key, pending);
  return pending;
}

/** Downloads both sizes right away so a card just added is available offline. */
export async function prefetchCard(card: CardSnapshot, artworkId?: string | null) {
  await Promise.all([cardImage(card, "thumb", artworkId), cardImage(card, "full", artworkId)]);
}

/** Asks the browser not to evict the stored binders and images. */
export function persistStorage() {
  navigator.storage?.persist?.().catch(() => undefined);
}

export const coverKey = (binderId: string) => `cover:${binderId}`;

export async function saveCover(binderId: string, blob: Blob) {
  await db.put("images", [blob], [coverKey(binderId)]);
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
