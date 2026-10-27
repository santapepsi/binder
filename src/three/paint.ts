// 2D canvas painters for everything textured in the scene: the wooden table,
// cover boards, glow frames, and the pocket pages with their cards.

import { POCKETS } from "../model/layout.ts";
import { rarityTag } from "../model/classify.ts";
import type { BinderCard } from "../model/types.ts";
import type { Drawable } from "../data/images.ts";
import {
  BINDING_MARGIN,
  HOLE_X,
  HOLE_FRACTIONS,
  PAGE_H,
  PAGE_W,
  TEXTURE_H,
  TEXTURE_SCALE,
  TEXTURE_W,
  cardRect,
  pocketRect,
} from "./dimensions.ts";

const canvas = (width: number, height: number) => {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
};

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Dark reddish wood with long grain, tileable horizontally. */
export function paintWood(size = 1024): HTMLCanvasElement {
  const element = canvas(size, size);
  const context = element.getContext("2d")!;
  const rand = random(7);
  context.fillStyle = "#4a2a21";
  context.fillRect(0, 0, size, size);
  for (let plank = 0; plank < 4; plank++) {
    const top = (plank * size) / 4;
    const tone = 0.85 + rand() * 0.3;
    context.fillStyle = `rgba(${Math.round(80 * tone)},${Math.round(46 * tone)},${Math.round(36 * tone)},0.9)`;
    context.fillRect(0, top, size, size / 4);
    for (let line = 0; line < 70; line++) {
      const y = top + rand() * (size / 4);
      const amplitude = 2 + rand() * 6;
      const frequency = (1 + Math.floor(rand() * 3)) * (Math.PI * 2) / size;
      const phase = rand() * Math.PI * 2;
      context.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin(x * frequency + phase) * amplitude;
        if (x === 0) context.moveTo(x, yy);
        else context.lineTo(x, yy);
      }
      const dark = rand() > 0.5;
      context.strokeStyle = dark ? `rgba(28,12,8,${0.15 + rand() * 0.3})` : `rgba(140,92,70,${0.06 + rand() * 0.12})`;
      context.lineWidth = 0.6 + rand() * 2.4;
      context.stroke();
    }
    context.fillStyle = "rgba(15,6,4,0.65)";
    context.fillRect(0, top, size, 2);
  }
  return element;
}

const shade = (hex: string, amount: number) => {
  const value = parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * amount)));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
};

/** Outer face of the front cover: colour or picture, a soft leather grain and a name plate. */
export function paintCover(color: string, image: ImageBitmap | null, name: string): HTMLCanvasElement {
  const width = 512;
  const height = Math.round((width * 32) / 26);
  const element = canvas(width, height);
  const context = element.getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  if (image) {
    const scale = Math.max(width / image.width, height / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  }
  const rand = random(11);
  for (let index = 0; index < 2600; index++) {
    context.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.05)";
    context.fillRect(rand() * width, rand() * height, 2, 2);
  }
  const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.85);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  // stitched border
  context.setLineDash([10, 7]);
  context.strokeStyle = "rgba(255,255,255,0.28)";
  context.lineWidth = 2;
  context.strokeRect(18, 18, width - 36, height - 36);
  context.setLineDash([]);
  // name plate
  const plateW = width * 0.62;
  const plateX = (width - plateW) / 2;
  context.fillStyle = "rgba(15,10,8,0.72)";
  context.beginPath();
  context.roundRect(plateX, 52, plateW, 64, 10);
  context.fill();
  context.strokeStyle = "rgba(230,200,120,0.85)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#f3e2b0";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = 34;
  context.font = `900 ${size}px Nunito, system-ui, sans-serif`;
  while (context.measureText(name).width > plateW - 30 && size > 14) context.font = `900 ${--size}px Nunito, system-ui, sans-serif`;
  context.fillText(name, width / 2, 85);
  return element;
}

/** Inside of a board: darker version of the cover colour with a slight cloth texture. */
export function paintInside(color: string): HTMLCanvasElement {
  const element = canvas(256, 320);
  const context = element.getContext("2d")!;
  context.fillStyle = shade(color, 0.42);
  context.fillRect(0, 0, 256, 320);
  const rand = random(3);
  for (let index = 0; index < 1200; index++) {
    context.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.07)";
    context.fillRect(rand() * 256, rand() * 320, 1.5, 1.5);
  }
  return element;
}

export function edgeColor(color: string) {
  return shade(color, 0.6);
}

/** Yellow glowing frame drawn over the hovered or selected pocket. */
export function paintGlow(): HTMLCanvasElement {
  const width = 160;
  const height = 210;
  const element = canvas(width, height);
  const context = element.getContext("2d")!;
  context.shadowColor = "rgba(255, 236, 140, 1)";
  context.shadowBlur = 18;
  context.strokeStyle = "rgba(255, 246, 190, 1)";
  context.lineWidth = 9;
  for (let pass = 0; pass < 3; pass++) context.strokeRect(18, 18, width - 36, height - 36);
  return element;
}

