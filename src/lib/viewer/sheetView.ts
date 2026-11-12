import * as THREE from 'three';

import type { GuideVisibility, SheetFace, SheetImposition } from '@/lib/types';

import { createPageMaterial } from './materials';
import type { PageUniforms, SharedPageUniforms } from './materials';
import { createFacingQuad } from './surfaces';

export const SHEET_MARGIN = 16;
const PX_PER_MM = 4;
const FLIP_MS = 600;

interface Slot {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  uniforms: PageUniforms;
  pageNumber: number;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export interface SheetLabelInfo {
  sheet: SheetImposition;
  sheetCount: number;
  sheets: readonly SheetImposition[];
}

export class SheetView {
  readonly group = new THREE.Group();
  private readonly rotator = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly backgrounds: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];
  private readonly canvasTextures: Array<THREE.CanvasTexture | null> = [null, null];
  private width = 210;
  private height = 297;
  private bleedMm = 3;
  private face: SheetFace = 'front';
  private flip: { from: number; to: number; start: number } | null = null;
  private current: SheetLabelInfo | null = null;
  private guides: GuideVisibility = { trim: true, bleed: false, safe: false };
  private ink = '#1b2126';
  private paper = '#fbfaf7';
  private bleedColor = '#d6336c';

  constructor(private readonly shared: SharedPageUniforms) {
    this.group.add(this.rotator);
    this.group.visible = false;
  }

  get extent(): { width: number; height: number } {
    return { width: this.width * 2 + SHEET_MARGIN * 2, height: this.height + SHEET_MARGIN * 2 };
  }

  get animating(): boolean {
    return this.flip !== null;
  }

  get currentFace(): SheetFace {
    return this.face;
  }

  get pages(): number[] {
    return this.slots.map((slot) => slot.pageNumber);
  }

  setFormat(width: number, height: number, bleedMm: number): void {
    this.width = width;
    this.height = height;
    this.bleedMm = bleedMm;
    this.disposeMeshes();

    const W = width;
    const H = height;
    const halfW = W + SHEET_MARGIN;
    const halfH = H / 2 + SHEET_MARGIN;
    for (const facing of [1, -1] as const) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
      const mesh = createFacingQuad(material, -halfW, halfW, -halfH, halfH, facing * 0.2, facing) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >;
      this.backgrounds.push(mesh);
      this.rotator.add(mesh);
    }

