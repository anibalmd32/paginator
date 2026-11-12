import type { FolioHit } from '@/lib/types';

export interface FolioTextItem {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
}

export interface FolioMarkedContent {
  type: string;
}

export interface FolioViewport {
  width: number;
  height: number;
  transform: readonly number[];
}

export const FOLIO_TOP_BAND = 0.12;
export const FOLIO_BOTTOM_BAND = 0.14;
export const FOLIO_MAX_HEIGHT = 0.035;
export const MAX_FOLIO_HITS = 6;

const ORNAMENT = String.raw`[-–—−·•|/\\.:()\[\]<>«»‹›*~]{0,2}`;
const FOLIO_PATTERN = new RegExp(`^${ORNAMENT}(\\d{1,4})${ORNAMENT}$`);

export function parseFolioText(text: string): number | null {
  const compact = text.replace(/\s+/g, '');
  const match = FOLIO_PATTERN.exec(compact);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return value >= 1 ? value : null;
}

function isTextItem(item: FolioTextItem | FolioMarkedContent): item is FolioTextItem {
  return 'str' in item && typeof item.str === 'string' && Array.isArray(item.transform) && item.transform.length >= 6;
}

interface Candidate extends FolioHit {
  band: 0 | 1;
  edgeDistance: number;
}

export function extractFolioHits(
  items: ReadonlyArray<FolioTextItem | FolioMarkedContent>,
  viewport: FolioViewport,
): FolioHit[] {
  const [va = 1, vb = 0, vc = 0, vd = 1, ve = 0, vf = 0] = viewport.transform;
  const pageW = viewport.width;
  const pageH = viewport.height;
  if (!(pageW > 0) || !(pageH > 0)) return [];
  const viewportScale = Math.hypot(va, vb);

  const candidates: Candidate[] = [];
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const value = parseFolioText(item.str);
    if (value === null) continue;

    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = item.transform;
    const m0 = va * a + vc * b;
    const m1 = vb * a + vd * b;
    const m2 = va * c + vc * d;
    const m3 = vb * c + vd * d;
    const m4 = va * e + vc * f + ve;
    const m5 = vb * e + vd * f + vf;

    const fontHeight = Math.hypot(m2, m3) || item.height * viewportScale;
    if (!(fontHeight > 0) || fontHeight / pageH >= FOLIO_MAX_HEIGHT) continue;

    const baseLength = Math.hypot(m0, m1);
    const ux = baseLength > 0 ? m0 / baseLength : 1;
    const uy = baseLength > 0 ? m1 / baseLength : 0;
    const upLength = Math.hypot(m2, m3);
    const upX = upLength > 0 ? m2 / upLength : 0;
    const upY = upLength > 0 ? m3 / upLength : -1;
    const advance = Math.max(0, item.width) * viewportScale;
    const x = (m4 + (ux * advance) / 2 + upX * fontHeight * 0.35) / pageW;
    const y = (m5 + (uy * advance) / 2 + upY * fontHeight * 0.35) / pageH;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) continue;

    let band: 0 | 1;
    let edgeDistance: number;
    if (y >= 1 - FOLIO_BOTTOM_BAND) {
      band = 0;
      edgeDistance = 1 - y;
    } else if (y <= FOLIO_TOP_BAND) {
      band = 1;
      edgeDistance = y;
    } else {
      continue;
    }

    const duplicate = candidates.some(
      (other) => other.value === value && Math.abs(other.x - x) < 0.01 && Math.abs(other.y - y) < 0.01,
    );
    if (!duplicate) candidates.push({ value, x, y, band, edgeDistance });
  }

  candidates.sort((p, q) => p.band - q.band || p.edgeDistance - q.edgeDistance || p.x - q.x || p.value - q.value);

  const perHalf = MAX_FOLIO_HITS / 2;
  const picked = new Set<Candidate>();
  const taken = [0, 0];
  for (const candidate of candidates) {
    const half = candidate.x < 0.5 ? 0 : 1;
    if ((taken[half] ?? 0) < perHalf) {
      picked.add(candidate);
      taken[half] = (taken[half] ?? 0) + 1;
    }
  }
  for (const candidate of candidates) {
    if (picked.size >= MAX_FOLIO_HITS) break;
    picked.add(candidate);
  }

  return candidates.filter((candidate) => picked.has(candidate)).map(({ value, x, y }) => ({ value, x, y }));
}
