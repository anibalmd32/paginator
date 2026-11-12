import * as THREE from 'three';

import type { CameraPreset, GuideVisibility, SheetFace, ViewerMode } from '@/lib/types';

import { createBookSpec, depthOfLeaf, spinePanel, surfaceParams } from './bookLayout';
import type { BookSpec } from './bookLayout';
import { CameraRig } from './cameraRig';
import { createCurveParams, createCurveSamples, LEAF_SAMPLES, sampleCurve } from './leafCurve';
import type { CurveSamples } from './leafCurve';
import { createContactShadowTexture, createSharedPageUniforms } from './materials';
import type { SharedPageUniforms } from './materials';
import { SheetView } from './sheetView';
import { PageSurface, StackEdges } from './surfaces';
import { TextureManager } from './textureManager';
import { DEFAULT_ENGINE_THEME } from './types';
import type { EngineEvents, EngineTheme, MagazineModel, PageAnchor, ViewerAnchors } from './types';

const FLIP_MS = 720;
const MULTI_FLIP_MS = 640;
const STAGGER_MS = 80;
const MAX_GROUPS = 5;
const MAX_ACTIVE_GROUPS = 8;
const PEEK = 0.035;
const MODE_MS = 420;
const REDUCED_FADE_MS = 160;
const SETTLE_HIGH_RES_MS = 200;
const GRAB_ZONE = 0.28;
const CLICK_MAX_MOVE = 6;
const CLICK_MAX_MS = 400;

type Ease = 'inOut' | 'out';

interface FlipGroup {
  a: number;
  b: number;
  t: number;
  from: number;
  to: number;
  start: number;
  duration: number;
  ease: Ease;
  dragging: boolean;
  frozen: boolean;
  peek: boolean;
  velocity: number;
}

interface DragState {
  group: FlipGroup;
  side: 'left' | 'right';
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
  lastT: number;
  lastTime: number;
}

