// The card catalog: every card's texts, sets and artworks, downloaded once from
// YGOPRODeck (~14,000 cards) and kept on the device. Searching works offline.
// It is refreshed when YGOPRODeck publishes a new database version (checked at
// most once a day). Images are not part of this; see images.ts.

import { sortArtworks, ygoprodeckArtwork } from "../model/artworks.ts";
import type { Artwork, CardSnapshot, PrintingRef } from "../model/types.ts";
import * as db from "./db.ts";

const API = "https://db.ygoprodeck.com/api/v7";
const CHECK_EVERY = 24 * 60 * 60 * 1000;
export const PAGE_SIZE = 40;

export interface CatalogHit {
  id: string;
  name: string;
  cardType: string;
  subtypes: string[];
  attribute: string | null;
}

export interface CatalogPrinting extends PrintingRef {
  language: string;
  market: string;
}

/** A card as stored in the local database. */
interface Entry {
  card: CardSnapshot;
  sets: { code: string; setName: string; rarity: string }[];
  search: string; // lower-case name, for matching
}

interface Stored {
  version: string;
  updatedAt: number; // when it was downloaded
  checkedAt: number; // last time the version was checked
  cards: Entry[];
}

export interface CatalogInfo {
  cards: number;
  version: string | null;
  updatedAt: number | null;
}

// ---------------------------------------------------------------- YGOPRODeck format

interface RawCard {
  id: number;
  name: string;
  type: string;
  desc?: string;
  pend_desc?: string;
  monster_desc?: string;
  race?: string;
  attribute?: string;
  atk?: number;
  def?: number;
  level?: number;
  scale?: number;
  linkval?: number;
  card_sets?: { set_name: string; set_code: string; set_rarity: string }[];
  card_images?: { id: number; image_url?: string; image_url_small?: string }[];
}

/** Turns a YGOPRODeck record into the card data the binder stores. */
export function normalize(raw: RawCard): Entry {
  const kind =
    raw.type === "Spell Card" ? "Spell" : raw.type === "Trap Card" ? "Trap" : raw.type.includes("Skill") ? "Skill" : "Monster";
  const subtypes = raw.type.split(/\s+/).filter((part) => !["Monster", "Card", "Skill"].includes(part));
  if (raw.race && !subtypes.includes(raw.race)) subtypes.unshift(raw.race);
  const xyz = /xyz/i.test(raw.type);
  const artworks: Artwork[] = (raw.card_images ?? []).map((image) => ygoprodeckArtwork(image.id));
  if (!artworks.length) artworks.push(ygoprodeckArtwork(raw.id));
  const pendulum = /pendulum/i.test(raw.type);
  return {
    card: {
      catalogId: String(raw.id),
      ygoprodeckId: raw.id,
      name: raw.name,
      cardType: kind,
      subtypes,
      attribute: raw.attribute ?? null,
      level: !xyz && raw.level !== undefined && !raw.linkval ? raw.level : null,
      rank: xyz ? raw.level ?? null : null,
      linkRating: raw.linkval ?? null,
      pendulumScale: raw.scale ?? null,
      atk: raw.atk !== undefined ? String(raw.atk) : null,
      def: raw.def !== undefined && !raw.linkval ? String(raw.def) : null,
      text: (pendulum ? raw.monster_desc ?? raw.desc : raw.desc) ?? "",
      pendulumText: pendulum ? raw.pend_desc ?? null : null,
      imageUrl: null,
      thumbnailUrl: null,
      artworks: sortArtworks(artworks, raw.id),
    },
    sets: (raw.card_sets ?? []).map((set) => ({ code: set.set_code, setName: set.set_name, rarity: set.set_rarity })),
    search: raw.name.toLowerCase(),
  };
}

const LANGUAGE_CODES: Record<string, string> = {
  EN: "en", E: "en", FR: "fr", F: "fr", DE: "de", G: "de", IT: "it", I: "it", PT: "pt", P: "pt", SP: "es", S: "es",
  JP: "ja", KR: "ko", AE: "ae", SC: "zh", TC: "zh",
};

function languageOf(code: string): string {
  const match = /-([A-Z]{1,2})\d/.exec(code);
  return match ? LANGUAGE_CODES[match[1]] ?? "en" : "en";
}

// ---------------------------------------------------------------- catalog

export type Progress = (state: { phase: "checking" | "downloading" | "saving"; bytes?: number }) => void;

export class Catalog {
  private entries: Entry[] | null = null;
  private byId = new Map<string, Entry>();
  private loading: Promise<void> | null = null;
  private meta: Omit<Stored, "cards"> | null = null;
  private readonly source: string;

  /** `source` overrides the database URL (tests and debugging). */
  constructor(source = `${API}/cardinfo.php`) {
    this.source = source;
  }

