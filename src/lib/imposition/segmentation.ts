import type { FolioHit, InputMode, MagazineConfig, Page, PageHalf, SourceUnit } from '@/lib/types';

import { computeImposition, paddedPageCount, printerSideSequence } from './imposition';

export type UnitKind = 'single' | 'double';

const DOUBLE_RATIO_FACTOR = 1.6;

const AUTO_BLANK_PREFIX = 'blank:auto:';
const MANUAL_BLANK_PREFIX = 'blank:manual:';

function aspectRatio(unit: SourceUnit): number | null {
  const { width, height } = unit;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

export function sortUnitsByOrder(units: readonly SourceUnit[]): SourceUnit[] {
  const rank = (unit: SourceUnit): number => (Number.isFinite(unit.order) ? unit.order : Number.MAX_SAFE_INTEGER);
  return units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => rank(a.unit) - rank(b.unit) || a.index - b.index)
    .map((entry) => entry.unit);
}

export function classifyUnits(units: SourceUnit[], inputMode: InputMode): Map<string, UnitKind> {
  const fallback: UnitKind = inputMode === 'spreads' ? 'double' : 'single';
  const ratios = units.map(aspectRatio);

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const ratio of ratios) {
    if (ratio === null) continue;
    min = Math.min(min, ratio);
    max = Math.max(max, ratio);
  }
  const mixed = max > 0 && max / min >= DOUBLE_RATIO_FACTOR;
  const threshold = Math.sqrt(max * min);

  const kinds = new Map<string, UnitKind>();
  units.forEach((unit, index) => {
    const ratio = ratios[index] ?? null;
    if (!mixed || ratio === null) kinds.set(unit.id, fallback);
    else kinds.set(unit.id, ratio > threshold ? 'double' : 'single');
  });
  return kinds;
}

const FOLIO_ANCHORS: Record<PageHalf, readonly number[]> = {
  full: [0, 0.5, 1],
  left: [0, 0.25],
  right: [1, 0.75],
};

function isUsableHit(hit: FolioHit): boolean {
  return Number.isFinite(hit.value) && Number.isFinite(hit.x) && Number.isFinite(hit.y);
}

export function detectFolio(unit: SourceUnit, half: PageHalf): number | null {
  const hits = unit.folios.filter(isUsableHit);
  if (hits.length === 0) {
    const fromName = unit.filenameNumber;
    return half === 'full' && fromName !== null && Number.isFinite(fromName) ? fromName : null;
  }

  let best: FolioHit | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    if (half === 'left' && hit.x >= 0.5) continue;
    if (half === 'right' && hit.x < 0.5) continue;
    for (const anchorX of FOLIO_ANCHORS[half]) {
      const distance = Math.hypot(hit.x - anchorX, hit.y - 1);
      if (distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    }
  }
  return best === null ? null : best.value;
}

function filePage(unit: SourceUnit, half: PageHalf): Page {
  return { id: `${unit.id}:${half}`, origin: 'file', unitId: unit.id, half, detectedFolio: detectFolio(unit, half) };
}

function autoBlank(serial: number): Page {
  return { id: `${AUTO_BLANK_PREFIX}${String(serial)}`, origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null };
}

function nextAutoBlankSerial(pages: readonly Page[]): number {
  let highest = 0;
  for (const page of pages) {
    if (!page.id.startsWith(AUTO_BLANK_PREFIX)) continue;
    const serial = Number(page.id.slice(AUTO_BLANK_PREFIX.length));
    if (Number.isInteger(serial) && serial > highest) highest = serial;
  }
  return highest + 1;
}

function buildFromReaderSpreads(units: readonly SourceUnit[], config: MagazineConfig): Page[] {
  const kinds = classifyUnits([...units], 'spreads');
  const rtl = config.readingDirection === 'rtl';
  const firstHalf: PageHalf = rtl ? 'right' : 'left';
  const secondHalf: PageHalf = rtl ? 'left' : 'right';

  const pages: Page[] = [];
  const tail: Page[] = [];
  units.forEach((unit, index) => {
    if (kinds.get(unit.id) !== 'double') {
      pages.push(filePage(unit, 'full'));
    } else if (index === 0 && config.wraparoundCover) {
      pages.push(filePage(unit, secondHalf));
      tail.push(filePage(unit, firstHalf));
    } else {
      pages.push(filePage(unit, firstHalf), filePage(unit, secondHalf));
    }
  });
  return [...pages, ...tail];
}

function buildFromPrinterSides(units: readonly SourceUnit[], config: MagazineConfig): Page[] {
  const total = paddedPageCount(units.length * 2);
  const sides = printerSideSequence(computeImposition(total, config));

  const slots = new Array<Page | undefined>(total).fill(undefined);
  units.forEach((unit, index) => {
    const side = sides[index];
    if (!side) return;
    slots[side.left - 1] = filePage(unit, 'left');
    slots[side.right - 1] = filePage(unit, 'right');
  });

  let serial = 0;
  return slots.map((page) => {
    if (page) return page;
    serial += 1;
    return autoBlank(serial);
  });
}

export function buildPages(units: SourceUnit[], config: MagazineConfig): Page[] {
  const ordered = sortUnitsByOrder(units);
  if (ordered.length === 0) return [];
  if (config.inputMode === 'pages') return ordered.map((unit) => filePage(unit, 'full'));
  return config.spreadKind === 'printer'
    ? buildFromPrinterSides(ordered, config)
    : buildFromReaderSpreads(ordered, config);
}

export function applyPadding(pages: Page[], config: MagazineConfig): Page[] {
  const supplied = pages.length;
  const declared = config.declaredPageCount;
  const wanted = declared !== null && Number.isFinite(declared) ? Math.max(supplied, Math.floor(declared)) : supplied;
  const missing = paddedPageCount(wanted) - supplied;
  if (missing <= 0) return [...pages];

  const firstSerial = nextAutoBlankSerial(pages);
  const blanks = Array.from({ length: missing }, (_, index) => autoBlank(firstSerial + index));

  const backCover = pages[supplied - 1];
  if (config.blankPlacement === 'before-back-cover' && supplied >= 2 && backCover) {
    return [...pages.slice(0, -1), ...blanks, backCover];
  }
  return [...pages, ...blanks];
}

function randomUuid(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10, 16)]
    .map((group) => group.join(''))
    .join('-');
}

export function createManualBlank(): Page {
  return { id: `${MANUAL_BLANK_PREFIX}${randomUuid()}`, origin: 'manual-blank', unitId: null, half: 'full', detectedFolio: null };
}
