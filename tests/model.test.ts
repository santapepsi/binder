import { test } from "node:test";
import assert from "node:assert/strict";
import { binderKindFor, rarityTag, typeLine } from "../src/model/classify.ts";
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
