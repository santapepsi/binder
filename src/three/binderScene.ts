// The 3D binder: table, boards, rings, pocket pages, page turns, cover opening,
// hover/selection glow and drag & drop between pockets.

import * as THREE from "three";
import { POCKETS, pageCount, pageOfSlot, pagesOfSpread, pocketOfSlot, slotOf, spreadCount, spreadOfPage } from "../model/layout.ts";
import type { Binder, BinderCard } from "../model/types.ts";
import { cardImage, coverImage, type Drawable } from "../data/images.ts";
import { CARD_RATIO } from "../data/cardFace.ts";
import {
  BOARD_H,
  BOARD_T,
  BOARD_W,
  CARD_H,
  CARD_W,
  HINGE_Y,
  HOLE_FRACTIONS,
  PAGE_GAP,
  PAGE_H,
  PAGE_W,
  PAGE_Y,
  RING_R,
  pocketAt,
  pocketRect,
} from "./dimensions.ts";
import { edgeColor, paintCover, paintGlow, paintInside, paintPage, paintWood } from "./paint.ts";
import { PageSheet } from "./pageSheet.ts";
import { TABLE_Y, TableLayer } from "./tableLayer.ts";
import type { TableSlot } from "../model/table.ts";

export type Focus = "left" | "right" | null;

export interface SceneEvents {
  select(card: BinderCard | null): void;
  empty(slot: number): void;
  move(cardId: string, slot: number): void;
  view(state: ViewState): void;
  /** A table spot was tapped. */
  tableSlot(id: string): void;
  /** A table spot was dragged to a new place. */
  tableMove(id: string, x: number, z: number): void;
}

export interface ViewState {
  spread: number; // -1 = closed
  spreads: number;
  pages: number;
  left: number | null; // visible page indices (-1 inside cover)
  right: number | null;
  focus: Focus;
}

interface Hit {
  page: number;
  pocket: number;
  slot: number;
  side: "left" | "right";
  imageX: number;
}

interface Tween {
  duration: number;
  elapsed: number;
  update(t: number): void;
  done(): void;
}

const imageKey = (card: BinderCard) => `${card.id}|${card.artworkId ?? ""}`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const SPREAD_HALF = PAGE_GAP + PAGE_W;

