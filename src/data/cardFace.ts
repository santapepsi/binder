// Draws a stand-in card face when no image is available (no catalog image,
// image rights pending, or offline before it was cached). Generic design,
// coloured by card frame so a page still reads at a glance.

import { frameOf, typeLine } from "../model/classify.ts";
import type { CardSnapshot } from "../model/types.ts";

export const CARD_RATIO = 86 / 59;

export const FRAME_COLORS: Record<ReturnType<typeof frameOf>, [string, string]> = {
  normal: ["#d9b56a", "#b48a3c"],
  effect: ["#d0794a", "#a5532b"],
  ritual: ["#6c8fd6", "#3f63ad"],
  fusion: ["#9a6bb7", "#6e4590"],
  synchro: ["#e9e9ea", "#b9bcc2"],
  xyz: ["#3a3a40", "#1d1d22"],
  link: ["#2f6fb3", "#1b4b80"],
  spell: ["#2fa58b", "#1d7562"],
  trap: ["#b8417f", "#8a2a5e"],
  token: ["#b9b2a6", "#8d8678"],
  skill: ["#3b82c4", "#215a91"],
};

const ATTRIBUTE_COLORS: Record<string, string> = {
  DARK: "#5b2a7a",
  LIGHT: "#c9a52e",
  EARTH: "#6b4f2a",
  WATER: "#2a6fb3",
  FIRE: "#c23b22",
  WIND: "#2f8f4a",
  DIVINE: "#b8862b",
};

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
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

export function drawCardFace(card: CardSnapshot, width: number): HTMLCanvasElement {
  const height = Math.round(width * CARD_RATIO);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const unit = width / 59;
  const frame = frameOf(card);
  const [light, dark] = FRAME_COLORS[frame];
  const darkFrame = frame === "xyz";

  // Frame
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  context.fillStyle = "#16120e";
  context.fillRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(unit * 1.2, unit * 1.2, width - unit * 2.4, height - unit * 2.4);

  // Name bar
  const ink = darkFrame ? "#f2efe8" : "#16120e";
  context.fillStyle = "rgba(255,255,255,0.22)";
  context.fillRect(unit * 3.5, unit * 3.5, width - unit * 7, unit * 7);
  let size = unit * 4.2;
  context.font = `900 ${size}px Bia, Nunito, system-ui, sans-serif`;
  while (context.measureText(card.name).width > width - unit * 16 && size > unit * 2.2) {
    size -= unit * 0.2;
    context.font = `900 ${size}px Bia, Nunito, system-ui, sans-serif`;
  }
  context.fillStyle = ink;
  context.textBaseline = "middle";
  context.fillText(card.name, unit * 5, unit * 7.1);

  // Attribute / card kind disc
  const discX = width - unit * 7.3;
  context.beginPath();
  context.arc(discX, unit * 7, unit * 2.7, 0, Math.PI * 2);
  context.fillStyle =
    card.cardType === "Spell" ? "#1d7562" : card.cardType === "Trap" ? "#8a2a5e" : ATTRIBUTE_COLORS[card.attribute ?? ""] ?? "#555";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.8)";
  context.lineWidth = unit * 0.5;
  context.stroke();
  context.fillStyle = "#fff";
  context.font = `900 ${unit * 2.6}px Bia, Nunito, system-ui, sans-serif`;
  context.textAlign = "center";
  const glyph = card.cardType === "Monster" ? (card.attribute ?? "?")[0] : card.cardType[0];
  context.fillText(glyph, discX, unit * 7.2);
  context.textAlign = "left";

  // Level / rank stars
  const stars = card.level ?? card.rank ?? 0;
  for (let index = 0; index < Math.min(stars, 12); index++) {
    context.beginPath();
    const x = card.rank ? unit * (6 + index * 3.6) : width - unit * (6 + index * 3.6);
    context.arc(x, unit * 13.2, unit * 1.3, 0, Math.PI * 2);
    context.fillStyle = card.rank ? "#1b1b1b" : "#e2a128";
    context.fill();
    context.strokeStyle = "#7a3e0a";
    context.lineWidth = unit * 0.3;
    context.stroke();
  }

  // Art box: deterministic abstract art from the name
  const seed = hash(card.name);
  const artX = unit * 7;
  const artY = unit * 15.5;
  const artW = width - unit * 14;
  context.fillStyle = "#1a1a1a";
  context.fillRect(artX - unit * 0.6, artY - unit * 0.6, artW + unit * 1.2, artW + unit * 1.2);
  const hue = seed % 360;
  const art = context.createRadialGradient(
    artX + artW * ((seed >> 8) % 100) / 100,
    artY + artW * ((seed >> 16) % 100) / 100,
    unit,
    artX + artW / 2,
    artY + artW / 2,
    artW
  );
  art.addColorStop(0, `hsl(${hue} 70% 70%)`);
  art.addColorStop(0.5, `hsl(${(hue + 40) % 360} 55% 40%)`);
  art.addColorStop(1, `hsl(${(hue + 200) % 360} 45% 18%)`);
  context.fillStyle = art;
  context.fillRect(artX, artY, artW, artW);
  context.save();
  context.beginPath();
  context.rect(artX, artY, artW, artW);
  context.clip();
  for (let index = 0; index < 7; index++) {
    const value = hash(`${card.name}${index}`);
    context.beginPath();
    context.arc(
      artX + (value % 1000) / 1000 * artW,
      artY + ((value >> 10) % 1000) / 1000 * artW,
      unit * (2 + (value % 9)),
      0,
      Math.PI * 2
    );
    context.fillStyle = `hsla(${(hue + index * 37) % 360} 80% 75% / 0.28)`;
    context.fill();
  }
  context.restore();

  // Text box
  const boxY = artY + artW + unit * 3;
  const boxH = height - boxY - unit * 4;
  context.fillStyle = frame === "normal" ? "#efe0b8" : "#f1ece2";
  context.fillRect(unit * 3.5, boxY, width - unit * 7, boxH);
  context.fillStyle = "#16120e";
  context.font = `900 ${unit * 2}px Bia, Nunito, system-ui, sans-serif`;
  context.textBaseline = "top";
  context.fillText(`[${typeLine(card)}]`, unit * 4.6, boxY + unit * 1);
  context.font = `700 ${unit * 1.85}px Bia, Nunito, system-ui, sans-serif`;
  const lines = wrap(context, card.text, width - unit * 9.5).slice(0, 5);
  lines.forEach((line, index) => context.fillText(line, unit * 4.6, boxY + unit * (3.6 + index * 2.3)));
  if (card.atk !== null) {
    context.font = `900 ${unit * 2}px Bia, Nunito, system-ui, sans-serif`;
    context.textAlign = "right";
    const stats = card.linkRating ? `ATK/${card.atk}  LINK-${card.linkRating}` : `ATK/${card.atk}  DEF/${card.def ?? "?"}`;
    context.fillText(stats, width - unit * 4.6, boxY + boxH - unit * 2.8);
    context.textAlign = "left";
  }
  return canvas;
}
