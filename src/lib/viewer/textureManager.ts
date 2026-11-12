import * as THREE from 'three';

import type { RasterTier } from '@/lib/types';

import type { PageTextureProvider } from './types';

const TIER_OF_RANK: readonly RasterTier[] = ['thumb', 'thumb', 'mid', 'high'];
const RANK_OF_TIER: Record<RasterTier, number> = { thumb: 1, mid: 2, high: 3 };

const THUMB_WINDOW = 14;
const MID_WINDOW = 3;
const MAX_IN_FLIGHT = 6;
const MAX_FAILURES = 2;

interface Entry {
  texture: THREE.Texture | null;
  rank: number;
  blank: boolean;
  bytes: number;
  pendingRank: number;
  controller: AbortController | null;
  failures: number;
}

export interface TextureStats {
  textures: number;
  megabytes: number;
  pending: number;
}

export class TextureManager {
  private readonly entries = new Map<number, Entry>();
  private provider: PageTextureProvider | null = null;
  private pageCount = 0;
  private inFlight = 0;
  private bytes = 0;
  private generation = 0;
  private readonly budgetBytes: number;
  private readonly anisotropy: number;
  private lastCenter = 0;
  private lastVisible: readonly number[] = [];
  private lastSettled = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly onChange: () => void,
  ) {
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    this.budgetBytes = (deviceMemory !== undefined && deviceMemory <= 4 ? 192 : 384) * 1024 * 1024;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  setModel(pageCount: number, provider: PageTextureProvider): void {
    this.disposeAll();
    this.pageCount = pageCount;
    this.provider = provider;
  }

  get(pageNumber: number): THREE.Texture | null {
    return this.entries.get(pageNumber)?.texture ?? null;
  }

  isReady(pageNumber: number): boolean {
    const entry = this.entries.get(pageNumber);
    return entry !== undefined && (entry.blank || entry.texture !== null);
  }

  stats(): TextureStats {
    let textures = 0;
    for (const entry of this.entries.values()) if (entry.texture) textures += 1;
    return { textures, megabytes: Math.round(this.bytes / (1024 * 1024)), pending: this.inFlight };
  }

  plan(centerLeaf: number, visiblePages: readonly number[], settled: boolean): void {
    this.lastCenter = centerLeaf;
    this.lastVisible = visiblePages;
    this.lastSettled = settled;
    if (!this.provider || this.pageCount === 0) return;

    const leaves = this.pageCount / 2;
    const want = new Map<number, number>();
    const first = Math.max(0, Math.floor(centerLeaf) - THUMB_WINDOW);
    const last = Math.min(leaves - 1, Math.ceil(centerLeaf) + THUMB_WINDOW);
    for (let leaf = first; leaf <= last; leaf += 1) {
      const rank = Math.abs(leaf + 0.5 - centerLeaf) <= MID_WINDOW + 0.5 ? 2 : 1;
      want.set(leaf * 2 + 1, rank);
      want.set(leaf * 2 + 2, rank);
    }
    want.set(1, Math.max(want.get(1) ?? 0, 2));
    want.set(this.pageCount, Math.max(want.get(this.pageCount) ?? 0, 2));
    for (const page of visiblePages) {
      if (page >= 1 && page <= this.pageCount) want.set(page, settled ? 3 : Math.max(2, want.get(page) ?? 0));
    }

    for (const [page, entry] of this.entries) {
      const wanted = want.get(page) ?? 0;
      if (entry.controller && entry.pendingRank > wanted) this.cancel(entry);
      if (wanted === 0 && entry.texture) this.release(entry);
      if (wanted === 0 && !entry.texture && !entry.controller) this.entries.delete(page);
    }

    this.enforceBudget(want, visiblePages, centerLeaf);

    const visible = new Set(visiblePages);
    const queue: Array<{ page: number; rank: number; score: number }> = [];
    for (const [page, wanted] of want) {
      const entry = this.entries.get(page);
      if (entry?.blank || (entry && entry.failures >= MAX_FAILURES)) continue;
      const have = Math.max(entry?.rank ?? 0, entry?.pendingRank ?? 0);
      if (have >= wanted) continue;
      const next = (entry?.rank ?? 0) === 0 && !entry?.controller ? 1 : wanted;
      const distance = Math.abs((page - 1) / 2 - centerLeaf);
      queue.push({ page, rank: next, score: (visible.has(page) ? 0 : 1000) + distance });
    }
    queue.sort((a, b) => a.score - b.score);
    for (const item of queue) {
      if (this.inFlight >= MAX_IN_FLIGHT) break;
      this.request(item.page, item.rank);
    }
  }

  invalidate(pageNumbers?: readonly number[]): void {
    if (!pageNumbers) {
      const provider = this.provider;
      const pageCount = this.pageCount;
      this.disposeAll();
      this.provider = provider;
      this.pageCount = pageCount;
    } else {
      for (const page of pageNumbers) {
        const entry = this.entries.get(page);
        if (!entry) continue;
        this.cancel(entry);
        this.release(entry);
        this.entries.delete(page);
      }
    }
    this.onChange();
  }

  disposeAll(): void {
    this.generation += 1;
    for (const entry of this.entries.values()) {
      this.cancel(entry);
      this.release(entry);
    }
    this.entries.clear();
    this.bytes = 0;
    this.inFlight = 0;
  }

  private entry(page: number): Entry {
    let entry = this.entries.get(page);
    if (!entry) {
      entry = { texture: null, rank: 0, blank: false, bytes: 0, pendingRank: 0, controller: null, failures: 0 };
      this.entries.set(page, entry);
    }
    return entry;
  }

  private cancel(entry: Entry): void {
    if (!entry.controller) return;
    entry.controller.abort();
    entry.controller = null;
    entry.pendingRank = 0;
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  private release(entry: Entry): void {
    if (!entry.texture) return;
    entry.texture.dispose();
    entry.texture = null;
    this.bytes -= entry.bytes;
    entry.bytes = 0;
    entry.rank = 0;
  }

  private request(page: number, rank: number): void {
    const provider = this.provider;
    if (!provider) return;
    const entry = this.entry(page);
    if (entry.controller) this.cancel(entry);
    const controller = new AbortController();
    const generation = this.generation;
    entry.controller = controller;
    entry.pendingRank = rank;
    this.inFlight += 1;

    const tier = TIER_OF_RANK[rank] ?? 'thumb';
    provider(page, tier, controller.signal)
      .then((bitmap) => {
        if (generation !== this.generation || entry.controller !== controller) {
          bitmap?.close();
          return;
        }
        this.finish(entry);
        if (!bitmap) {
          entry.blank = true;
        } else if (RANK_OF_TIER[tier] <= entry.rank) {
          bitmap.close();
        } else {
          this.upload(entry, bitmap, RANK_OF_TIER[tier]);
        }
        this.onChange();
        this.plan(this.lastCenter, this.lastVisible, this.lastSettled);
      })
      .catch((error: unknown) => {
        if (generation !== this.generation || entry.controller !== controller) return;
        this.finish(entry);
        const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
        if (!aborted) {
          entry.failures += 1;
          console.warn(`No se pudo cargar la textura de la página ${page} (${tier}).`, error);
        }
        this.plan(this.lastCenter, this.lastVisible, this.lastSettled);
      });
  }

  private finish(entry: Entry): void {
    entry.controller = null;
    entry.pendingRank = 0;
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  private upload(entry: Entry, bitmap: ImageBitmap, rank: number): void {
    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    const bytes = Math.round(bitmap.width * bitmap.height * 4 * (4 / 3));
    this.renderer.initTexture(texture);
    bitmap.close();

    this.release(entry);
    entry.texture = texture;
    entry.rank = rank;
    entry.bytes = bytes;
    this.bytes += bytes;
  }

  private enforceBudget(want: Map<number, number>, visiblePages: readonly number[], centerLeaf: number): void {
    if (this.bytes <= this.budgetBytes) return;
    const visible = new Set(visiblePages);
    const candidates: Array<{ page: number; entry: Entry; distance: number }> = [];
    for (const [page, entry] of this.entries) {
      if (!entry.texture || visible.has(page) || entry.rank <= (want.get(page) ?? 0)) continue;
      candidates.push({ page, entry, distance: Math.abs((page - 1) / 2 - centerLeaf) });
    }
    candidates.sort((a, b) => b.distance - a.distance);
    for (const candidate of candidates) {
      if (this.bytes <= this.budgetBytes) break;
      this.release(candidate.entry);
    }
  }
}
