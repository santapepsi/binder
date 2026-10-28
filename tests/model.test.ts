import { test } from "node:test";
import assert from "node:assert/strict";
import { binderKindFor, rarityTag, typeLine } from "../src/model/classify.ts";
import { slotContains } from "../src/model/table.ts";
import { firstFreeSlot, pageCount, pagesOfSpread, spreadCount, spreadOfPage } from "../src/model/layout.ts";

const card = (cardType: string, subtypes: string[]) => ({ cardType, subtypes });

test("cards are routed to the binder of their type", () => {
  assert.equal(binderKindFor(card("Spell", ["Quick-Play", "Spell"])), "spell");
  assert.equal(binderKindFor(card("Trap", ["Counter", "Trap"])), "trap");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Normal"])), "monster-normal");
  assert.equal(binderKindFor(card("Monster", ["Zombie", "Tuner", "Effect"])), "monster-effect");
  assert.equal(binderKindFor(card("Monster", ["Spellcaster", "Flip", "Effect"])), "monster-effect");
  assert.equal(binderKindFor(card("Monster", ["Warrior", "Ritual"])), "monster-ritual");
  assert.equal(binderKindFor(card("Monster", ["Warrior", "Ritual", "Effect"])), "monster-ritual");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Fusion", "Effect"])), "monster-fusion");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Synchro", "Tuner", "Effect"])), "monster-synchro");
  // YGOPRODeck spells Xyz in capitals
  assert.equal(binderKindFor(card("Monster", ["Warrior", "XYZ", "Effect"])), "monster-xyz");
  assert.equal(binderKindFor(card("Monster", ["Cyberse", "Link", "Effect"])), "monster-link");
  assert.equal(binderKindFor(card("Skill", ["Kaiba"])), null);
  assert.equal(binderKindFor(card("Monster", ["Fiend", "Token"])), null);
});

test("all pendulums share one binder, whatever else they are", () => {
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Pendulum", "Effect"])), "monster-pendulum");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "XYZ", "Pendulum", "Effect"])), "monster-pendulum");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Synchro", "Pendulum", "Effect"])), "monster-pendulum");
  assert.equal(binderKindFor(card("Monster", ["Dragon", "Fusion", "Pendulum", "Effect"])), "monster-pendulum");
  assert.equal(binderKindFor(card("Monster", ["Spellcaster", "Pendulum", "Normal"])), "monster-pendulum");
});

test("rarity tags", () => {
  assert.equal(rarityTag("Common"), "C");
  assert.equal(rarityTag("Rare"), "R");
  assert.equal(rarityTag("Super Rare"), "SR");
  assert.equal(rarityTag("Ultra Rare"), "UR");
  assert.equal(rarityTag("Secret Rare"), "SCR");
  assert.equal(rarityTag("Ghost Rare"), "GR");
  assert.equal(rarityTag("Quarter Century Secret Rare"), "QCSR");
  assert.equal(rarityTag("Starlight Rare"), "STR");
  assert.equal(rarityTag(null), "");
});

test("type line", () => {
  assert.equal(typeLine(card("Spell", ["Quick-Play", "Spell"])), "Quick-Play Spell");
  assert.equal(typeLine(card("Spell", ["Normal", "Spell"])), "Spell");
  assert.equal(typeLine(card("Monster", ["Warrior", "XYZ", "Effect"])), "Warrior / Xyz / Effect");
});

test("pages grow with the cards and keep one empty page at the end", () => {
  assert.equal(pageCount([]), 1);
  assert.equal(pageCount([0]), 2);
  assert.equal(pageCount([8]), 2);
  assert.equal(pageCount([9]), 3);
  assert.equal(pageCount([3, 40]), 6);
});

test("spreads: inside cover + page 1, then pairs of pages", () => {
  assert.deepEqual(pagesOfSpread(0, 4), { left: -1, right: 0 });
  assert.deepEqual(pagesOfSpread(1, 4), { left: 1, right: 2 });
  assert.deepEqual(pagesOfSpread(2, 4), { left: 3, right: null });
  assert.equal(spreadCount(1), 1);
  assert.equal(spreadCount(2), 2);
  assert.equal(spreadCount(4), 3);
  assert.equal(spreadOfPage(0), 0);
  assert.equal(spreadOfPage(1), 1);
  assert.equal(spreadOfPage(2), 1);
  assert.equal(spreadOfPage(3), 2);
});

test("first free slot", () => {
  assert.equal(firstFreeSlot(new Set()), 0);
  assert.equal(firstFreeSlot(new Set([0, 1, 3])), 2);
  assert.equal(firstFreeSlot(new Set([0, 1, 3]), 3), 4);
});

test("table spots: hit test follows the rotation", () => {
  const spot = { id: "a", x: 30, z: 0, rotation: Math.PI / 2, card: null, artworkId: null, faceDown: false };
  // rotated a quarter turn, the long side lies along x
  assert.equal(slotContains(spot, 34, 0), true);
  assert.equal(slotContains(spot, 30, 4), false);
  assert.equal(slotContains({ ...spot, rotation: 0 }, 30, 4), true);
});

import { DEFAULT_BINDERS, coverBottom, coverTop, recoloredDefault, updatedDefaultColor } from "../src/model/classify.ts";

test("binders on the old default colours move to the new ones; custom colours stay", () => {
  assert.equal(updatedDefaultColor({ kind: "monster-xyz", name: "Xyz Monsters", coverColor: "#1d1d22" }), "#1c1c1f");
  assert.equal(updatedDefaultColor({ kind: "personal", name: "Personal II", coverColor: "#23283a" }), "#eceef1");
  assert.equal(updatedDefaultColor({ kind: "spell", name: "Spells", coverColor: "#123456" }), null);
  const colour = (kind: string) => DEFAULT_BINDERS.find((preset) => preset.kind === kind)!.coverColor;
  assert.equal(colour("monster-link"), colour("monster-ritual"));
  // Normal is beige, Effect orange-brown; Pendulum is orange-brown over spell green.
  assert.equal(colour("monster-normal"), "#d8c8a4");
  assert.equal(colour("monster-effect"), "#a8581f");
  assert.equal(colour("monster-pendulum"), `${colour("monster-effect")}|${colour("spell")}`);
  assert.equal(coverTop(colour("monster-pendulum")), "#a8581f");
  assert.equal(coverBottom(colour("monster-pendulum")), "#1f5b2c");
  // One-time move from the old red / green defaults; personal binders are never touched.
  assert.equal(recoloredDefault({ kind: "monster-normal", coverColor: "#d21f2d" }), "#d8c8a4");
  assert.equal(recoloredDefault({ kind: "monster-effect", coverColor: "#d21f2d" }), "#a8581f");
  assert.equal(recoloredDefault({ kind: "personal", coverColor: "#d21f2d" }), null);
  assert.equal(recoloredDefault({ kind: "monster-normal", coverColor: "#123456" }), null);
});