  get ready() {
    return this.entries !== null;
  }

  info(): CatalogInfo {
    return { cards: this.entries?.length ?? 0, version: this.meta?.version ?? null, updatedAt: this.meta?.updatedAt ?? null };
  }

  /** Loads the local copy, downloading it the first time. Safe to call repeatedly. */
  ensure(progress?: Progress): Promise<void> {
    this.loading ??= this.load(progress).finally(() => (this.loading = null));
    return this.loading;
  }

  private async load(progress?: Progress) {
    if (!this.entries) {
      const stored = await db.get<Stored>("meta", "catalog").catch(() => undefined);
      if (stored?.cards?.length) this.use(stored);
    }
    if (!this.entries) {
      await this.download(progress);
      return;
    }
    // Refresh in the background when YGOPRODeck has a newer database.
    if (navigator.onLine !== false && Date.now() - (this.meta?.checkedAt ?? 0) > CHECK_EVERY) {
      this.refreshIfChanged().catch(() => undefined);
    }
  }

  private use(stored: Stored) {
    this.entries = stored.cards;
    this.byId = new Map(stored.cards.map((entry) => [entry.card.catalogId, entry]));
    const { cards: _cards, ...meta } = stored;
    this.meta = meta;
  }

  private async remoteVersion(): Promise<string> {
    if (this.source !== `${API}/cardinfo.php`) return "local";
    const response = await fetch(`${API}/checkDBVer.php`);
    const data = (await response.json()) as { database_version: string; last_update: string }[];
    return `${data[0]?.database_version ?? "?"} (${data[0]?.last_update ?? ""})`;
  }

  async refreshIfChanged(progress?: Progress) {
    progress?.({ phase: "checking" });
    const version = await this.remoteVersion();
    if (version === this.meta?.version) {
      this.meta = { ...this.meta, checkedAt: Date.now() };
      await db.put("meta", [{ ...this.meta, cards: this.entries }], ["catalog"]).catch(() => undefined);
      return false;
    }
    await this.download(progress, version);
    return true;
  }

  private async download(progress?: Progress, knownVersion?: string) {
    const version = knownVersion ?? (await this.remoteVersion().catch(() => "unknown"));
    progress?.({ phase: "downloading", bytes: 0 });
    const response = await fetch(this.source);
    if (!response.ok || !response.body) throw new Error(`The card database answered ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.length;
      progress?.({ phase: "downloading", bytes });
    }
    progress?.({ phase: "saving", bytes });
    const text = await new Blob(chunks as BlobPart[]).text();
    const raw = JSON.parse(text) as { data: RawCard[] };
    const stored: Stored = {
      version,
      updatedAt: Date.now(),
      checkedAt: Date.now(),
      cards: raw.data.map(normalize),
    };
    this.use(stored);
    await db.put("meta", [stored], ["catalog"]);
  }

  async search(query: string, page: number): Promise<{ items: CatalogHit[]; total: number }> {
    await this.ensure();
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = this.entries ?? [];
    const exactId = /^\d{4,10}$/.test(query.trim()) ? this.byId.get(String(Number(query.trim()))) : undefined;
    let matches = words.length ? all.filter((entry) => words.every((word) => entry.search.includes(word))) : all;
    if (words.length) {
      // Names starting with the query first, then alphabetical.
      const head = words.join(" ");
      matches = [...matches].sort(
        (a, b) => Number(!b.search.startsWith(head)) - Number(!a.search.startsWith(head)) || a.search.localeCompare(b.search)
      );
    }
    if (exactId && !matches.includes(exactId)) matches = [exactId, ...matches];
    return {
      total: matches.length,
      items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ card }) => ({
        id: card.catalogId,
        name: card.name,
        cardType: card.cardType,
        subtypes: card.subtypes,
        attribute: card.attribute,
      })),
    };
  }

  async card(id: string): Promise<CardSnapshot> {
    await this.ensure();
    const entry = this.byId.get(id);
    if (!entry) throw new Error("Card not found in the database");
    return structuredClone(entry.card);
  }

  /** Loads the copy stored on this device, without downloading. */
  private async loadStored() {
    if (this.entries) return;
    const stored = await db.get<Stored>("meta", "catalog").catch(() => undefined);
    if (stored?.cards?.length && !this.entries) this.use(stored);
  }

  /** Set printings of a card. With download = false it only uses the copy already on the device. */
  async printings(id: string, download = true): Promise<CatalogPrinting[]> {
    if (download) await this.ensure();
    else await this.loadStored();
    return (this.byId.get(id)?.sets ?? []).map((set) => ({
      id: `${set.code}|${set.rarity}`,
      code: set.code,
      setName: set.setName,
      rarity: set.rarity,
      language: languageOf(set.code),
      market: "TCG",
    }));
  }
}
