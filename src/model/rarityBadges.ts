// Rarity badges shown on the pockets and in the card panel. Pictures for the
// rarities we have artwork for; a badge in the same style is drawn for the rest.

import collectors_rare from "../assets/rarities/collectors-rare.png";
import common from "../assets/rarities/common.png";
import extra_secret_rare from "../assets/rarities/extra-secret-rare.png";
import ghost_rare from "../assets/rarities/ghost-rare.png";
import gold_rare from "../assets/rarities/gold-rare.png";
import gold_secret_rare from "../assets/rarities/gold-secret-rare.png";
import grand_master_rare from "../assets/rarities/grand-master-rare.png";
import holographic_rare from "../assets/rarities/holographic-rare.png";
import mosaic_rare from "../assets/rarities/mosaic-rare.png";
import oversized from "../assets/rarities/oversized.png";
import parallel_rare from "../assets/rarities/parallel-rare.png";
import platinum_rare from "../assets/rarities/platinum-rare.png";
import platinum_secret_rare from "../assets/rarities/platinum-secret-rare.png";
import premium_gold_rare from "../assets/rarities/premium-gold-rare.png";
import quarter_century_secret_rare from "../assets/rarities/quarter-century-secret-rare.png";
import rare from "../assets/rarities/rare.png";
import secret_parallel_rare from "../assets/rarities/secret-parallel-rare.png";
import secret_rare from "../assets/rarities/secret-rare.png";
import shatterfoil from "../assets/rarities/shatterfoil.png";
import special from "../assets/rarities/special.png";
import starfoil_rare from "../assets/rarities/starfoil-rare.png";
import starlight_rare from "../assets/rarities/starlight-rare.png";
import super_parallel_rare from "../assets/rarities/super-parallel-rare.png";
import super_rare from "../assets/rarities/super-rare.png";
import ultra_rare from "../assets/rarities/ultra-rare.png";
import ultimate_rare from "../assets/rarities/ultimate-rare.png";
import { rarityTag } from "./classify.ts";

const PICTURES: Record<string, string> = {
  "ultimate-rare": ultimate_rare,
  "ultra-rare": ultra_rare,
  "collectors-rare": collectors_rare,
  "common": common,
  "extra-secret-rare": extra_secret_rare,
  "ghost-rare": ghost_rare,
  "gold-rare": gold_rare,
  "gold-secret-rare": gold_secret_rare,
  "grand-master-rare": grand_master_rare,
  "holographic-rare": holographic_rare,
  "mosaic-rare": mosaic_rare,
  "oversized": oversized,
  "parallel-rare": parallel_rare,
  "platinum-rare": platinum_rare,
  "platinum-secret-rare": platinum_secret_rare,
  "premium-gold-rare": premium_gold_rare,
  "quarter-century-secret-rare": quarter_century_secret_rare,
  "rare": rare,
  "secret-parallel-rare": secret_parallel_rare,
  "secret-rare": secret_rare,
  "shatterfoil": shatterfoil,
  "special": special,
  "starfoil-rare": starfoil_rare,
  "starlight-rare": starlight_rare,
  "super-parallel-rare": super_parallel_rare,
  "super-rare": super_rare,
};

/** Rarity names as YGOPRODeck writes them that map to another picture. */
const ALIASES: Record<string, string> = {
  "shatterfoil-rare": "shatterfoil",
  "holofoil-rare": "holographic-rare",
  "oversized-rare": "oversized",
};

export const raritySlug = (rarity: string) =>
  rarity.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** URL of the badge picture for a rarity, or null when it is drawn instead. */
export function rarityPicture(rarity: string | null | undefined): string | null {
  if (!rarity) return null;
  const slug = raritySlug(rarity);
  const file = PICTURES[ALIASES[slug] ?? slug];
  // Bundled file paths are relative to this script, not to the page.
  return file ? new URL(file, import.meta.url).href : null;
}

/** Colours (dark half, light half) for drawn badges, in the style of the pictures. */
const DRAWN: Record<string, [string, string]> = {
  UR: ["#a8761f", "#dba63b"],
  UTR: ["#6e5317", "#c49b3f"],
  SP: ["#4a4f58", "#79808c"],
  SCR: ["#c0272f", "#ec2730"],
  DT: ["#1f3f8f", "#3a6fd8"],
};

/** Draws a badge in the pictures' style: rounded box, two-tone diagonal, white letters. */
export function drawRarityBadge(rarity: string, height = 54): HTMLCanvasElement {
  const tag = rarityTag(rarity) || "?";
  const width = Math.round(height * (80 / 54));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const [dark, light] = DRAWN[tag] ?? ["#3f4652", "#6b7686"];
  context.save();
  context.beginPath();
  context.roundRect(0, 0, width, height, height * 0.12);
  context.clip();
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  context.fillStyle = dark;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(width * 0.62, 0);
  context.lineTo(width * 0.3, height);
  context.lineTo(0, height);
  context.fill();
  context.restore();
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = height * 0.78;
  context.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  while (context.measureText(tag).width > width * 0.86 && size > 8) context.font = `900 ${(size -= 1)}px Nunito, system-ui, sans-serif`;
  context.fillText(tag, width / 2, height * 0.54);
  return canvas;
}

const loaded = new Map<string, HTMLImageElement>();

/** Loads every badge picture once; `onReady` runs when they can be drawn on canvases. */
export function preloadRarityPictures(onReady: () => void) {
  let pending = 0;
  for (const file of Object.values(PICTURES)) {
    const url = new URL(file, import.meta.url).href;
    if (loaded.has(url)) continue;
    const image = new Image();
    pending++;
    image.onload = image.onerror = () => {
      if (--pending === 0) onReady();
    };
    image.src = url;
    loaded.set(url, image);
  }
}

/** Something drawable for a rarity right now (loaded picture or drawn badge). */
export function rarityBadge(rarity: string | null | undefined): CanvasImageSource | null {
  if (!rarity) return null;
  const url = rarityPicture(rarity);
  const image = url ? loaded.get(url) : undefined;
  if (image?.complete && image.naturalWidth) return image;
  return drawRarityBadge(rarity);
}