const easeInOut = (u: number) => (1 - Math.cos(Math.PI * u)) / 2;
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createSpineMesh(material: THREE.Material): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(12), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export class MagazineEngine {
  private readonly container: HTMLElement;
  private readonly events: EngineEvents;
  private readonly renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig | null = null;
  private readonly textures: TextureManager | null = null;

  private readonly book = new THREE.Group();
  private readonly shared: SharedPageUniforms = createSharedPageUniforms();
  private readonly sheetShared: SharedPageUniforms;
  private readonly edgeColor = { value: new THREE.Color(DEFAULT_ENGINE_THEME.paperEdge) };
  private readonly surfacePool: PageSurface[] = [];
  private readonly edgePool: StackEdges[] = [];
  private readonly spineMaterial = new THREE.MeshBasicMaterial({ color: 0xd9d5cc, side: THREE.DoubleSide, toneMapped: false });
  private readonly spineMesh = createSpineMesh(this.spineMaterial);
  private readonly stapleMaterial = new THREE.MeshBasicMaterial({ color: 0x8f969c, toneMapped: false });
  private readonly staples: Array<THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>> = [];
  private readonly shadowTexture: THREE.CanvasTexture | null = null;
  private readonly shadowMaterial: THREE.MeshBasicMaterial;
  private readonly shadowMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly sheetView: SheetView;

  private model: MagazineModel | null = null;
  private spec: BookSpec | null = null;
  private leftCount = 0;
  private rightStart = 0;
  private groups: FlipGroup[] = [];
  private drag: DragState | null = null;
  private hoverSide: 'left' | 'right' | null = null;

  private mode: ViewerMode = 'reading';
  private modeT = 0;
  private modeAnim: { from: number; to: number; start: number } | null = null;
  private sheetIndex = 0;
  private sheetFace: SheetFace = 'front';
  private presetBeforeSheet: CameraPreset = 'reading';
  private readingPreset: CameraPreset = 'reading';

  private undersideSeen = false;
  private reducedMotion = false;
  private fade: { start: number } | null = null;
  private guides: GuideVisibility = { trim: false, bleed: false, safe: false };
  private theme: EngineTheme = DEFAULT_ENGINE_THEME;

  private raf = 0;
  private disposed = false;
  private lastEmittedSpread = -1;
  private lastSettledSpread = -1;
  private lastPosition = -1;
  private lastAnchorsKey = '';
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly resizeObserver: ResizeObserver | null = null;
  private lastFrameTime = 0;
  frames = 0;

  private readonly params = createCurveParams();
  private readonly curveA: CurveSamples = createCurveSamples();
  private readonly curveB: CurveSamples = createCurveSamples();
  private readonly spineEnds = new Float32Array(4);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly hit = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  private readonly onCapturePointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);
  private readonly onPointerLeave = () => this.setHover(null);
  private readonly onVisibility = () => {
    if (!document.hidden) this.requestRender();
  };
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };
  private readonly onContextRestored = () => {
    this.textures?.invalidate();
    this.requestRender();
  };

  constructor(container: HTMLElement, events: EngineEvents = {}) {
    this.container = container;
    this.events = events;
    this.sheetShared = { ...this.shared, uOpacity: { value: 0 } };
    this.sheetView = new SheetView(this.sheetShared);

    this.shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, toneMapped: false });
    this.shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMaterial);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      console.error('No se pudo crear el contexto WebGL.', error);
      queueMicrotask(() =>
        this.events.onError?.('Este navegador no puede mostrar el visor 3D (WebGL no está disponible o está desactivado).'),
      );
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.outline = 'none';
    container.append(canvas);

    this.textures = new TextureManager(renderer, () => this.requestRender());
    this.rig = new CameraRig(
      canvas,
      () => this.requestRender(),
      (preset) => this.events.onCameraPresetChange?.(preset),
    );

    this.shadowTexture = createContactShadowTexture();
    this.shadowMaterial.map = this.shadowTexture;
    this.shadowMaterial.opacity = this.theme.shadow;
    this.shadowMesh.renderOrder = -1;
    this.scene.add(this.shadowMesh);
    this.scene.add(this.book);
    this.scene.add(this.sheetView.group);
    this.book.add(this.spineMesh);

    const crownGeometry = new THREE.BoxGeometry(0.7, 12, 0.7);
    const clinchGeometry = new THREE.BoxGeometry(0.6, 12, 0.25);
    for (let i = 0; i < 4; i += 1) {
      const staple = new THREE.Mesh(i < 2 ? crownGeometry : clinchGeometry, this.stapleMaterial);
      this.staples.push(staple);
      this.book.add(staple);
    }

    container.addEventListener('pointerdown', this.onCapturePointerDown, { capture: true });
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.resize();
  }

  get spreadIndex(): number {
    return this.targetLeft();
  }

  get spreadCount(): number {
    return this.spec ? this.spec.leaves + 1 : 0;
  }

  setModel(model: MagazineModel, options: { spreadIndex?: number } = {}): void {
    if (!this.renderer || !this.textures || !this.rig) return;
    const previous = this.targetLeft();
    this.model = model;
    const spec = createBookSpec(model);
    this.spec = spec;
    this.groups = [];
    this.drag = null;
    const start = clamp(Math.round(options.spreadIndex ?? previous), 0, spec.leaves);
    this.leftCount = start;
    this.rightStart = start;
    this.lastEmittedSpread = -1;
    this.lastSettledSpread = -1;

    this.textures.setModel(model.pageCount, model.getPageTexture);
    this.shared.uSafeInset.value.set(model.safeMarginMm / spec.width, model.safeMarginMm / spec.height);
    this.sheetView.setFormat(spec.width, spec.height, model.bleedMm);
    this.sheetIndex = clamp(this.sheetIndex, 0, Math.max(0, model.sheets.length - 1));
    this.configureStaples();
    this.applyContentFrame();
    this.rig.reframe(false);
    if (this.mode === 'sheet') this.showCurrentSheet(false);
    this.planTextures(true);
    this.requestRender();
  }

  invalidateTextures(pageNumbers?: number[]): void {
    this.textures?.invalidate(pageNumbers);
    this.planTextures(this.groups.length === 0);
  }

  setTheme(theme: EngineTheme): void {
    this.theme = theme;
    this.shared.uPaper.value.set(theme.paper);
    this.shared.uGuideTrim.value.set(theme.guideTrim);
    this.shared.uGuideSafe.value.set(theme.guideSafe);
    this.edgeColor.value.set(theme.paperEdge);
    this.spineMaterial.color.set(theme.paperEdge).multiplyScalar(0.9);
    this.shadowMaterial.opacity = theme.shadow;
    this.sheetView.setColors('#1d2227', theme.paper, theme.guideBleed);
    this.requestRender();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setGuides(guides: GuideVisibility): void {
    this.guides = { ...guides };
    this.shared.uGuides.value.set(guides.trim ? 1 : 0, guides.safe ? 1 : 0);
    this.sheetView.setGuides(this.guides);
    this.requestRender();
  }

  goToSpread(index: number, options: { animate?: boolean } = {}): void {
    const spec = this.spec;
    if (!spec || this.mode === 'sheet') {
      if (spec) this.jumpTo(clamp(Math.round(index), 0, spec.leaves));
      return;
    }
    const target = clamp(Math.round(index), 0, spec.leaves);
    const animate = (options.animate ?? true) && !this.reducedMotion;
    if (this.drag) this.releaseDrag(null);
    if (!animate) {
      if (this.reducedMotion && options.animate !== false && target !== this.targetLeft()) this.fade = { start: performance.now() };
      this.jumpTo(target);
      return;
    }
    this.animateTo(target);
  }

  goToPage(pageNumber: number, options: { animate?: boolean } = {}): void {
    this.goToSpread(Math.floor(pageNumber / 2), options);
  }

  next(): void {
    if (this.mode === 'sheet') {
      this.showSheet(this.sheetIndex + 1, this.sheetFace);
      return;
    }
    this.goToSpread(this.targetLeft() + 1);
  }

  prev(): void {
    if (this.mode === 'sheet') {
      this.showSheet(this.sheetIndex - 1, this.sheetFace);
      return;
    }
    this.goToSpread(this.targetLeft() - 1);
  }

  setCameraPreset(preset: CameraPreset, options: { animate?: boolean } = {}): void {
    if (!this.rig) return;
    if (this.mode === 'reading') this.readingPreset = preset;
    this.rig.applyPreset(preset, (options.animate ?? true) && !this.reducedMotion);
    this.requestRender();
  }

  resetView(): void {
    if (!this.rig) return;
    const preset = this.rig.preset === 'free' ? (this.mode === 'sheet' ? 'top' : this.readingPreset) : this.rig.preset;
    this.setCameraPreset(preset);
  }

  zoomBy(factor: number): void {
    this.rig?.zoomBy(factor, !this.reducedMotion);
    this.requestRender();
  }

  setMode(mode: ViewerMode): void {
    if (mode === this.mode || !this.rig) return;
    if (this.drag) this.releaseDrag(null);
    this.mode = mode;
    const now = performance.now();
    if (mode === 'sheet') {
      this.presetBeforeSheet = this.rig.preset === 'free' ? this.readingPreset : this.rig.preset;
      this.settleGroups();
      this.showCurrentSheet(false);
    } else {
      const sheet = this.model?.sheets[this.sheetIndex];
      if (sheet && this.spec) {
        const side = this.sheetFace === 'front' ? sheet.front : sheet.back;
        this.jumpTo(clamp(Math.floor(Math.min(side.left, side.right) / 2), 0, this.spec.leaves));
      }
    }
    this.modeAnim = this.reducedMotion ? null : { from: this.modeT, to: mode === 'sheet' ? 1 : 0, start: now };
    if (this.reducedMotion) this.modeT = mode === 'sheet' ? 1 : 0;
    this.applyContentFrame();
    this.rig.applyPreset(mode === 'sheet' ? 'top' : this.presetBeforeSheet, !this.reducedMotion);
    this.planTextures(true);
    this.requestRender();
  }

  showSheet(sheetIndex: number, face: SheetFace): void {
    const model = this.model;
    if (!model || model.sheets.length === 0) return;
    const index = clamp(Math.round(sheetIndex), 0, model.sheets.length - 1);
    const sameSheet = index === this.sheetIndex;
    this.sheetIndex = index;
    this.sheetFace = face;
    if (this.mode === 'sheet') {
      this.showCurrentSheet(sameSheet && !this.reducedMotion);
      if (!sameSheet && !this.reducedMotion) this.fade = { start: performance.now() };
      this.planTextures(true);
    }
    this.events.onSheetChange?.(index, face);
    this.requestRender();
  }

  resize(): void {
    if (!this.renderer || !this.rig) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.rig.setViewport(width, height);
    this.rig.reframe(false);
    this.lastAnchorsKey = '';
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.resizeObserver?.disconnect();
    this.container.removeEventListener('pointerdown', this.onCapturePointerDown, { capture: true });
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.textures?.disposeAll();
    this.rig?.dispose();
    for (const surface of this.surfacePool) surface.dispose();
    for (const edges of this.edgePool) edges.dispose();
    this.spineMesh.geometry.dispose();
    this.spineMaterial.dispose();
    for (const staple of this.staples) staple.geometry.dispose();
    this.stapleMaterial.dispose();
    this.shadowMesh.geometry.dispose();
    this.shadowMaterial.dispose();
    this.shadowTexture?.dispose();
    this.sheetView.dispose();
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('webglcontextlost', this.onContextLost);
      canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      canvas.remove();
    }
  }

  debugFreezeFlip(t: number, direction: 'forward' | 'backward' = 'forward'): void {
    if (!this.spec) return;
    this.settleGroups();
    const group =
      direction === 'forward' ? this.takeFromRight(1, performance.now(), 0) : this.takeFromLeft(1, performance.now(), 0);
    if (!group) return;
    group.frozen = true;
    group.t = clamp(t, 0, 1);
    group.velocity = direction === 'forward' ? 1.4 : -1.4;
    this.requestRender();
  }

  debugRelease(): void {
    const now = performance.now();
    for (const group of this.groups) {
      if (!group.frozen) continue;
      group.frozen = false;
      this.retarget(group, group.t >= 0.5 ? 1 : 0, now, 'out');
    }
    this.requestRender();
  }

  debugStats(): { frames: number; groups: number; textures: number; textureMB: number; pending: number; programs: number; geometries: number; gpuTextures: number } {
    const stats = this.textures?.stats() ?? { textures: 0, megabytes: 0, pending: 0 };
    const info = this.renderer?.info;
    return {
      frames: this.frames,
      groups: this.groups.length,
      textures: stats.textures,
      textureMB: stats.megabytes,
      pending: stats.pending,
      programs: info?.programs?.length ?? 0,
      geometries: info?.memory.geometries ?? 0,
      gpuTextures: info?.memory.textures ?? 0,
    };
  }

  private targetLeft(): number {
    let target = this.leftCount;
    for (const group of this.groups) if (group.to === 1) target += group.b - group.a + 1;
    return target;
  }

  private position(): number {
    let position = this.leftCount;
    for (const group of this.groups) position += (group.b - group.a + 1) * group.t;
    return position;
  }

  private jumpTo(target: number): void {
    this.groups = [];
    this.leftCount = target;
    this.rightStart = target;
    this.afterNavigation(true);
  }

  private animateTo(target: number): void {
    const now = performance.now();
    for (const group of this.groups) {
      if (group.peek) {
        group.peek = false;
        this.retarget(group, group.t > 0.5 ? 1 : 0, now, 'out');
      }
    }
    this.groups.sort((x, y) => x.a - y.a);
    let current = this.targetLeft();

    if (target > current) {
      for (const group of this.groups) {
        if (current >= target) break;
        if (group.to !== 1 && !group.frozen && !group.dragging) {
          this.retarget(group, 1, now, 'inOut');
          current += group.b - group.a + 1;
        }
      }
      if (current < target) this.launch(target - current, 'forward', now);
    } else if (target < current) {
      for (let i = this.groups.length - 1; i >= 0; i -= 1) {
        const group = this.groups[i];
        if (!group || current <= target) break;
        if (group.to === 1 && !group.frozen && !group.dragging) {
          this.retarget(group, 0, now, 'inOut');
          current -= group.b - group.a + 1;
        }
      }
      if (current > target) this.launch(current - target, 'backward', now);
    }
    this.afterNavigation(false);
  }

  private launch(count: number, direction: 'forward' | 'backward', now: number): void {
    const groupsWanted = Math.min(MAX_GROUPS, count, Math.max(1, MAX_ACTIVE_GROUPS - this.groups.length));
    const base = Math.floor(count / groupsWanted);
    let extra = count % groupsWanted;
    const duration = count === 1 ? FLIP_MS : MULTI_FLIP_MS;
    for (let i = 0; i < groupsWanted; i += 1) {
      const size = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      const start = now + i * STAGGER_MS;
      const group = direction === 'forward' ? this.takeFromRight(size, start, duration) : this.takeFromLeft(size, start, duration);
      if (!group) break;
      this.retarget(group, direction === 'forward' ? 1 : 0, start, 'inOut', duration);
    }
  }

  private takeFromRight(size: number, start: number, duration: number): FlipGroup | null {
    const spec = this.spec;
    if (!spec || this.rightStart >= spec.leaves) return null;
    const a = this.rightStart;
    const b = Math.min(spec.leaves - 1, a + size - 1);
    this.rightStart = b + 1;
    const group: FlipGroup = { a, b, t: 0, from: 0, to: 0, start, duration, ease: 'inOut', dragging: false, frozen: false, peek: false, velocity: 0 };
    this.groups.push(group);
    this.groups.sort((x, y) => x.a - y.a);
    return group;
  }

  private takeFromLeft(size: number, start: number, duration: number): FlipGroup | null {
    if (this.leftCount <= 0) return null;
    const b = this.leftCount - 1;
    const a = Math.max(0, b - size + 1);
    this.leftCount = a;
    const group: FlipGroup = { a, b, t: 1, from: 1, to: 1, start, duration, ease: 'inOut', dragging: false, frozen: false, peek: false, velocity: 0 };
    this.groups.push(group);
    this.groups.sort((x, y) => x.a - y.a);
    return group;
  }

  private retarget(group: FlipGroup, to: number, start: number, ease: Ease, duration?: number): void {
    group.from = group.t;
    group.to = to;
    group.start = start;
    group.ease = ease;
    group.duration = duration ?? Math.max(160, FLIP_MS * Math.abs(to - group.t) * (ease === 'out' ? 0.8 : 1));
  }

  private settleGroups(): void {
    for (const group of this.groups) {
      group.dragging = false;
      group.frozen = false;
      group.peek = false;
      group.t = group.to >= 0.5 ? 1 : 0;
      group.to = group.t;
    }
    this.drag = null;
    this.absorbGroups();
    if (this.groups.length > 0) this.jumpTo(this.targetLeft());
  }

  private absorbGroups(): void {
    this.groups.sort((x, y) => x.a - y.a);
    let changed = true;
    while (changed) {
      changed = false;
      const first = this.groups[0];
      if (first && first.a === this.leftCount && first.to === 1 && first.t >= 1 && !first.dragging && !first.frozen && !first.peek) {
        this.leftCount = first.b + 1;
        this.groups.shift();
        changed = true;
      }
      const last = this.groups[this.groups.length - 1];
      if (last && last.b === this.rightStart - 1 && last.to === 0 && last.t <= 0 && !last.dragging && !last.frozen && !last.peek) {
        this.rightStart = last.a;
        this.groups.pop();
        changed = true;
      }
    }
    if (this.groups.length === 0) this.rightStart = this.leftCount;
  }

  private afterNavigation(settledNow: boolean): void {
    const target = this.targetLeft();
    if (target !== this.lastEmittedSpread) {
      this.lastEmittedSpread = target;
      this.events.onSpreadChange?.(target, settledNow && this.groups.length === 0);
      if (settledNow && this.groups.length === 0) this.lastSettledSpread = target;
    }
    if (settledNow && this.groups.length === 0 && this.lastSettledSpread !== target) {
      this.lastSettledSpread = target;
      this.events.onSpreadChange?.(target, true);
    }
    this.planTextures(settledNow && this.groups.length === 0);
    this.requestRender();
  }

  private grabSide(clientX: number, clientY: number): 'left' | 'right' | null {
    const spec = this.spec;
    const rig = this.rig;
    if (!spec || !rig || !this.renderer || this.mode !== 'reading' || this.modeT > 0.01) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, rig.camera);
    this.plane.constant = -spec.total / 2;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    const xc = spec.dir * (this.hit.x - this.book.position.x);
    if (Math.abs(this.hit.y) > spec.height / 2 + 4) return null;
    const ax = Math.abs(xc);
    if (ax < spec.width * (1 - GRAB_ZONE) || ax > spec.width * 1.05) return null;
    if (xc > 0) return this.rightStart < spec.leaves || this.hasPeek('right') ? 'right' : null;
    return this.leftCount > 0 || this.hasPeek('left') ? 'left' : null;
  }

  private hasPeek(side: 'left' | 'right'): boolean {
    return this.groups.some((group) => group.peek && (side === 'right' ? group.to < 0.5 : group.to > 0.5));
  }

  private pointerToT(clientX: number, clientY: number): number | null {
    const spec = this.spec;
    const rig = this.rig;
    if (!spec || !rig || !this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, rig.camera);
    this.plane.constant = -spec.total / 2;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    const xc = spec.dir * (this.hit.x - this.book.position.x);
    return Math.acos(clamp(xc / spec.width, -1, 1)) / Math.PI;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.drag) return;
    const side = this.grabSide(event.clientX, event.clientY);
    if (!side) return;
    event.stopPropagation();
    event.preventDefault();
    const now = performance.now();
    let group = this.groups.find((g) => g.peek && (side === 'right' ? g.to < 0.5 : g.to > 0.5)) ?? null;
    if (group) {
      group.peek = false;
    } else {
      group = side === 'right' ? this.takeFromRight(1, now, 0) : this.takeFromLeft(1, now, 0);
    }
    if (!group) return;
    group.dragging = true;
    group.to = group.t;
    this.drag = {
      group,
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      moved: false,
      lastT: group.t,
      lastTime: now,
    };
    this.hoverSide = null;
    if (this.renderer) this.renderer.domElement.style.cursor = 'grabbing';
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.requestRender();
  }

  private handlePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (drag) {
      if (event.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_MAX_MOVE) drag.moved = true;
      if (!drag.moved) return;
      const t = this.pointerToT(event.clientX, event.clientY);
      if (t === null) return;
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastTime);
      const instant = ((t - drag.lastT) / dt) * 1000;
      drag.group.velocity = drag.group.velocity * 0.6 + instant * 0.4;
      drag.group.t = t;
      drag.group.to = t;
      drag.lastT = t;
      drag.lastTime = now;
      this.requestRender();
      return;
    }
    if (event.pointerType === 'touch') return;
    this.setHover(this.grabSide(event.clientX, event.clientY));
  }

  private handlePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const quick = !drag.moved && performance.now() - drag.startTime < CLICK_MAX_MS;
    this.releaseDrag(quick ? (drag.side === 'right' ? 1 : 0) : null);
  }

  private releaseDrag(forcedTo: number | null): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    if (this.renderer) this.renderer.domElement.style.cursor = '';
    const group = drag.group;
    group.dragging = false;
    let to = forcedTo;
    if (to === null) {
      if (group.velocity > 1.1) to = 1;
      else if (group.velocity < -1.1) to = 0;
      else to = group.t >= 0.5 ? 1 : 0;
    }
    if (!drag.moved && forcedTo !== null) {
      this.retarget(group, to, performance.now(), 'inOut', FLIP_MS * Math.abs(to - group.t));
    } else {
      this.retarget(group, to, performance.now(), 'out');
    }
    this.afterNavigation(false);
  }

  private setHover(side: 'left' | 'right' | null): void {
    if (side === this.hoverSide) return;
    this.hoverSide = side;
    if (this.renderer && !this.drag) this.renderer.domElement.style.cursor = side ? 'grab' : '';
    const now = performance.now();
    for (const group of this.groups) {
      if (group.peek) {
        group.peek = false;
        this.retarget(group, group.to > 0.5 ? 1 : 0, now, 'out', 180);
      }
    }
    if (side && !this.reducedMotion && this.groups.length === 0) {
      const group = side === 'right' ? this.takeFromRight(1, now, 0) : this.takeFromLeft(1, now, 0);
      if (group) {
        group.peek = true;
        this.retarget(group, side === 'right' ? PEEK : 1 - PEEK, now, 'out', 200);
      }
    }
    this.requestRender();
  }

  private requestRender(): void {
    if (this.disposed || !this.renderer || this.raf !== 0 || document.hidden) return;
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    this.raf = 0;
    if (this.disposed || !this.renderer || !this.rig) return;
    const dt = this.lastFrameTime ? Math.min(64, now - this.lastFrameTime) : 16;
    this.lastFrameTime = now;

    let moving = this.rig.update(performance.now());
    this.trackUnderside();
    moving = this.updateGroups(performance.now(), dt) || moving;
    moving = this.updateMode(performance.now()) || moving;
    moving = this.sheetView.update(performance.now()) || moving;
    if (this.fade) {
      const u = (performance.now() - this.fade.start) / REDUCED_FADE_MS;
      if (u >= 1) this.fade = null;
      else moving = true;
    }

    this.layoutBook();
    this.applyOpacity();
    this.sheetView.updateTextures((page) => this.textures?.get(page) ?? null);
    this.renderer.render(this.scene, this.rig.camera);
    this.frames += 1;
    this.emitPosition();
    this.emitAnchors();

    if (moving) this.requestRender();
    else this.lastFrameTime = 0;
  }

  private updateGroups(now: number, dt: number): boolean {
    if (this.groups.length === 0) return false;
    let moving = false;
    for (const group of this.groups) {
      if (group.dragging || group.frozen) {
        if (group.dragging) moving = true;
        continue;
      }
      if (now < group.start) {
        moving = true;
        continue;
      }
      if (group.t === group.to) {
        group.velocity *= 0.5;
        continue;
      }
      const u = group.duration <= 0 ? 1 : Math.min(1, (now - group.start) / group.duration);
      const e = group.ease === 'out' ? easeOut(u) : easeInOut(u);
      const previous = group.t;
      group.t = u >= 1 ? group.to : group.from + (group.to - group.from) * e;
      const instant = ((group.t - previous) / Math.max(1, dt)) * 1000;
      group.velocity = group.velocity * 0.7 + instant * 0.3;
      moving = true;
    }
    const before = this.groups.length;
    this.absorbGroups();
    if (this.groups.length === 0 && before > 0) this.onAnimationsSettled();
    return moving || this.groups.some((group) => group.t !== group.to);
  }

  private onAnimationsSettled(): void {
    const target = this.targetLeft();
    this.lastEmittedSpread = target;
    if (this.lastSettledSpread !== target) {
      this.lastSettledSpread = target;
      this.events.onSpreadChange?.(target, true);
    }
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.groups.length === 0) this.planTextures(true);
    }, SETTLE_HIGH_RES_MS);
  }

  private updateMode(now: number): boolean {
    if (!this.modeAnim) return false;
    const u = Math.min(1, (now - this.modeAnim.start) / MODE_MS);
    const e = easeOut(u);
    this.modeT = this.modeAnim.from + (this.modeAnim.to - this.modeAnim.from) * e;
    if (u >= 1) this.modeAnim = null;
    return true;
  }

  private applyOpacity(): void {
    let fade = 1;
    if (this.fade) {
      const u = clamp((performance.now() - this.fade.start) / REDUCED_FADE_MS, 0, 1);
      fade = 0.35 + 0.65 * u;
    }
    const bookOpacity = (1 - this.modeT) * (this.mode === 'reading' ? fade : 1);
    const sheetOpacity = this.modeT * (this.mode === 'sheet' ? fade : 1);
    this.shared.uOpacity.value = bookOpacity;
    this.sheetShared.uOpacity.value = sheetOpacity;
    this.book.visible = bookOpacity > 0.002;
    this.sheetView.group.visible = sheetOpacity > 0.002;
    this.sheetView.setOpacity(sheetOpacity);
    this.book.scale.setScalar(1 - 0.08 * this.modeT);
    this.sheetView.group.scale.setScalar(0.94 + 0.06 * this.modeT);

    const bookTransparent = bookOpacity < 0.999;
    for (const surface of this.surfacePool) surface.mesh.material.transparent = bookTransparent;
    for (const edges of this.edgePool) edges.mesh.material.transparent = bookTransparent;
    this.spineMaterial.transparent = bookTransparent;
    this.spineMaterial.opacity = bookOpacity;
    this.stapleMaterial.transparent = bookTransparent;
    this.stapleMaterial.opacity = bookOpacity;
    this.shadowMaterial.opacity = this.theme.shadow * Math.max(bookOpacity, 0.6 * sheetOpacity);
  }

  private surfaceAt(index: number): PageSurface {
    let surface = this.surfacePool[index];
    if (!surface) {
      surface = new PageSurface(this.shared);
      this.surfacePool.push(surface);
      this.book.add(surface.mesh);
    }
    return surface;
  }

  private edgesAt(index: number): StackEdges {
    let edges = this.edgePool[index];
    if (!edges) {
      edges = new StackEdges(this.edgeColor, this.shared.uOpacity);
      this.edgePool.push(edges);
      this.book.add(edges.mesh);
    }
    return edges;
  }

  private leafProgress(leaf: number): number {
    if (leaf < this.leftCount) return 1;
    if (leaf >= this.rightStart) return 0;
    const group = this.groups.find((g) => leaf >= g.a && leaf <= g.b);
    return group ? group.t : 0;
  }

  private layoutBook(): void {
    const spec = this.spec;
    const model = this.model;
    if (!spec || !model || !this.textures) return;
    const W = spec.width;
    const H = spec.height;
    const T = spec.total;
    const dir = spec.dir;

    let turned = depthOfLeaf(spec, this.leftCount);
    for (const group of this.groups) turned += (depthOfLeaf(spec, group.b + 1) - depthOfLeaf(spec, group.a)) * group.t;
    const f = T > 0 ? clamp(turned / T, 0, 1) : 0;

    const p0 = this.leafProgress(0);
    const pLast = this.leafProgress(spec.leaves - 1);
    const shift = dir * ((-W / 2) * (1 - p0) + (W / 2) * pLast);
    this.book.position.x = shift;
    const openness = clamp(Math.min(p0, 1 - pLast) * 2, 0, 1);
    const span = W * (1 + openness);
    this.shadowMesh.scale.set(span + 26, H + 26, 1);
    this.shadowMesh.position.set(0, -2, -0.2);

    let surfaceIndex = 0;
    let edgeIndex = 0;
    const textures = this.textures;
    const gutterShade = 0.16 * openness;
    const place = (leafFace: 'recto' | 'verso', leaf: number, depth: number, t: number, curl: number, visible: boolean, curve: CurveSamples) => {
      surfaceParams(spec, depth, t, f, curl, visible ? openness : 0, this.params);
      sampleCurve(this.params, W, curve);
      const surface = this.surfaceAt(surfaceIndex);
      surfaceIndex += 1;
      surface.configure(leafFace, dir);
      surface.update(curve, dir, H);
      surface.pageNumber = leafFace === 'recto' ? leaf * 2 + 1 : leaf * 2 + 2;
      surface.setTexture(textures.get(surface.pageNumber));
      surface.uniforms.uShadowAmount.value = 0;
      surface.uniforms.uGutter.value = visible ? gutterShade : 0;
      surface.mesh.visible = true;
      surface.mesh.renderOrder = visible ? 2 : 1;
      return surface;
    };
    const edge = (lower: CurveSamples, upper: CurveSamples, leaves: number, coverBottom: boolean, coverTop: boolean, thickness: number) => {
      const edges = this.edgesAt(edgeIndex);
      edgeIndex += 1;
      edges.update(lower, upper, dir, H);
      edges.uniforms.uLeaves.value = Math.max(1, leaves);
      const coverFraction = thickness > 0 ? spec.coverThickness / thickness : 0;
      edges.uniforms.uCoverBottom.value = coverBottom ? coverFraction : 0;
      edges.uniforms.uCoverTop.value = coverTop ? coverFraction : 0;
      edges.mesh.visible = true;
    };

    const hasCover = spec.coverThickness > 0;
    let leftTop: PageSurface | null = null;
    let rightTop: PageSurface | null = null;

    if (this.leftCount > 0) {
      const top = depthOfLeaf(spec, this.leftCount);
      place('recto', 0, 0, 1, 0, false, this.curveA);
      leftTop = place('verso', this.leftCount - 1, top, 1, 0, true, this.curveB);
      edge(this.curveA, this.curveB, this.leftCount, hasCover, hasCover && this.leftCount === spec.leaves, top);
    }
    if (this.rightStart < spec.leaves) {
      const top = depthOfLeaf(spec, this.rightStart);
      place('verso', spec.leaves - 1, T, 0, 0, false, this.curveA);
      rightTop = place('recto', this.rightStart, top, 0, 0, true, this.curveB);
      edge(this.curveA, this.curveB, spec.leaves - this.rightStart, hasCover, hasCover && this.rightStart === 0, T - top);
    }
    for (const group of this.groups) {
      const speed = Math.abs(group.velocity);
      const curl = Math.sign(group.velocity || (group.to - group.from) || 1) * clamp(0.35 + speed * 0.28, 0.35, 1.1);
      const lowDepth = depthOfLeaf(spec, group.a);
      const highDepth = depthOfLeaf(spec, group.b + 1);
      place('recto', group.a, lowDepth, group.t, curl, true, this.curveA);
      place('verso', group.b, highDepth, group.t, curl, true, this.curveB);
      if (group.b > group.a || highDepth - lowDepth > 0.15) {
        edge(this.curveA, this.curveB, group.b - group.a + 1, hasCover && group.a === 0, hasCover && group.b === spec.leaves - 1, highDepth - lowDepth);
      }
    }
    this.surfacePool.forEach((surface, index) => {
      if (index >= surfaceIndex) surface.mesh.visible = false;
    });
    this.edgePool.forEach((edges, index) => {
      if (index >= edgeIndex) edges.mesh.visible = false;
    });

    this.applyCastShadows(leftTop, rightTop);
    this.layoutSpine(f);
  }

  private applyCastShadows(leftTop: PageSurface | null, rightTop: PageSurface | null): void {
    const spec = this.spec;
    if (!spec || this.groups.length === 0) return;
    const nearest = (side: 'left' | 'right') => {
      const ordered = side === 'right' ? [...this.groups].reverse() : this.groups;
      return ordered.find((group) => (side === 'right' ? group.t < 0.5 : group.t >= 0.5)) ?? null;
    };
    for (const [side, surface] of [['right', rightTop], ['left', leftTop]] as const) {
      const group = nearest(side);
      if (!surface || !group) continue;
      const lift = Math.sin(Math.PI * group.t);
      const reach = Math.abs(Math.cos(Math.PI * group.t));
      surface.uniforms.uShadowEdge.value = reach;
      surface.uniforms.uShadowSoft.value = 0.06 + 0.25 * lift;
      surface.uniforms.uShadowAmount.value = 0.32 * lift;
    }
  }

  private layoutSpine(f: number): void {
    const spec = this.spec;
    if (!spec) return;
    const H = spec.height;
    const perfect = spec.binding === 'perfect-bound';
    this.spineMesh.visible = perfect;
    if (perfect) {
      spinePanel(spec, f, this.spineEnds);
      const p = this.spineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const x0 = spec.dir * (this.spineEnds[0] ?? 0);
      const z0 = this.spineEnds[1] ?? 0;
      const x1 = spec.dir * (this.spineEnds[2] ?? 0);
      const z1 = this.spineEnds[3] ?? 0;
      p.setXYZ(0, x0, -H / 2, z0);
      p.setXYZ(1, x1, -H / 2, z1);
      p.setXYZ(2, x1, H / 2, z1);
      p.setXYZ(3, x0, H / 2, z0);
      p.needsUpdate = true;
    }
    const atCenter = this.groups.length === 0 && this.leftCount === spec.leaves / 2 && this.rightStart === this.leftCount;
    this.staples.forEach((staple, index) => {
      staple.visible = !perfect && (index < 2 || atCenter);
    });
  }

  private configureStaples(): void {
    const spec = this.spec;
    if (!spec) return;
    const T = spec.total;
    const H = spec.height;
    this.staples.forEach((staple, index) => {
      const y = (index % 2 === 0 ? -1 : 1) * H * 0.26;
      if (index < 2) staple.position.set(spec.dir * -0.3, y, T / 2);
      else staple.position.set(0, y, T / 2 + 0.08);
    });
  }

  private applyContentFrame(): void {
    const spec = this.spec;
    if (!spec || !this.rig) return;
    if (this.mode === 'sheet') {
      const extent = this.sheetView.extent;
      this.rig.setContent(extent.width, extent.height, 0);
    } else {
      this.rig.setContent(spec.width * 2, spec.height, spec.total / 2);
    }
  }

  private showCurrentSheet(animate: boolean): void {
    const model = this.model;
    const sheet = model?.sheets[this.sheetIndex];
    if (!model || !sheet) return;
    this.sheetView.show({ sheet, sheetCount: model.sheets.length, sheets: model.sheets }, this.sheetFace, animate);
  }

  private trackUnderside(): void {
    const spec = this.spec;
    const rig = this.rig;
    if (!spec || !rig || this.mode !== 'reading') return;
    const camera = rig.camera.position;
    const target = rig.controls.target;
    const distance = camera.distanceTo(target);
    const seen = camera.z - spec.total / 2 < distance * 0.35;
    if (seen === this.undersideSeen) return;
    this.undersideSeen = seen;
    this.planTextures(this.groups.length === 0);
  }

  private planTextures(settled: boolean): void {
    const spec = this.spec;
    if (!spec || !this.textures) return;
    if (this.mode === 'sheet') {
      const pages = this.sheetView.pages.filter((page) => page > 0);
      const center = pages.length > 0 ? (Math.min(...pages) - 1) / 2 : 0;
      this.textures.plan(center, pages, settled);
      return;
    }
    const target = this.targetLeft();
    const visible: number[] = [];
    if (target > 0) visible.push(target * 2);
    if (target < spec.leaves) visible.push(target * 2 + 1);
    for (const group of this.groups) visible.push(group.a * 2 + 1, group.b * 2 + 2);
    if (this.undersideSeen) {
      if (this.leftCount > 0) visible.push(1);
      if (this.rightStart < spec.leaves) visible.push(spec.leaves * 2);
    }
    this.textures.plan(this.position(), visible, settled);
  }

  private emitPosition(): void {
    const position = this.position();
    if (Math.abs(position - this.lastPosition) < 1e-4) return;
    this.lastPosition = position;
    this.events.onPosition?.(position);
  }

  private emitAnchors(): void {
    const spec = this.spec;
    const rig = this.rig;
    if (!spec || !rig || !this.events.onAnchors) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const anchors: PageAnchor[] = [];
    const fromBehind = rig.camera.position.z < spec.total / 2;
    if (this.mode === 'reading' && this.modeT < 0.5 && !fromBehind) {
      const project = (pageNumber: number, canonicalX: number, z: number) => {
        this.projected.set(spec.dir * canonicalX + this.book.position.x, -spec.height / 2, z).project(rig.camera);
        const x = ((this.projected.x + 1) / 2) * width;
        const y = ((1 - this.projected.y) / 2) * height;
        anchors.push({ pageNumber, x, y, visible: this.projected.z < 1 && x >= 0 && x <= width && y >= 0 && y <= height });
      };
      if (this.leftCount > 0) project(this.leftCount * 2, -spec.width / 2, depthOfLeaf(spec, this.leftCount));
      if (this.rightStart < spec.leaves) project(this.rightStart * 2 + 1, spec.width / 2, spec.total - depthOfLeaf(spec, this.rightStart));
    }
    anchors.sort((a, b) => a.x - b.x);
    let left: PageAnchor | null = null;
    let right: PageAnchor | null = null;
    if (anchors.length === 2) {
      left = anchors[0] ?? null;
      right = anchors[1] ?? null;
    } else if (anchors.length === 1) {
      const only = anchors[0] ?? null;
      if (only && only.pageNumber % 2 === (spec.dir > 0 ? 1 : 0)) right = only;
      else left = only;
    }
    const key = [left, right].map((a) => (a ? `${a.pageNumber}:${Math.round(a.x * 2)}:${Math.round(a.y * 2)}:${a.visible}` : '-')).join('|');
    if (key === this.lastAnchorsKey) return;
    this.lastAnchorsKey = key;
    const result: ViewerAnchors = { left, right };
    this.events.onAnchors?.(result);
  }
}

export const CURVE_SAMPLES = LEAF_SAMPLES;
