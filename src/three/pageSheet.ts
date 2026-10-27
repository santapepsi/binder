// A pocket sheet that hinges on the rings. The front side faces up while it lies
// on the right; the back side faces up once it is turned to the left. While it
// turns, the outer part lags behind the inner part, giving a simple curve.

import * as THREE from "three";
import { PAGE_GAP, PAGE_H, PAGE_W, PAGE_Y } from "./dimensions.ts";

const SEGMENTS = 28;
const CURL = 0.75;

export class PageSheet {
  readonly group = new THREE.Group();
  readonly front: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly back: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly positions: THREE.BufferAttribute;
  private readonly frontGeometry = new THREE.BufferGeometry();
  private readonly backGeometry = new THREE.BufferGeometry();

  constructor() {
    const count = (SEGMENTS + 1) * 2;
    this.positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    const frontUv = new Float32Array(count * 2);
    const backUv = new Float32Array(count * 2);
    const index: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = i / SEGMENTS;
      for (let row = 0; row < 2; row++) {
        const vertex = i * 2 + row;
        const v = row === 0 ? 1 : 0; // row 0 is the top edge (far from the camera)
        frontUv.set([u, v], vertex * 2);
        backUv.set([1 - u, v], vertex * 2);
      }
      if (i < SEGMENTS) {
        const a = i * 2;
        const c = a + 1;
        const b = a + 2;
        const d = a + 3;
        index.push(a, c, b, b, c, d);
      }
    }
    for (const [geometry, uv] of [
      [this.frontGeometry, frontUv],
      [this.backGeometry, backUv],
    ] as const) {
      geometry.setAttribute("position", this.positions);
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geometry.setIndex(index);
    }
    const material = (side: THREE.Side) =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.02, side });
    this.front = new THREE.Mesh(this.frontGeometry, material(THREE.FrontSide));
    this.back = new THREE.Mesh(this.backGeometry, material(THREE.BackSide));
    for (const mesh of [this.front, this.back]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.setAngle(0, 1);
  }

  /** angle: 0 = flat on the right, PI = flat on the left. direction: +1 turning left, -1 turning right. */
  setAngle(angle: number, direction: number, lift = 0) {
    const array = this.positions.array as Float32Array;
    const total = PAGE_GAP + PAGE_W;
    const bend = CURL * Math.sin(angle) * direction;
    // integrate along the sheet from the ring axis
    let x = 0;
    let y = 0;
    let distance = 0;
    const gapSteps = 12;
    while (distance < PAGE_GAP - 1e-6) {
      const piece = Math.min(PAGE_GAP / gapSteps, PAGE_GAP - distance);
      const a = angle - bend * (distance / total);
      x += Math.cos(a) * piece;
      y += Math.sin(a) * piece;
      distance += piece;
    }
    for (let i = 0; i <= SEGMENTS; i++) {
      if (i > 0) {
        const d = PAGE_GAP + (i - 0.5) * (PAGE_W / SEGMENTS);
        const a = angle - bend * (d / total);
        x += Math.cos(a) * (PAGE_W / SEGMENTS);
        y += Math.sin(a) * (PAGE_W / SEGMENTS);
      }
      for (let row = 0; row < 2; row++) {
        const z = row === 0 ? -PAGE_H / 2 : PAGE_H / 2;
        array.set([x, PAGE_Y + y + lift, z], (i * 2 + row) * 3);
      }
    }
    this.positions.needsUpdate = true;
    this.frontGeometry.computeVertexNormals();
    this.backGeometry.computeVertexNormals();
    this.frontGeometry.computeBoundingSphere();
    this.backGeometry.computeBoundingSphere();
  }

  setTextures(front: THREE.Texture | null, back: THREE.Texture | null) {
    this.front.material.map = front;
    this.back.material.map = back;
    this.front.material.needsUpdate = true;
    this.back.material.needsUpdate = true;
  }

  set visible(value: boolean) {
    this.group.visible = value;
  }
}