const RARITY_STYLE: Record<string, string> = {
  C: "#5f5a52",
  R: "#7d8794",
  SR: "#2c63b8",
  UR: "#b78a17",
  SCR: "#7b3fb8",
  GR: "#5e6f80",
  UTR: "#8a6a2a",
  STR: "#c0367d",
  QCSR: "#b03a2e",
  CR: "#9e4f1c",
};

function wrapText(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export interface PagePainterInput {
  page: number;
  holesOnLeft: boolean;
  cards: Map<number, BinderCard>; // pocket -> card
  hiddenPocket: number | null;
  imageFor: (card: BinderCard) => Drawable | undefined; // undefined while downloading
}

/** One side of a pocket page. Returns the canvas; call again to repaint the same canvas. */
export function paintPage(target: HTMLCanvasElement | null, input: PagePainterInput): HTMLCanvasElement {
  const element = target ?? canvas(TEXTURE_W, TEXTURE_H);
  const context = element.getContext("2d")!;
  const s = TEXTURE_SCALE;
  context.setTransform(1, 0, 0, 1, 0, 0);
  // Sheet: warm translucent plastic over the backing.
  const base = context.createLinearGradient(0, 0, TEXTURE_W, TEXTURE_H);
  base.addColorStop(0, "#d8cec1");
  base.addColorStop(1, "#c8bdae");
  context.fillStyle = base;
  context.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
  // Binding strip with punched holes.
  const stripX = input.holesOnLeft ? 0 : (PAGE_W - BINDING_MARGIN) * s;
  context.fillStyle = "rgba(255,255,255,0.18)";
  context.fillRect(stripX, 0, BINDING_MARGIN * s, TEXTURE_H);
  const holeX = input.holesOnLeft ? HOLE_X * s : (PAGE_W - HOLE_X) * s;
  for (const fraction of HOLE_FRACTIONS) {
    context.beginPath();
    context.arc(holeX, PAGE_H * fraction * s, 0.28 * s, 0, Math.PI * 2);
    context.fillStyle = "#4a3a30";
    context.fill();
  }

  for (let pocket = 0; pocket < POCKETS; pocket++) {
    const rect = pocketRect(pocket, input.holesOnLeft);
    const x = rect.x * s;
    const y = rect.y * s;
    const w = rect.w * s;
    const h = rect.h * s;
    // pocket backing, slightly darker
    context.fillStyle = "rgba(120,104,88,0.16)";
    context.fillRect(x + 3, y + 3, w - 6, h - 6);
    const card = pocket === input.hiddenPocket ? undefined : input.cards.get(pocket);
    if (card) {
      const cr = cardRect(pocket, input.holesOnLeft);
      const image = input.imageFor(card);
      context.save();
      context.shadowColor = "rgba(40,25,15,0.45)";
      context.shadowBlur = 6;
      context.shadowOffsetY = 2;
      if (image) context.drawImage(image, cr.x * s, cr.y * s, cr.w * s, cr.h * s);
      else {
        // Still downloading: just the card name.
        context.fillStyle = "#2f2822";
        context.fillRect(cr.x * s, cr.y * s, cr.w * s, cr.h * s);
        context.shadowColor = "transparent";
        context.fillStyle = "#f3e2b0";
        context.font = `900 ${0.62 * s}px Nunito, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const lines = wrapText(context, card.card.name, (cr.w - 0.6) * s).slice(0, 5);
        const lineHeight = 0.8 * s;
        const top = (cr.y + cr.h / 2) * s - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => context.fillText(line, (cr.x + cr.w / 2) * s, top + index * lineHeight));
      }
      context.restore();
      const tag = rarityTag(card.printing?.rarity);
      if (tag) {
        context.font = `900 ${0.5 * s}px Nunito, system-ui, sans-serif`;
        const tw = context.measureText(tag).width + 0.4 * s;
        const tx = (cr.x + cr.w) * s - tw - 0.15 * s;
        const ty = (cr.y + cr.h) * s - 0.95 * s;
        context.fillStyle = RARITY_STYLE[tag] ?? "#3f4652";
        context.beginPath();
        context.roundRect(tx, ty, tw, 0.75 * s, 0.37 * s);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.85)";
        context.lineWidth = 1.5;
        context.stroke();
        context.fillStyle = "#fff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(tag, tx + tw / 2, ty + 0.4 * s);
      }
    }
    // plastic sleeve over the card: sheen and welded seams
    const sheen = context.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(0, "rgba(255,255,255,0.20)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.04)");
    sheen.addColorStop(0.55, "rgba(255,255,255,0.10)");
    sheen.addColorStop(1, "rgba(255,255,255,0.02)");
    context.fillStyle = sheen;
    context.fillRect(x, y, w, h);
    context.strokeStyle = "rgba(255,255,255,0.45)";
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, w - 2, h - 2);
    context.strokeStyle = "rgba(90,75,60,0.18)";
    context.lineWidth = 1;
    context.strokeRect(x + 3, y + 3, w - 6, h - 6);
    // open top edge of the pocket
    context.fillStyle = "rgba(255,255,255,0.35)";
    context.fillRect(x + 4, y + 4, w - 8, 2);
  }
  return element;
}