export class BinderScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 500);
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraGoal = { x: 0, distance: 70 };
  private readonly raycaster = new THREE.Raycaster();
  private readonly pagePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAGE_Y);
  private readonly tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y);
  readonly table: TableLayer;
  private slotDrag: { id: string; dx: number; dz: number; x: number; z: number } | null = null;
  private hoverSpot: string | null = null;
  private closing = false;
  private framed = false;
  private readonly pointer = new THREE.Vector2();

  private readonly leftSheet = new PageSheet();
  private readonly rightSheet = new PageSheet();
  private readonly turnSheet = new PageSheet();
  private readonly coverPivot = new THREE.Group();
  private readonly frontBoard: THREE.Mesh;
  private readonly backBoard: THREE.Mesh;
  private readonly spineBoard: THREE.Mesh;
  private readonly leftStack: THREE.Mesh;
  private readonly rightStack: THREE.Mesh;
  private readonly hoverGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly selectGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ghost: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  private binder: Binder | null = null;
  private cards = new Map<number, BinderCard>();
  private pages = 1;
  private spread = -1;
  private focus: Focus = null;
  private coverAngle = 0;
  private tweens: Tween[] = [];
  private busy = false;
  private queued: (() => void) | null = null;
  private needsRender = true;
  private selectedSlot: number | null = null;
  private hoverHit: Hit | null = null;

  private textures = new Map<number, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; stale: boolean }>();
  private images = new Map<string, Drawable>();
  private loading = new Set<string>();
  private hiddenSlot: number | null = null;
  private coverTextures: THREE.Texture[] = [];

  // pointer state
  private down: { x: number; y: number; time: number; hit: Hit | null; type: string; id: number; spot: TableSlot | null } | null = null;
  private dragging: BinderCard | null = null;
  private longPress = 0;
  private edgeTimer = 0;
  private edgeSide: "left" | "right" | null = null;
  private readonly anisotropy: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly events: SceneEvents
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1b0f0c);
    this.renderer.domElement.className = "scene-canvas";
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);
    this.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.table = new TableLayer(() => (this.needsRender = true), this.anisotropy);
    this.scene.add(this.table.group);

    // Lights
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x3a2016, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.1);
    key.position.set(-20, 46, 26);
    key.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 10, far: 120 });
    key.shadow.bias = -0.0006;
    key.shadow.radius = 4;
    this.scene.add(key);

    // Table
    const wood = new THREE.CanvasTexture(paintWood());
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(5, 5);
    wood.anisotropy = this.anisotropy;
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, metalness: 0 })
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -BOARD_T / 2 - 0.02;
    table.receiveShadow = true;
    this.scene.add(table);

    // Boards
    const boardGeometry = new THREE.BoxGeometry(BOARD_W, BOARD_T, BOARD_H);
    this.backBoard = new THREE.Mesh(boardGeometry, this.boardMaterials());
    this.backBoard.position.set(0.35 + BOARD_W / 2, 0, 0);
    this.frontBoard = new THREE.Mesh(boardGeometry, this.boardMaterials());
    this.frontBoard.position.set(0.35 + BOARD_W / 2, HINGE_Y, 0);
    this.coverPivot.position.set(0, HINGE_Y, 0);
    this.coverPivot.add(this.frontBoard);
    this.spineBoard = new THREE.Mesh(new THREE.BoxGeometry(2.4, BOARD_T * 0.9, BOARD_H), this.boardMaterials());
    this.spineBoard.position.set(0, -0.015, 0);
    for (const mesh of [this.backBoard, this.frontBoard, this.spineBoard]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.scene.add(this.backBoard, this.coverPivot, this.spineBoard);

    // Page stacks (thickness of the pages not shown)
    const stackMaterial = new THREE.MeshStandardMaterial({ color: 0xcfc4b5, roughness: 0.6 });
    this.leftStack = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W, 1, PAGE_H), stackMaterial);
    this.rightStack = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W, 1, PAGE_H), stackMaterial);
    this.leftStack.position.x = -(PAGE_GAP + PAGE_W / 2);
    this.rightStack.position.x = PAGE_GAP + PAGE_W / 2;
    for (const stack of [this.leftStack, this.rightStack]) {
      stack.receiveShadow = true;
      this.scene.add(stack);
    }

    // Ring mechanism
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa39a, roughness: 0.32, metalness: 0.75 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, PAGE_H * 0.97), metal);
    plate.position.set(0, BOARD_T / 2 + 0.16, 0);
    plate.castShadow = true;
    this.scene.add(plate);
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.7, 20, 1, false, 0, Math.PI), metal);
      cap.rotation.set(0, Math.PI / 2, Math.PI / 2);
      cap.position.set(0, BOARD_T / 2 + 0.05, end * (PAGE_H * 0.485));
      this.scene.add(cap);
    }
    const ringGeometry = new THREE.TorusGeometry(RING_R, 0.11, 10, 28, Math.PI);
    for (const fraction of HOLE_FRACTIONS) {
      const ring = new THREE.Mesh(ringGeometry, metal);
      ring.position.set(0, PAGE_Y - 0.08, (fraction - 0.5) * PAGE_H);
      ring.castShadow = true;
      this.scene.add(ring);
    }

    // Pages
    this.leftSheet.setAngle(Math.PI, 1);
    this.turnSheet.visible = false;
    this.scene.add(this.leftSheet.group, this.rightSheet.group, this.turnSheet.group);

    // Glow frames and drag ghost
    const glowTexture = new THREE.CanvasTexture(paintGlow());
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const glow = (opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.scene.add(mesh);
      return mesh;
    };
    this.hoverGlow = glow(0.7);
    this.selectGlow = glow(1);
    this.ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshStandardMaterial({ roughness: 0.4, side: THREE.DoubleSide })
    );
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.castShadow = true;
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.camera.position.set(0, 60, 30);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.bindPointer();
    window.setTimeout(() => (this.framed = true), 800);
    window.addEventListener("online", () => this.retryImages());
    this.renderer.setAnimationLoop((time: number) => this.frame(time));
  }

  // ---------------------------------------------------------------- data

  async setBinder(binder: Binder, cards: BinderCard[]) {
    const changed = this.binder?.id !== binder.id;
    this.binder = binder;
    this.setCards(cards);
    await this.applyCover();
    if (changed) {
      this.tweens = [];
      this.busy = false;
      this.selectedSlot = null;
      this.spread = -1;
      this.coverAngle = 0;
      this.coverPivot.rotation.z = 0;
      this.layout();
    }
  }

  setCards(cards: BinderCard[]) {
    this.cards = new Map(cards.map((card) => [card.slot, card]));
    this.pages = pageCount(this.cards.keys());
    for (const entry of this.textures.values()) entry.stale = true;
    if (this.spread >= spreadCount(this.pages)) this.spread = spreadCount(this.pages) - 1;
    this.layout();
  }

  async applyCover() {
    const binder = this.binder;
    if (!binder) return;
    const picture = binder.coverImage ? await coverImage(binder.id) : null;
    this.coverTextures.forEach((texture) => texture.dispose());
    const make = (canvas: HTMLCanvasElement) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      this.coverTextures.push(texture);
      return texture;
    };
    this.coverTextures = [];
    const outer = make(paintCover(binder.coverColor, picture, binder.showName === false ? null : binder.name));
    const inside = make(paintInside(binder.coverColor));
    const edge = new THREE.Color(edgeColor(binder.coverColor));
    const set = (mesh: THREE.Mesh, top: THREE.Texture | null, bottom: THREE.Texture | null) => {
      const materials = mesh.material as THREE.MeshStandardMaterial[];
      materials.forEach((material, index) => {
        material.color.copy(index === 2 || index === 3 ? new THREE.Color(0xffffff) : edge);
        material.map = index === 2 ? top : index === 3 ? bottom : null;
        material.needsUpdate = true;
      });
    };
    set(this.frontBoard, outer, inside);
    set(this.backBoard, inside, inside);
    set(this.spineBoard, inside, inside);
    (this.spineBoard.material as THREE.MeshStandardMaterial[])[2].map = null;
    (this.spineBoard.material as THREE.MeshStandardMaterial[])[2].color.copy(edge);
    this.needsRender = true;
  }

  private boardMaterials() {
    return Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.02 }));
  }

  /** Card spots on the table (from the table store). */
  setTable(slots: TableSlot[]) {
    this.table.setSlots(slots);
  }

  private tablePoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.tablePlane, new THREE.Vector3());
  }

  private startSlotDrag(spot: TableSlot, clientX: number, clientY: number) {
    const point = this.tablePoint(clientX, clientY);
    if (!point) return;
    this.slotDrag = { id: spot.id, dx: spot.x - point.x, dz: spot.z - point.z, x: spot.x, z: spot.z };
    this.table.highlight(spot.id, true);
    this.table.preview(spot.id, spot.x, spot.z, 0.5);
  }

  select(slot: number | null) {
    this.selectedSlot = slot;
    this.updateGlows();
  }

  // ---------------------------------------------------------------- navigation

  get state(): ViewState {
    const visible = this.spread < 0 ? { left: null, right: null } : pagesOfSpread(this.spread, this.pages);
    return { spread: this.spread, spreads: spreadCount(this.pages), pages: this.pages, ...visible, focus: this.focus };
  }

  setFocus(focus: Focus) {
    this.focus = focus;
    this.updateCamera();
    this.events.view(this.state);
  }

  /** Next page (or spread when both pages are shown). */
  next() {
    if (this.focus === "left" && this.spread >= 0 && pagesOfSpread(this.spread, this.pages).right !== null) {
      this.setFocus("right");
      return;
    }
    if (this.spread < 0) return this.openCover(this.focus ? "right" : null);
    if (this.spread < spreadCount(this.pages) - 1) this.goTo(this.spread + 1, this.focus ? "left" : null);
  }

  previous() {
    if (this.focus === "right" && this.spread > 0) {
      this.setFocus("left");
      return;
    }
    if (this.spread === 0) return this.closeCover();
    if (this.spread > 0) this.goTo(this.spread - 1, this.focus ? "right" : null);
  }

  first() {
    if (this.spread < 0) return this.openCover(this.focus ? "right" : null);
    if (this.spread === 0) return this.closeCover();
    this.goTo(0, this.focus ? "right" : null);
  }

  last() {
    const last = spreadCount(this.pages) - 1;
    if (this.spread < 0) return this.openCover(this.focus ? "right" : null, () => last > 0 && this.goTo(last, this.focus ? "left" : null));
    if (this.spread !== last) this.goTo(last, this.focus ? "left" : null);
  }

  /** Shows the page holding a slot (used after adding a card). */
  showSlot(slot: number) {
    const page = pageOfSlot(slot);
    const target = spreadOfPage(page);
    const side: Focus = this.focus ? (page % 2 === 0 ? "right" : "left") : null;
    if (this.spread < 0) this.openCover(side, () => target > 0 && this.goTo(target, side));
    else if (this.spread !== target) this.goTo(target, side);
    else if (this.focus && side !== this.focus) this.setFocus(side);
  }

  private run(action: () => void) {
    if (this.busy) {
      this.queued = action;
      return;
    }
    action();
  }

  private openCover(focus: Focus, then?: () => void) {
    this.run(() => {
      this.busy = true;
      this.spread = 0;
      this.focus = focus;
      this.layout(true);
      this.updateCamera();
      this.animate(0.75, (t) => {
        this.coverAngle = ease(t) * Math.PI;
        this.coverPivot.rotation.z = this.coverAngle;
      }, () => {
        this.finishMove();
        then?.();
      });
    });
  }

  private closeCover() {
    this.run(() => {
      this.busy = true;
      this.setHover(null);
      // Move the camera in while the cover closes, mirroring how it moves out on opening.
      this.closing = true;
      this.updateCamera();
      this.animate(0.7, (t) => {
        this.coverAngle = (1 - ease(t)) * Math.PI;
        this.coverPivot.rotation.z = this.coverAngle;
      }, () => {
        this.spread = -1;
        this.closing = false;
        this.focus = this.focus ? "right" : null;
        this.finishMove();
      });
    });
  }

  private goTo(target: number, focus: Focus) {
    this.run(() => {
      const from = this.spread;
      if (target === from) return;
      this.busy = true;
      this.setHover(null);
      const forward = target > from;
      const start = pagesOfSpread(from, this.pages);
      const end = pagesOfSpread(target, this.pages);
      // The turning sheet carries the outgoing right page (forward) or incoming right page (back).
      const frontPage = forward ? start.right : end.right;
      const backPage = forward ? end.left : start.left;
      const underLeft = forward ? start.left : end.left;
      const underRight = forward ? end.right : start.right;
      this.showSheet(this.leftSheet, null, underLeft);
      this.showSheet(this.rightSheet, underRight, null);
      this.turnSheet.setTextures(this.texture(frontPage), this.texture(backPage));
      this.turnSheet.visible = true;
      this.updateStacks(forward ? from : target, forward ? target : from);
      this.focus = focus;
      this.updateCamera();
      const direction = forward ? 1 : -1;
      const jump = Math.abs(target - from) > 1 ? 0.75 : 1;
      this.animate(0.6 * jump, (t) => {
        const angle = (forward ? ease(t) : 1 - ease(t)) * Math.PI;
        this.turnSheet.setAngle(angle, direction, 0.025 + Math.sin(angle) * 0.4);
      }, () => {
        this.spread = target;
        this.turnSheet.visible = false;
        this.finishMove();
      });
    });
  }

  private finishMove() {
    this.busy = false;
    this.layout();
    this.updateCamera();
    this.events.view(this.state);
    const queued = this.queued;
    this.queued = null;
    queued?.();
  }

  private animate(duration: number, update: (t: number) => void, done: () => void) {
    this.tweens.push({ duration, elapsed: 0, update, done });
  }

  // ---------------------------------------------------------------- layout

  private layout(opening = false) {
    if (this.busy && !opening) return;
    const closed = this.spread < 0;
    const { left, right } = closed ? { left: null, right: 0 } : pagesOfSpread(this.spread, this.pages);
    this.showSheet(this.leftSheet, null, left);
    this.showSheet(this.rightSheet, right, null);
    this.coverPivot.rotation.z = closed ? 0 : opening ? this.coverAngle : Math.PI;
    if (!closed && !opening) this.coverAngle = Math.PI;
    this.updateStacks(this.spread, this.spread);
    this.updateGlows();
    this.evictTextures();
    this.needsRender = true;
  }

  private showSheet(sheet: PageSheet, front: number | null, back: number | null) {
    const page = front ?? back;
    if (page === null || page < 0 || page >= this.pages) {
      sheet.visible = false;
      return;
    }
    sheet.visible = true;
    sheet.setTextures(front !== null ? this.texture(front) : null, back !== null ? this.texture(back) : null);
  }

  private updateStacks(leftSpread: number, rightSpread: number) {
    const leftPages = Math.max(0, leftSpread * 2 - 1);
    const rightPages = Math.max(0, this.pages - (Math.max(0, rightSpread) * 2 + 1));
    const set = (stack: THREE.Mesh, count: number) => {
      const height = Math.min(0.55, count * 0.035);
      stack.visible = height > 0.01;
      stack.scale.y = Math.max(height, 0.001);
      stack.position.y = PAGE_Y - 0.03 - height / 2;
    };
    set(this.leftStack, leftPages);
    set(this.rightStack, rightPages);
  }

  // ---------------------------------------------------------------- page textures

  private texture(page: number | null): THREE.CanvasTexture | null {
    if (page === null || page < 0 || page >= this.pages) return null;
    let entry = this.textures.get(page);
    if (!entry) {
      const canvas = this.paint(page, null);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      entry = { canvas, texture, stale: false };
      this.textures.set(page, entry);
    } else if (entry.stale) {
      this.paint(page, entry.canvas);
      entry.texture.needsUpdate = true;
      entry.stale = false;
    }
    return entry.texture;
  }

  private paint(page: number, canvas: HTMLCanvasElement | null) {
    const cards = new Map<number, BinderCard>();
    for (let pocket = 0; pocket < POCKETS; pocket++) {
      const card = this.cards.get(slotOf(page, pocket));
      if (!card) continue;
      cards.set(pocket, card);
      if (!this.images.has(imageKey(card))) this.requestImage(card, page);
    }
    const hidden = this.hiddenSlot !== null && pageOfSlot(this.hiddenSlot) === page ? pocketOfSlot(this.hiddenSlot) : null;
    return paintPage(canvas, {
      page,
      holesOnLeft: page % 2 === 0,
      cards,
      hiddenPocket: hidden,
      imageFor: (card) => this.images.get(imageKey(card)),
    });
  }

  private requestImage(card: BinderCard, page: number) {
    const key = imageKey(card);
    if (this.loading.has(key)) return;
    this.loading.add(key);
    cardImage(card.card, "thumb", card.artworkId).then((image) => {
      this.loading.delete(key);
      this.images.set(key, image);
      this.repaint(page);
    });
  }

  /** Back online: download the images that could not be fetched before. */
  retryImages() {
    let changed = false;
    for (const [key, image] of this.images) {
      if (image.placeholder) {
        this.images.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    for (const entry of this.textures.values()) entry.stale = true;
    this.layout();
  }

  private repaint(page: number) {
    const entry = this.textures.get(page);
    if (!entry) return;
    this.paint(page, entry.canvas);
    entry.texture.needsUpdate = true;
    entry.stale = false;
    this.needsRender = true;
  }

  /** Frees page textures that are far from the current spread and not on any sheet. */
  private evictTextures() {
    if (this.textures.size <= 10) return;
    const inUse = new Set<THREE.Texture | null>();
    for (const sheet of [this.leftSheet, this.rightSheet, this.turnSheet]) {
      inUse.add(sheet.front.material.map);
      inUse.add(sheet.back.material.map);
    }
    const centre = Math.max(0, this.spread * 2);
    for (const [page, entry] of this.textures) {
      if (Math.abs(page - centre) > 4 && !inUse.has(entry.texture)) {
        entry.texture.dispose();
        this.textures.delete(page);
      }
    }
  }

  // ---------------------------------------------------------------- camera

  private insets = { left: 0, top: 0, bottom: 0 };

  /** Screen space covered by UI (px), so the binder is framed in the free area. */
  setInsets(insets: { left: number; top: number; bottom: number }) {
    const same = insets.left === this.insets.left && insets.top === this.insets.top && insets.bottom === this.insets.bottom;
    this.insets = insets;
    if (!same) this.resize();
  }

  private resize() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    const { left, top, bottom } = this.insets;
    // Render a larger virtual view whose centre sits in the middle of the free area.
    const virtualWidth = width + left;
    const virtualHeight = height + Math.abs(top - bottom);
    this.camera.aspect = virtualWidth / virtualHeight;
    this.camera.setViewOffset(virtualWidth, virtualHeight, 0, bottom > top ? virtualHeight - height : 0, width, height);
    this.camera.updateProjectionMatrix();
    // Only the first framing jumps; later size changes (panels, rotation) glide.
    this.updateCamera(!this.framed);
  }

  private updateCamera(immediate = false) {
    const closed = this.spread < 0 || this.closing;
    const single = this.focus !== null || closed;
    const centre =
      closed ? 0.35 + BOARD_W / 2 : this.focus === "left" ? -(PAGE_GAP + PAGE_W / 2) : this.focus === "right" ? PAGE_GAP + PAGE_W / 2 : 0;
    // Framed on the binder only: the card spots on the table show where there is room.
    const halfWidth = single ? BOARD_W / 2 + 0.6 : 0.35 + BOARD_W + 0.6;
    const halfDepth = BOARD_H / 2 + 0.4;
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const freeWidth = Math.max(1, width - this.insets.left);
    const freeHeight = Math.max(1, height - this.insets.top - this.insets.bottom);
    const virtualHeight = height + Math.abs(this.insets.top - this.insets.bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tilt = 0.42;
    const vertical = (halfDepth * Math.cos(tilt) * 1.08) / (tan * (freeHeight / virtualHeight));
    // The near edge of the binder is closer to the camera, so it needs extra room.
    const horizontal = halfWidth / (tan * (freeWidth / virtualHeight)) + halfDepth * Math.sin(tilt);
    this.cameraGoal.x = centre;
    this.cameraGoal.distance = Math.max(vertical, horizontal) + 3;
    if (immediate) {
      this.cameraTarget.set(centre, 0, 0.6);
      this.placeCamera(this.cameraGoal.distance);
    }
    this.needsRender = true;
  }

  private placeCamera(distance: number) {
    const tilt = 0.42;
    this.camera.position.set(this.cameraTarget.x, distance * Math.cos(tilt), this.cameraTarget.z + distance * Math.sin(tilt));
    this.camera.lookAt(this.cameraTarget);
  }

  private currentDistance() {
    return this.camera.position.distanceTo(this.cameraTarget);
  }

  /** Screen position (client px) of a point on the table, for tests. */
  tableOnScreen(x: number, z: number): { x: number; y: number } {
    const world = new THREE.Vector3(x, TABLE_Y, z).project(this.camera);
    const bounds = this.renderer.domElement.getBoundingClientRect();
    return { x: bounds.left + ((world.x + 1) / 2) * bounds.width, y: bounds.top + ((1 - world.y) / 2) * bounds.height };
  }

  /** Screen position (client px) of a pocket centre on the visible spread, for tests and hints. */
  pocketOnScreen(slot: number): { x: number; y: number } | null {
    if (this.spread < 0) return null;
    const page = pageOfSlot(slot);
    const { left, right } = pagesOfSpread(this.spread, this.pages);
    if (page !== left && page !== right) return null;
    const onRight = page === right;
    const rect = pocketRect(pocketOfSlot(slot), onRight);
    const imageX = rect.x + rect.w / 2;
    const world = new THREE.Vector3(onRight ? PAGE_GAP + imageX : -(PAGE_GAP + PAGE_W - imageX), PAGE_Y, rect.y + rect.h / 2 - PAGE_H / 2);
    world.project(this.camera);
    const bounds = this.renderer.domElement.getBoundingClientRect();
    return { x: bounds.left + ((world.x + 1) / 2) * bounds.width, y: bounds.top + ((1 - world.y) / 2) * bounds.height };
  }

  // ---------------------------------------------------------------- frame loop

  private lastTime = 0;
  private frame(time: number) {
    const delta = Math.min(0.05, (time - (this.lastTime || time)) / 1000);
    this.lastTime = time;
    let active = this.tweens.length > 0 || this.dragging !== null;
    for (const tween of [...this.tweens]) {
      tween.elapsed += delta;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(t);
      if (t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        tween.done();
      }
    }
    // camera easing
    const distance = this.currentDistance();
    const dx = this.cameraGoal.x - this.cameraTarget.x;
    const dd = this.cameraGoal.distance - distance;
    if (Math.abs(dx) > 0.01 || Math.abs(dd) > 0.01) {
      const k = 1 - Math.pow(0.0015, delta);
      this.cameraTarget.x += dx * k;
      this.placeCamera(distance + dd * k);
      active = true;
    }
    if (this.dragging) this.updateGhost(delta);
    if (active || this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  }

  // ---------------------------------------------------------------- picking

  private pick(clientX: number, clientY: number): { hit: Hit | null; point: THREE.Vector3 | null } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.pagePlane, new THREE.Vector3());
    if (!point || this.spread < 0) return { hit: null, point };
    const { left, right } = pagesOfSpread(this.spread, this.pages);
    const side = point.x >= 0 ? "right" : "left";
    const page = side === "right" ? right : left;
    if (page === null || page < 0) return { hit: null, point };
    const imageX = side === "right" ? point.x - PAGE_GAP : PAGE_W - (-point.x - PAGE_GAP);
    const imageY = point.z + PAGE_H / 2;
    const pocket = pocketAt(imageX, imageY, side === "right");
    if (pocket < 0) return { hit: null, point };
    return { hit: { page, pocket, slot: slotOf(page, pocket), side, imageX }, point };
  }

  private placeGlow(mesh: THREE.Mesh, slot: number | null) {
    if (slot === null || this.spread < 0 || this.busy) {
      mesh.visible = false;
      return;
    }
    const page = pageOfSlot(slot);
    const { left, right } = pagesOfSpread(this.spread, this.pages);
    if (page !== left && page !== right) {
      mesh.visible = false;
      return;
    }
    const onRight = page === right;
    const rect = pocketRect(pocketOfSlot(slot), onRight);
    const imageX = rect.x + rect.w / 2;
    mesh.position.set(onRight ? PAGE_GAP + imageX : -(PAGE_GAP + PAGE_W - imageX), PAGE_Y + 0.03, rect.y + rect.h / 2 - PAGE_H / 2);
    mesh.scale.set(rect.w * 1.3, rect.h * 1.24, 1);
    mesh.visible = true;
  }

  private updateGlows() {
    this.placeGlow(this.selectGlow, this.dragging ? null : this.selectedSlot);
    const hover = this.hoverHit?.slot ?? null;
    this.placeGlow(this.hoverGlow, hover !== this.selectedSlot ? hover : null);
    this.needsRender = true;
  }

  private setHover(hit: Hit | null) {
    if (hit?.slot === this.hoverHit?.slot) return;
    this.hoverHit = hit;
    this.updateGlows();
    this.renderer.domElement.style.cursor = hit ? "pointer" : this.spread < 0 ? "pointer" : "default";
  }

  // ---------------------------------------------------------------- pointer

  private bindPointer() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    canvas.addEventListener("pointermove", (event) => this.onMove(event));
    canvas.addEventListener("pointerup", (event) => this.onUp(event));
    canvas.addEventListener("pointercancel", () => this.cancelDrag());
    canvas.addEventListener("pointerleave", (event) => event.pointerType === "mouse" && !this.dragging && this.setHover(null));
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private onDown(event: PointerEvent) {
    if (!event.isPrimary || event.button > 0) return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    const { hit } = this.pick(event.clientX, event.clientY);
    const tablePoint = hit ? null : this.tablePoint(event.clientX, event.clientY);
    const spot = tablePoint ? this.table.slotAt(tablePoint.x, tablePoint.z) : null;
    this.down = { x: event.clientX, y: event.clientY, time: performance.now(), hit, type: event.pointerType, id: event.pointerId, spot };
    if (spot && event.pointerType !== "mouse") {
      this.longPress = window.setTimeout(() => {
        navigator.vibrate?.(15);
        this.startSlotDrag(spot, event.clientX, event.clientY);
      }, 320);
      return;
    }
    const card = hit ? this.cards.get(hit.slot) : undefined;
    if (card && event.pointerType !== "mouse" && !this.busy) {
      this.longPress = window.setTimeout(() => {
        navigator.vibrate?.(15);
        this.startDrag(card, event.clientX, event.clientY);
      }, 320);
    }
  }

  private onMove(event: PointerEvent) {
    if (!event.isPrimary) return;
    const down = this.down;
    if (this.slotDrag) {
      const point = this.tablePoint(event.clientX, event.clientY);
      if (point) {
        this.slotDrag.x = point.x + this.slotDrag.dx;
        this.slotDrag.z = point.z + this.slotDrag.dz;
        this.table.preview(this.slotDrag.id, this.slotDrag.x, this.slotDrag.z, 0.5);
      }
      return;
    }
    if (this.dragging) {
      this.dragTo(event.clientX, event.clientY);
      return;
    }
    if (down) {
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > 10) window.clearTimeout(this.longPress);
      if (down.spot) {
        if (down.type === "mouse" && moved > 6) this.startSlotDrag(down.spot, event.clientX, event.clientY);
        return;
      }
      if (down.type === "mouse" && moved > 6 && down.hit && !this.busy) {
        const card = this.cards.get(down.hit.slot);
        if (card) this.startDrag(card, event.clientX, event.clientY);
      }
      return;
    }
    if (event.pointerType === "mouse" && !this.busy) {
      const { hit } = this.pick(event.clientX, event.clientY);
      this.setHover(hit);
      const point = hit ? null : this.tablePoint(event.clientX, event.clientY);
      const spot = point ? this.table.slotAt(point.x, point.z) : null;
      if (spot?.id !== this.hoverSpot) {
        if (this.hoverSpot) this.table.highlight(this.hoverSpot, false);
        this.hoverSpot = spot?.id ?? null;
        if (this.hoverSpot) this.table.highlight(this.hoverSpot, true);
      }
      if (spot) this.renderer.domElement.style.cursor = "grab";
    }
  }

  private onUp(event: PointerEvent) {
    window.clearTimeout(this.longPress);
    const down = this.down;
    this.down = null;
    if (!down || event.pointerId !== down.id) return;
    if (this.slotDrag) {
      const { id, x, z } = this.slotDrag;
      this.slotDrag = null;
      if (id !== this.hoverSpot || down.type !== "mouse") this.table.highlight(id, false);
      this.events.tableMove(id, x, z);
      return;
    }
    if (down.spot) {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 12) this.events.tableSlot(down.spot.id);
      return;
    }
    if (this.dragging) {
      this.drop(event.clientX, event.clientY);
      return;
    }
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    const elapsed = performance.now() - down.time;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && elapsed < 700) {
      if (dx < 0) this.next();
      else this.previous();
      return;
    }
    if (Math.hypot(dx, dy) > 12) return;
    if (this.spread < 0) {
      this.next();
      return;
    }
    if (this.busy) return;
    const hit = down.hit;
    if (!hit) {
      this.selectedSlot = null;
      this.updateGlows();
      this.events.select(null);
      return;
    }
    const card = this.cards.get(hit.slot);
    if (card) {
      this.selectedSlot = hit.slot;
      this.updateGlows();
      this.events.select(card);
    } else {
      this.selectedSlot = null;
      this.updateGlows();
      this.events.select(null);
      this.events.empty(hit.slot);
    }
  }

  // ---------------------------------------------------------------- drag & drop

  private ghostTarget = new THREE.Vector3();

  private async startDrag(card: BinderCard, clientX: number, clientY: number) {
    this.dragging = card;
    this.hiddenSlot = card.slot;
    this.repaint(pageOfSlot(card.slot));
    this.updateGlows();
    const image = this.images.get(imageKey(card)) ?? (await cardImage(card.card, "thumb", card.artworkId));
    if (this.dragging !== card) return;
    const canvas = document.createElement("canvas");
    canvas.width = 236;
    canvas.height = Math.round(236 * CARD_RATIO);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    this.ghost.material.map?.dispose();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.ghost.material.map = texture;
    this.ghost.material.needsUpdate = true;
    const { point } = this.pick(clientX, clientY);
    if (point) this.ghost.position.set(point.x, PAGE_Y + 1.2, point.z);
    this.ghostTarget.copy(this.ghost.position);
    this.ghost.visible = true;
    this.dragTo(clientX, clientY);
  }

  private dragTo(clientX: number, clientY: number) {
    const { hit, point } = this.pick(clientX, clientY);
    if (point) this.ghostTarget.set(point.x, PAGE_Y + 1.6, point.z);
    this.setHover(hit);
    // Hovering at the outer edge of a page turns it.
    const edge = point && this.spread >= 0 ? (point.x > SPREAD_HALF - 2.4 ? "right" : point.x < -(SPREAD_HALF - 2.4) ? "left" : null) : null;
    if (edge !== this.edgeSide) {
      window.clearTimeout(this.edgeTimer);
      this.edgeSide = edge;
      if (edge) {
        this.edgeTimer = window.setTimeout(() => {
          this.edgeSide = null;
          if (edge === "right") this.next();
          else if (this.spread > 0 || this.focus === "right") this.previous();
        }, 650);
      }
    }
  }

  private updateGhost(delta: number) {
    if (!this.ghost.visible) return;
    const k = 1 - Math.pow(0.0001, delta);
    const previousX = this.ghost.position.x;
    this.ghost.position.lerp(this.ghostTarget, k);
    const velocity = (this.ghost.position.x - previousX) / Math.max(delta, 0.001);
    this.ghost.rotation.set(-Math.PI / 2 + 0.12, THREE.MathUtils.clamp(-velocity * 0.004, -0.35, 0.35), 0);
  }

  private drop(clientX: number, clientY: number) {
    const card = this.dragging;
    const { hit } = this.pick(clientX, clientY);
    this.endDrag();
    if (card && hit && hit.slot !== card.slot && !this.busy) {
      this.selectedSlot = hit.slot;
      this.events.move(card.id, hit.slot);
    } else if (card) {
      this.selectedSlot = card.slot;
      this.events.select(card);
    }
    this.updateGlows();
  }

  private cancelDrag() {
    window.clearTimeout(this.longPress);
    this.down = null;
    if (this.slotDrag) {
      const { id, x, z } = this.slotDrag;
      this.slotDrag = null;
      this.events.tableMove(id, x, z);
    }
    if (this.dragging) this.endDrag();
  }

  private endDrag() {
    window.clearTimeout(this.edgeTimer);
    this.edgeSide = null;
    const slot = this.hiddenSlot;
    this.dragging = null;
    this.hiddenSlot = null;
    this.ghost.visible = false;
    if (slot !== null) this.repaint(pageOfSlot(slot));
    this.needsRender = true;
  }
}