    const layout: Array<{ x0: number; x1: number; facing: 1 | -1 }> = [
      { x0: -W, x1: 0, facing: 1 },
      { x0: 0, x1: W, facing: 1 },
      { x0: 0, x1: W, facing: -1 },
      { x0: -W, x1: 0, facing: -1 },
    ];
    for (const cell of layout) {
      const material = createPageMaterial(this.shared);
      material.uniforms.uShade.value = 0;
      material.uniforms.uGutter.value = 0;
      material.transparent = true;
      const mesh = createFacingQuad(material, cell.x0, cell.x1, -H / 2, H / 2, cell.facing * 0.7, cell.facing);
      this.slots.push({ mesh, uniforms: material.uniforms, pageNumber: 0 });
      this.rotator.add(mesh);
    }
    if (this.current) this.drawMarks();
  }

  setColors(ink: string, paper: string, bleed: string): void {
    this.ink = ink;
    this.paper = paper;
    this.bleedColor = bleed;
    if (this.current) this.drawMarks();
  }

  setGuides(guides: GuideVisibility): void {
    this.guides = guides;
    if (this.current) this.drawMarks();
  }

  show(info: SheetLabelInfo, face: SheetFace, animate: boolean): void {
    const sameSheet = this.current?.sheet.index === info.sheet.index;
    this.current = info;
    const { front, back } = info.sheet;
    const pages = [front.left, front.right, back.left, back.right];
    this.slots.forEach((slot, index) => {
      slot.pageNumber = pages[index] ?? 0;
    });
    this.drawMarks();

    const target = face === 'front' ? 0 : Math.PI;
    if (face !== this.face && animate && sameSheet) {
      this.flip = { from: this.rotator.rotation.y, to: target, start: performance.now() };
    } else {
      this.flip = null;
      this.rotator.rotation.y = target;
    }
    this.face = face;
  }

  updateTextures(get: (pageNumber: number) => THREE.Texture | null): void {
    for (const slot of this.slots) {
      const texture = slot.pageNumber > 0 ? get(slot.pageNumber) : null;
      if (slot.uniforms.uMap.value !== texture) {
        slot.uniforms.uMap.value = texture;
        slot.uniforms.uHasMap.value = texture ? 1 : 0;
      }
    }
  }

  setOpacity(opacity: number): void {
    for (const mesh of this.backgrounds) mesh.material.opacity = opacity;
  }

  update(now: number): boolean {
    if (!this.flip) return false;
    const u = Math.min(1, (now - this.flip.start) / FLIP_MS);
    const e = easeInOut(u);
    this.rotator.rotation.y = this.flip.from + (this.flip.to - this.flip.from) * e;
    this.rotator.position.z = Math.sin(Math.PI * e) * this.width * 0.12;
    if (u >= 1) {
      this.flip = null;
      this.rotator.position.z = 0;
    }
    return true;
  }

  dispose(): void {
    this.disposeMeshes();
  }

  private disposeMeshes(): void {
    for (const mesh of this.backgrounds) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.rotator.remove(mesh);
    }
    for (const slot of this.slots) {
      slot.mesh.geometry.dispose();
      slot.mesh.material.dispose();
      this.rotator.remove(slot.mesh);
    }
    for (const texture of this.canvasTextures) texture?.dispose();
    this.backgrounds.length = 0;
    this.slots.length = 0;
    this.canvasTextures[0] = null;
    this.canvasTextures[1] = null;
  }

  private drawMarks(): void {
    const info = this.current;
    if (!info) return;
    const faces: SheetFace[] = ['front', 'back'];
    faces.forEach((face, index) => {
      const canvas = this.drawFace(info, face);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.anisotropy = 4;
      this.canvasTextures[index]?.dispose();
      this.canvasTextures[index] = texture;
      const mesh = this.backgrounds[index];
      if (mesh) {
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      }
    });
  }

  private drawFace(info: SheetLabelInfo, face: SheetFace): HTMLCanvasElement {
    const W = this.width;
    const H = this.height;
    const M = SHEET_MARGIN;
    const k = PX_PER_MM;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((W * 2 + M * 2) * k);
    canvas.height = Math.round((H + M * 2) * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const mm = (value: number) => value * k;

    ctx.fillStyle = this.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const left = M;
    const top = M;
    const right = M + W * 2;
    const bottom = M + H;
    const bleed = Math.max(this.bleedMm, 2);

    if (this.guides.bleed && this.bleedMm > 0) {
      ctx.strokeStyle = this.bleedColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([mm(2), mm(1.2)]);
      ctx.strokeRect(mm(left - this.bleedMm), mm(top - this.bleedMm), mm(W * 2 + this.bleedMm * 2), mm(H + this.bleedMm * 2));
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = this.ink;
    ctx.lineWidth = Math.max(1, k * 0.25);
    const markLength = Math.max(3, M - bleed - 3);
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(mm(x0), mm(y0));
      ctx.lineTo(mm(x1), mm(y1));
      ctx.stroke();
    };

    for (const x of [left, right]) {
      const outward = x === left ? -1 : 1;
      for (const y of [top, bottom]) {
        const vertical = y === top ? -1 : 1;
        line(x + outward * bleed, y, x + outward * (bleed + markLength), y);
        line(x, y + vertical * bleed, x, y + vertical * (bleed + markLength));
      }
    }
    ctx.setLineDash([mm(1.2), mm(1)]);
    const fold = M + W;
    line(fold, top - bleed, fold, top - bleed - markLength);
    line(fold, bottom + bleed, fold, bottom + bleed + markLength);
    ctx.setLineDash([]);

    const crossRadius = Math.min(3.2, M * 0.25);
    for (const x of [M / 2, right + M / 2]) {
      const cy = top + H / 2;
      ctx.beginPath();
      ctx.arc(mm(x), mm(cy), mm(crossRadius * 0.62), 0, Math.PI * 2);
      ctx.stroke();
      line(x - crossRadius, cy, x + crossRadius, cy);
      line(x, cy - crossRadius, x, cy + crossRadius);
    }

    const swatches = ['#00a0e3', '#e5007e', '#ffed00', '#1d1d1b', '#7fcff1', '#f27fbe', '#fff67f', '#8e8e8d'];
    const barHeight = Math.min(4, M * 0.32);
    const barY = bottom + M - barHeight - 1.5;
    const swatchWidth = barHeight * 1.4;
    const barWidth = swatchWidth * swatches.length;
    const startX = left + W - barWidth / 2 + (face === 'front' ? -W * 0.5 : W * 0.5);
    swatches.forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect(mm(startX + index * swatchWidth), mm(barY), mm(swatchWidth) - 1, mm(barHeight));
    });

    const { sheet, sheetCount } = info;
    const pages = face === 'front' ? sheet.front : sheet.back;
    const faceLabel = face === 'front' ? 'Cara' : 'Retiro';
    const label = `Pliego ${sheet.number}/${sheetCount} · ${faceLabel} · págs. ${pages.left} | ${pages.right}`;
    ctx.fillStyle = this.ink;
    ctx.font = `600 ${mm(Math.min(4.6, M * 0.3))}px "Archivo Variable", "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, mm(left), mm(top - M / 2 - 0.5));
    ctx.textAlign = 'right';
    ctx.fillText(sheet.role === 'cover' ? 'Cubierta' : `Cuadernillo ${sheet.signature + (info.sheets[0]?.role === "cover" && info.sheets.some((other) => other.signature > 0) ? 0 : 1)}`, mm(right), mm(top - M / 2 - 0.5));
    return canvas;
  }
}
