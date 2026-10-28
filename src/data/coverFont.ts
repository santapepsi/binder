// Optional font for the lettering on binder covers. The user loads the font
// file once (Settings); it is kept on the device and in the account's private
// storage, never published with the app, since many card fonts are licensed.

import * as db from "./db.ts";

const KEY = "coverfont";
const DIRTY = "coverfont-dirty";
const ETAG = "coverfont-etag";
export const FAMILY = "CoverLettering";

let face: FontFace | null = null;

export async function coverFontBlob(): Promise<Blob | undefined> {
  return db.get<Blob>("images", KEY).catch(() => undefined);
}

/** Registers the stored font (if any) under the cover lettering family. */
export async function loadCoverFont(): Promise<boolean> {
  if (face) {
    document.fonts.delete(face);
    face = null;
  }
  const blob = await coverFontBlob();
  if (blob) {
    try {
      face = new FontFace(FAMILY, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
    } catch {
      face = null;
    }
  }
  window.dispatchEvent(new Event("coverfont"));
  return face !== null;
}

/** Sets (or clears, with null) the font chosen on this device; it syncs to the account. */
export async function setCoverFont(blob: Blob | null): Promise<boolean> {
  if (blob) {
    // Check it is a usable font before keeping it.
    const test = new FontFace("CoverLetteringTest", await blob.arrayBuffer());
    await test.load();
    await db.put("images", [blob], [KEY]);
  } else await db.remove("images", KEY).catch(() => undefined);
  await db.put("meta", [true], [DIRTY]);
  return loadCoverFont();
}

// ---- used by the account sync

export const coverFontState = async () => ({
  dirty: (await db.get<boolean>("meta", DIRTY).catch(() => false)) ?? false,
  etag: (await db.get<string>("meta", ETAG).catch(() => undefined)) ?? null,
});

export async function markCoverFontSynced(etag: string | null) {
  await db.put("meta", [false, etag], [DIRTY, ETAG]);
}

/** Takes the account's font (or its removal) without marking it for upload. */
export async function applyRemoteCoverFont(blob: Blob | null, etag: string | null) {
  if (blob) await db.put("images", [blob], [KEY]);
  else await db.remove("images", KEY).catch(() => undefined);
  await markCoverFontSynced(etag);
  await loadCoverFont();
}
