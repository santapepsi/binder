// 2D canvas painters for everything textured in the scene: the wooden table,
// cover boards, glow frames, and the pocket pages with their cards.

import { POCKETS } from "../model/layout.ts";
import { rarityBadge } from "../model/rarityBadges.ts";
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

/** Font family used for the lettering on covers (a font the user loaded, else the app font). */
export const COVER_FONT = '"CoverLettering", Bia, Nunito, Georgia, serif';

export function luminance(hex: string) {
  const value = parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number) => ((value >> shift) & 255) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * Outer face of the front cover, like a plain 9-pocket binder: one matte colour
 * (or a picture) and small lettering at the bottom left.
 */
export function paintCover(color: string, image: ImageBitmap | null, label: string | null): HTMLCanvasElement {
  const width = 1024;
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
  // Matte finish: a very fine grain and a soft light from the top left.
  const rand = random(11);
  for (let index = 0; index < 9000; index++) {
    context.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.035)";
    context.fillRect(rand() * width, rand() * height, 2, 2);
  }
  const light = context.createLinearGradient(0, 0, width, height);
  light.addColorStop(0, "rgba(255,255,255,0.07)");
  light.addColorStop(0.5, "rgba(255,255,255,0)");
  light.addColorStop(1, "rgba(0,0,0,0.10)");
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  if (!label) return element;
  // Lettering where the maker's logo usually is.
  const dark = !image && luminance(color) > 0.6;
  context.fillStyle = dark ? "rgba(30,30,32,0.92)" : "rgba(255,255,255,0.92)";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const maxWidth = width * 0.6;
  let size = Math.round(height * 0.036);
  context.font = `${size}px ${COVER_FONT}`;
  while (context.measureText(label).width > maxWidth && size > 18) context.font = `${--size}px ${COVER_FONT}`;
  context.fillText(label, width * 0.175, height * 0.928);
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
  return shade(color, 0.82);
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
        context.font = `900 ${0.62 * s}px Bia, Nunito, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const lines = wrapText(context, card.card.name, (cr.w - 0.6) * s).slice(0, 5);
        const lineHeight = 0.8 * s;
        const top = (cr.y + cr.h / 2) * s - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => context.fillText(line, (cr.x + cr.w / 2) * s, top + index * lineHeight));
      }
      context.restore();
      const badge = card.printing?.hideBadge ? null : rarityBadge(card.printing?.rarity);
      if (badge) {
        const bw = Number((badge as HTMLImageElement).naturalWidth || (badge as HTMLCanvasElement).width);
        const bh = Number((badge as HTMLImageElement).naturalHeight || (badge as HTMLCanvasElement).height);
        const height = (bw / bh < 1.2 ? 1.1 : 0.78) * s; // the round 25th-anniversary badge is a bit taller
        const width = height * (bw / bh);
        const tx = (cr.x + cr.w) * s - width - 0.12 * s;
        const ty = (cr.y + cr.h) * s - height - 0.12 * s;
        context.save();
        context.shadowColor = "rgba(0,0,0,0.45)";
        context.shadowBlur = 3;
        context.drawImage(badge, tx, ty, width, height);
        context.restore();
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

/**
 * Default back of a card: an original design for this app (deep blue, gold
 * frame, nine-pocket emblem). Replaceable by a picture in Settings.
 */
export function paintCardBack(width = 472): HTMLCanvasElement {
  const height = Math.round((width * 86) / 59);
  const element = canvas(width, height);
  const context = element.getContext("2d")!;
  const u = width / 59;
  context.fillStyle = "#14100c";
  context.fillRect(0, 0, width, height);
  const field = context.createRadialGradient(width / 2, height / 2, u * 4, width / 2, height / 2, height * 0.7);
  field.addColorStop(0, "#2d4f86");
  field.addColorStop(0.55, "#16294d");
  field.addColorStop(1, "#0a1226");
  context.fillStyle = field;
  context.fillRect(u * 2.2, u * 2.2, width - u * 4.4, height - u * 4.4);
  // fine diagonal pattern
  context.save();
  context.beginPath();
  context.rect(u * 2.2, u * 2.2, width - u * 4.4, height - u * 4.4);
  context.clip();
  context.strokeStyle = "rgba(255, 220, 140, 0.07)";
  context.lineWidth = u * 0.25;
  for (let offset = -height; offset < width + height; offset += u * 2.2) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + height, height);
    context.moveTo(offset, height);
    context.lineTo(offset + height, 0);
    context.stroke();
  }
  context.restore();
  // double gold frame
  context.strokeStyle = "#d9b45a";
  context.lineWidth = u * 0.7;
  context.strokeRect(u * 3.4, u * 3.4, width - u * 6.8, height - u * 6.8);
  context.lineWidth = u * 0.3;
  context.strokeRect(u * 4.6, u * 4.6, width - u * 9.2, height - u * 9.2);
  // emblem: diamond with a 3x3 grid of pockets
  const cx = width / 2;
  const cy = height / 2;
  const r = u * 15;
  context.save();
  context.translate(cx, cy);
  context.beginPath();
  context.moveTo(0, -r * 1.25);
  context.lineTo(r, 0);
  context.lineTo(0, r * 1.25);
  context.lineTo(-r, 0);
  context.closePath();
  const glow = context.createRadialGradient(0, 0, u, 0, 0, r * 1.3);
  glow.addColorStop(0, "rgba(255, 226, 150, 0.35)");
  glow.addColorStop(1, "rgba(255, 226, 150, 0.05)");
  context.fillStyle = glow;
  context.fill();
  context.strokeStyle = "#e8c66e";
  context.lineWidth = u * 0.6;
  context.stroke();
  const cell = u * 3.1;
  const gap = u * 0.8;
  context.fillStyle = "#e8c66e";
  for (let row = -1; row <= 1; row++)
    for (let col = -1; col <= 1; col++)
      context.fillRect(col * (cell + gap) - cell / 2, row * (cell * 1.35 + gap) - (cell * 1.35) / 2, cell, cell * 1.35);
  context.restore();
  // corner ornaments
  context.fillStyle = "#d9b45a";
  for (const [x, y] of [
    [u * 7, u * 7],
    [width - u * 7, u * 7],
    [u * 7, height - u * 7],
    [width - u * 7, height - u * 7],
  ]) {
    context.beginPath();
    context.arc(x, y, u * 1.1, 0, Math.PI * 2);
    context.fill();
  }
  return element;
}

/** Faint outline marking a card spot on the table. */
export function paintSpot(): HTMLCanvasElement {
  const element = canvas(132, 186);
  const context = element.getContext("2d")!;
  context.strokeStyle = "rgba(240, 220, 170, 0.55)";
  context.lineWidth = 4;
  context.setLineDash([14, 8]);
  context.strokeRect(6, 6, 120, 174);
  context.fillStyle = "rgba(0, 0, 0, 0.12)";
  context.fillRect(8, 8, 116, 170);
  return element;
}
