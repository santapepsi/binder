// Card spots on the table: a dashed outline, and the card lying in it face up
// or face down. Spots can be dragged around; the scene handles the pointer.

import * as THREE from "three";
import { cardImage } from "../data/images.ts";
import { cardBackBlob } from "../data/table.ts";
import { slotContains, type TableSlot } from "../model/table.ts";
import { CARD_H, CARD_W } from "./dimensions.ts";
import { paintCardBack, paintSpot } from "./paint.ts";

export const TABLE_Y = -0.18;

interface SpotMeshes {
  group: THREE.Group;
  outline: THREE.Mesh;
  card: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial[]>;
  key: string; // what the card currently shows, to avoid reloading
}

const CARD_T = 0.035; // card thickness, cm
const LAYER = 0.05; // height between stacked cards
const REACH = 10.6; // two cards closer than this can overlap
const FACE = 2; // +y face of the card box
const UNDERSIDE = 3; // -y face

export class TableLayer {
  readonly group = new THREE.Group();
  private spots = new Map<string, SpotMeshes>();
  private slots: TableSlot[] = [];
  private readonly outline: THREE.CanvasTexture;
  private back: THREE.Texture;
  private readonly cardGeometry = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
  private readonly edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 });
  private highlighted = new Set<string>();
  private readonly outlineGeometry = new THREE.PlaneGeometry(6.6, 9.3);
  private readonly faces = new Map<string, THREE.Texture>();

  constructor(
    private readonly onChange: () => void,
    private readonly anisotropy: number
  ) {
    this.outline = this.texture(paintSpot());
    this.back = this.texture(paintCardBack());
    this.loadBack();
    window.addEventListener("cardback", () => this.loadBack());
  }

  private texture(source: HTMLCanvasElement | ImageBitmap) {
    const canvas =
      source instanceof HTMLCanvasElement
        ? source
        : (() => {
            const element = document.createElement("canvas");
            element.width = source.width;
            element.height = source.height;
            element.getContext("2d")!.drawImage(source, 0, 0);
            return element;
          })();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    return texture;
  }

  /** Uses the picture chosen in Settings as the card back, or the built-in design. */
  private async loadBack() {
    const blob = await cardBackBlob();
    let next: THREE.Texture;
    try {
      next = blob ? this.texture(await createImageBitmap(blob)) : this.texture(paintCardBack());
    } catch {
      next = this.texture(paintCardBack());
    }
    this.back.dispose();
    this.back = next;
    for (const spot of this.spots.values()) spot.key = "";
    this.setSlots(this.slots);
  }

  /** Position of a spot in the stack (0 = bottom), from its order. */
  private layerOf(id: string) {
    return this.layers.get(id) ?? 0;
  }

  private stack: string[] = [];
  private layers = new Map<string, number>();

  setSlots(slots: TableSlot[]) {
    this.slots = slots;
    // Distinct heights per card so overlapping cards never fight for the same depth.
    const sorted = [...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.stack = sorted.map((slot) => slot.id);
    // Only cards that can overlap are stacked, so loose cards stay flat on the table
    // (and never rise above the binder's cover).
    this.layers.clear();
    sorted.forEach((slot, index) => {
      let layer = 0;
      for (const below of sorted.slice(0, index))
        if (Math.hypot(below.x - slot.x, below.z - slot.z) < REACH) layer = Math.max(layer, this.layerOf(below.id) + 1);
      this.layers.set(slot.id, layer);
    });
    const alive = new Set(slots.map((slot) => slot.id));
    for (const [id, spot] of this.spots) {
      if (!alive.has(id)) {
        this.group.remove(spot.group);
        spot.card.material[FACE].dispose();
        spot.card.material[UNDERSIDE].dispose();
        this.spots.delete(id);
      }
    }
    for (const slot of slots) {
      let spot = this.spots.get(slot.id);
      if (!spot) {
        const group = new THREE.Group();
        const outline = new THREE.Mesh(
          this.outlineGeometry,
          new THREE.MeshBasicMaterial({ map: this.outline, transparent: true, depthWrite: false })
        );
        outline.rotation.x = -Math.PI / 2;
        outline.position.y = 0.005;
        outline.visible = false;
        // A thin box: printed face on top, card back underneath, pale edges.
        const materials = [
          this.edgeMaterial,
          this.edgeMaterial,
          new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 }),
          new THREE.MeshStandardMaterial({ roughness: 0.6, map: this.back }),
          this.edgeMaterial,
          this.edgeMaterial,
        ];
        const card = new THREE.Mesh(this.cardGeometry, materials);
        card.position.y = 0.01 + CARD_T / 2;
        card.castShadow = true;
        card.receiveShadow = true;
        group.add(outline, card);
        this.group.add(group);
        spot = { group, outline, card, key: "" };
        this.spots.set(slot.id, spot);
      }
      spot.group.position.set(slot.x, TABLE_Y + this.layerOf(slot.id) * LAYER, slot.z);
      spot.group.rotation.y = slot.rotation;
      this.showCard(slot, spot);
      this.updateOutline(slot.id);
    }
    this.onChange();
  }

  private setFace(spot: SpotMeshes, texture: THREE.Texture) {
    const top = spot.card.material[FACE];
    const under = spot.card.material[UNDERSIDE];
    top.map = texture;
    under.map = this.back;
    top.needsUpdate = true;
    under.needsUpdate = true;
  }

  private showCard(slot: TableSlot, spot: SpotMeshes) {
    const key = !slot.card ? "empty" : slot.faceDown ? "back" : `${slot.card.catalogId}|${slot.artworkId ?? ""}`;
    if (key === spot.key) return;
    spot.key = key;
    spot.card.visible = key !== "empty";
    if (key === "back") {
      this.setFace(spot, this.back);
    } else if (slot.card && key !== "empty") {
      const cached = this.faces.get(key);
      if (cached) this.setFace(spot, cached);
      else {
        this.setFace(spot, this.back); // until the image is ready
        cardImage(slot.card, "full", slot.artworkId).then((image) => {
          const texture = this.texture(image as HTMLCanvasElement | ImageBitmap);
          if (!("placeholder" in image && image.placeholder)) this.faces.set(key, texture);
          if (spot.key !== key) return;
          this.setFace(spot, texture);
          this.onChange();
        });
      }
    }
  }

  /** The dashed outline shows only on an empty spot that is hovered, dragged or being edited. */
  highlight(id: string | null, on = true) {
    if (id === null) {
      const previous = [...this.highlighted];
      this.highlighted.clear();
      previous.forEach((spot) => this.updateOutline(spot));
    } else {
      if (on) this.highlighted.add(id);
      else this.highlighted.delete(id);
      this.updateOutline(id);
    }
    this.onChange();
  }

  private updateOutline(id: string) {
    const spot = this.spots.get(id);
    const slot = this.slots.find((entry) => entry.id === id);
    if (spot && slot) spot.outline.visible = !slot.card && this.highlighted.has(id);
  }

  /** Spot under a table point, topmost first. */
  slotAt(x: number, z: number): TableSlot | null {
    for (let index = this.stack.length - 1; index >= 0; index--) {
      const slot = this.slots.find((entry) => entry.id === this.stack[index]);
      if (slot && slotContains(slot, x, z)) return slot;
    }
    return null;
  }

  /** Moves a spot's meshes while dragging (the store is updated on release). */
  preview(id: string, x: number, z: number, lift: number) {
    const spot = this.spots.get(id);
    if (!spot) return;
    spot.group.position.set(x, TABLE_Y + Math.max(lift, ([...this.layers.values()].reduce((a, b) => Math.max(a, b), 0) + 1) * LAYER), z);
    this.onChange();
  }
}
