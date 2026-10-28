// Builds the app's card database: downloads every card from YGOPRODeck (or
// reads a saved copy), keeps only the fields the app uses and writes
// dist/data/cards.json + dist/data/version.json, published with the web app.
// The app then downloads it from the same site, which avoids depending on
// YGOPRODeck allowing requests from other websites.
//
// Usage: node scripts/build-card-db.mjs [saved-cardinfo.json]
import { mkdir, readFile, writeFile } from "node:fs/promises";

const API = "https://db.ygoprodeck.com/api/v7";
const source = process.argv[2];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "binder (personal card collection app)" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

const raw = source ? JSON.parse(await readFile(source, "utf8")) : await fetchJson(`${API}/cardinfo.php`);
let version = "local";
if (!source) {
  const [info] = await fetchJson(`${API}/checkDBVer.php`);
  version = `${info.database_version} (${info.last_update})`;
}

const keep = (card) => {
  const out = { id: card.id, name: card.name, type: card.type };
  for (const key of ["desc", "pend_desc", "monster_desc", "race", "attribute", "atk", "def", "level", "scale", "linkval"])
    if (card[key] !== undefined && card[key] !== null) out[key] = card[key];
  if (card.card_sets?.length)
    out.card_sets = card.card_sets.map((set) => ({ set_name: set.set_name, set_code: set.set_code, set_rarity: set.set_rarity }));
  out.card_images = (card.card_images ?? []).map((image) => ({ id: image.id }));
  return out;
};

const data = raw.data.map(keep);
await mkdir("dist/data", { recursive: true });
await writeFile("dist/data/cards.json", JSON.stringify({ version, data }));
await writeFile("dist/data/version.json", JSON.stringify({ version, cards: data.length }));
console.log(`card database: ${data.length} cards, version ${version}`);
