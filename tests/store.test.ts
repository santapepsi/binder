import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/data/store.ts";
import type { Binder, BinderCard } from "../src/model/types.ts";

const binder = (id: string, kind: Binder["kind"]): Binder => ({
  id, name: id, kind, coverColor: "#000000", coverImage: null, sort: 0, updatedAt: 0, deleted: false, dirty: false,
});

const copy = (id: string, binderId: string, slot: number, updatedAt: number): BinderCard => ({
  id, binderId, slot, updatedAt, deleted: false, dirty: false,
  card: { catalogId: id, ygoprodeckId: null, name: id, cardType: "Spell", subtypes: ["Spell"], attribute: null, level: null, rank: null,
    linkRating: null, pendulumScale: null, atk: null, def: null, text: "", pendulumText: null, imageUrl: null, thumbnailUrl: null },
  printing: null, condition: "Near Mint", language: "English", edition: "Unlimited", notes: "",
});

test("two copies in one pocket after a sync: the newer one moves to a free pocket", () => {
  const store = new Store();
  store.binders.set("a", binder("a", "spell"));
  for (const card of [copy("old", "a", 0, 1), copy("new", "a", 0, 5), copy("other", "a", 1, 2)]) store.cards.set(card.id, card);
  const moved = store.resolveCollisions();
  assert.deepEqual(moved.map((card) => card.id), ["new"]);
  assert.equal(store.cards.get("old")!.slot, 0);
  assert.equal(store.cards.get("new")!.slot, 2);
  assert.equal(store.cards.get("new")!.dirty, true);
});

test("cards go to the binder of their type", () => {
  const store = new Store();
  store.binders.set("spells", binder("spells", "spell"));
  store.binders.set("traps", binder("traps", "trap"));
  store.binders.set("mine", binder("mine", "personal"));
  const trap = { ...copy("x", "", 0, 0).card, cardType: "Trap", subtypes: ["Normal", "Trap"] };
  assert.equal(store.binderForCard(trap)?.id, "traps");
});
