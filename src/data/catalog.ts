// Read-only access to the card catalog. The real source is Cardmática's public
// API (/api/v1); the binder never writes to it. Without a configured server a
// small built-in demo catalog is used so the app can be tried right away.

import type { CardSnapshot, PrintingRef } from "../model/types.ts";

export interface CatalogHit {
  id: string;
  name: string;
  cardType: string;
  subtypes: string[];
  attribute: string | null;
  thumbnailUrl: string | null;
}

export interface CatalogPrinting extends PrintingRef {
  language: string;
  market: string;
}

export interface Catalog {
  readonly label: string;
  search(query: string, page: number, signal?: AbortSignal): Promise<{ items: CatalogHit[]; total: number }>;
  card(id: string, signal?: AbortSignal): Promise<CardSnapshot>;
  printings(id: string, signal?: AbortSignal): Promise<CatalogPrinting[]>;
}

export const PAGE_SIZE = 24;

interface ApiImage {
  url: string | null;
  thumbnail_url: string | null;
}
interface ApiSummary {
  id: string;
  ygoprodeck_id: number | null;
  name: string;
  card_type: string | null;
  subtypes: string[];
  attribute: string | null;
  image: ApiImage | null;
}
interface ApiDetail extends ApiSummary {
  artworks: ApiImage[];
  level: number | null;
  rank: number | null;
  link_rating: number | null;
  atk: string | null;
  defense: string | null;
  pendulum_scale: number | null;
  texts: { language: string; text: string; pendulum_text: string | null; is_current: boolean }[];
}
interface ApiPrinting {
  id: string;
  code: string;
  set_name: string;
  rarity: string;
  language: string;
  market: string;
}
interface ApiPage<T> {
  items: T[];
  total: number;
}

export class CardmaticaCatalog implements Catalog {
  readonly label = "Cardmática";
  constructor(private readonly base: string) {}

  private absolute(path: string | null | undefined): string | null {
    return path ? new URL(path, this.base + "/").href : null;
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(`/api/v1/${path}`, this.base + "/");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalog answered ${response.status}`);
    return response.json() as Promise<T>;
  }

  async search(query: string, page: number, signal?: AbortSignal) {
    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE, language: "en", sort: "name" };
    if (query.trim()) params.q = query.trim();
    const data = await this.get<ApiPage<ApiSummary>>("cards", params, signal);
    return {
      total: data.total,
      items: data.items.map((item) => ({
        id: item.id,
        name: item.name,
        cardType: item.card_type ?? "Monster",
        subtypes: item.subtypes,
        attribute: item.attribute,
        thumbnailUrl: this.absolute(item.image?.thumbnail_url ?? item.image?.url),
      })),
    };
  }

  async card(id: string, signal?: AbortSignal): Promise<CardSnapshot> {
    const data = await this.get<ApiDetail>(`cards/${id}`, { language: "en" }, signal);
    const current = data.texts.filter((text) => text.is_current);
    const text = current.find((entry) => entry.language === "en") ?? current[0] ?? data.texts[0];
    const image = data.image?.url ? data.image : data.artworks.find((art) => art.url) ?? null;
    return {
      catalogId: data.id,
      ygoprodeckId: data.ygoprodeck_id,
      name: data.name,
      cardType: data.card_type ?? "Monster",
      subtypes: data.subtypes,
      attribute: data.attribute,
      level: data.level,
      rank: data.rank,
      linkRating: data.link_rating,
      pendulumScale: data.pendulum_scale,
      atk: data.atk,
      def: data.defense,
      text: text?.text ?? "",
      pendulumText: text?.pendulum_text ?? null,
      imageUrl: this.absolute(image?.url),
      thumbnailUrl: this.absolute(image?.thumbnail_url ?? image?.url),
    };
  }

  async printings(id: string, signal?: AbortSignal): Promise<CatalogPrinting[]> {
    const all: CatalogPrinting[] = [];
    for (let page = 1; page <= 10; page++) {
      const data = await this.get<ApiPage<ApiPrinting>>(`cards/${id}/printings`, { page, page_size: 100 }, signal);
      all.push(
        ...data.items.map((item) => ({
          id: item.id,
          code: item.code,
          setName: item.set_name,
          rarity: item.rarity,
          language: item.language,
          market: item.market,
        }))
      );
      if (all.length >= data.total || !data.items.length) break;
    }
    return all;
  }
}

/** Demo catalog: a handful of cards bundled in a separate, lazily loaded chunk. */
export class DemoCatalog implements Catalog {
  readonly label = "Demo catalog";
  private cards = import("./demoCards.ts").then((module) => module.DEMO_CARDS);

  async search(query: string, page: number) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (await this.cards).filter((entry) =>
      words.every((word) => `${entry.card.name} ${entry.card.subtypes.join(" ")} ${entry.card.cardType}`.toLowerCase().includes(word))
    );
    return {
      total: matches.length,
      items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ card }) => ({
        id: card.catalogId,
        name: card.name,
        cardType: card.cardType,
        subtypes: card.subtypes,
        attribute: card.attribute,
        thumbnailUrl: null,
      })),
    };
  }

  async card(id: string) {
    const entry = (await this.cards).find((item) => item.card.catalogId === id);
    if (!entry) throw new Error("Card not found");
    return { ...entry.card };
  }

  async printings(id: string) {
    const entry = (await this.cards).find((item) => item.card.catalogId === id);
    return (entry?.printings ?? []).map((printing) => ({ ...printing, language: "en", market: "TCG" }));
  }
}

export function createCatalog(url: string): Catalog {
  return url ? new CardmaticaCatalog(url) : new DemoCatalog();
}
