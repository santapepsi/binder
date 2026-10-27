// YGOPRODeck illustrations. Every card has a main image whose id is the card's
// own id; some have alternate artworks with other ids.
import type { Artwork, CardSnapshot } from "./types.ts";

const BASE = "https://images.ygoprodeck.com/images";

export const ygoprodeckArtwork = (id: number | string): Artwork => ({
  id: String(id),
  url: `${BASE}/cards/${id}.jpg`,
  smallUrl: `${BASE}/cards_small/${id}.jpg`,
});

/** Builds an artwork from a YGOPRODeck image URL. */
export function artworkFromUrl(url: string): Artwork | null {
  const match = /\/images\/cards(?:_small|_cropped)?\/(\d+)\.(?:jpg|png|webp)$/i.exec(url);
  return match ? ygoprodeckArtwork(match[1]) : null;
}

/** Main artwork first, then the alternates in id order, without duplicates. */
export function sortArtworks(artworks: Artwork[], mainId: number | null): Artwork[] {
  const unique = [...new Map(artworks.map((art) => [art.id, art])).values()];
  return unique.sort((a, b) => {
    if (String(mainId) === a.id) return -1;
    if (String(mainId) === b.id) return 1;
    return Number(a.id) - Number(b.id);
  });
}

export function artworksOf(card: CardSnapshot): Artwork[] {
  if (card.artworks?.length) return card.artworks;
  return card.ygoprodeckId ? [ygoprodeckArtwork(card.ygoprodeckId)] : [];
}

/** The artwork chosen for a copy, or the card's main artwork. */
export function pickArtwork(card: CardSnapshot, artworkId?: string | null): Artwork | null {
  const all = artworksOf(card);
  return all.find((art) => art.id === artworkId) ?? all[0] ?? null;
}
