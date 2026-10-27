import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize } from "../src/data/catalog.ts";
import { binderKindFor } from "../src/model/classify.ts";

const raw = JSON.parse(readFileSync(new URL("./fixtures/cardinfo.json", import.meta.url), "utf8")).data;
const byName = (name: string) => normalize(raw.find((card: { name: string }) => card.name === name));

test("YGOPRODeck cards are classified like Cardmática does", () => {
  assert.equal(binderKindFor(byName("Pot of Greed").card), "spell");
  assert.equal(binderKindFor(byName("Mirror Force").card), "trap");
  assert.equal(binderKindFor(byName("Dark Magician").card), "monster-normal");
  assert.equal(binderKindFor(byName("Ash Blossom & Joyous Spring").card), "monster-effect");
  assert.equal(binderKindFor(byName("Number 39: Utopia").card), "monster-xyz");
  assert.equal(binderKindFor(byName("Decode Talker").card), "monster-link");
  assert.equal(binderKindFor(byName("Odd-Eyes Pendulum Dragon").card), "monster-pendulum");
});

test("all artworks are kept, main one first", () => {
  const card = byName("Dark Magician").card;
  assert.deepEqual(card.artworks?.map((art) => art.id), ["46986414", "46986415", "46986416"]);
  assert.match(card.artworks![1].smallUrl, /cards_small\/46986415\.jpg$/);
});

test("stats and texts", () => {
  const utopia = byName("Number 39: Utopia").card;
  assert.equal(utopia.rank, 4);
  assert.equal(utopia.level, null);
  const decode = byName("Decode Talker").card;
  assert.equal(decode.linkRating, 3);
  assert.equal(decode.def, null);
  const odd = byName("Odd-Eyes Pendulum Dragon").card;
  assert.equal(odd.pendulumScale, 4);
  assert.ok(odd.pendulumText);
  assert.equal(byName("Mystical Space Typhoon").card.subtypes.join(" "), "Quick-Play Spell");
});

test("every set printing is kept", () => {
  assert.equal(byName("Stardust Dragon").sets.length, 2);
});
