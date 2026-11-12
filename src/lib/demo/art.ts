import type { ArtKind } from './content';
import type { Box, Pen } from './kit';

export const INK = '#1B1A17';
export const PAPER = '#FFFDF7';
export const CREAM = '#F3EBDD';
export const GREY = '#6F6A60';

export interface Palette {
  bg: string;
  on: string;
  accent: string;
  soft: string;
  extra: string;
}

export const PALETTES: readonly Palette[] = [
  { bg: '#E5432B', on: '#FFF6EA', accent: '#1E2A5A', soft: '#F8D2C4', extra: '#F2B632' },
  { bg: '#2346C7', on: '#F6F2E8', accent: '#F2B632', soft: '#CDD8F6', extra: '#F0806C' },
  { bg: '#F0B429', on: '#1B1A17', accent: '#1D5E4B', soft: '#FAE7B0', extra: '#E5432B' },
  { bg: '#1D5E4B', on: '#F5F0E1', accent: '#F4A294', soft: '#D2E5D8', extra: '#F0B429' },
  { bg: '#F3B4C0', on: '#1B1A17', accent: '#2346C7', soft: '#FCE4E8', extra: '#E5432B' },
];

export function paletteAt(index: number): Palette {
  const palette = PALETTES[((index % PALETTES.length) + PALETTES.length) % PALETTES.length];
  if (!palette) throw new Error('Paleta inexistente');
  return palette;
}

export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], index: number, fallback: T): T {
  return items[((index % items.length) + items.length) % items.length] ?? fallback;
}

export function drawArt(pen: Pen, kind: ArtKind, box: Box, palette: Palette, variant = 0): void {
  if (box.w <= 0 || box.h <= 0) return;
  pen.clip(box.x, box.y, box.w, box.h, () => {
    switch (kind) {
      case 'fold':
        return foldArt(pen, box, palette, variant);
      case 'stack':
        return stackArt(pen, box, palette, variant);
      case 'staple':
        return stapleArt(pen, box, palette, variant);
      case 'bleed':
        return bleedArt(pen, box, palette, variant);
      case 'dots':
        return dotsArt(pen, box, palette, variant);
      case 'fibre':
        return fibreArt(pen, box, palette, variant);
      case 'blade':
        return bladeArt(pen, box, palette, variant);
      case 'street':
        return streetArt(pen, box, palette);
    }
  });
}

function foldArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  const m = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  pen.rect(x, y, w, h, variant % 2 === 0 ? p.soft : CREAM);
  pen.circle(cx, cy - m * 0.02, m * 0.4, p.extra);
  if (w > h * 1.5) {
    pen.rect(x, y + h * 0.66, w, h * 0.34, p.bg);
    pen.circle(x + w * 0.14, y + h * 0.66, m * 0.2, p.accent);
    pen.circle(x + w * 0.86, y + h * 0.66, m * 0.2, PAPER);
  }
  const sheet = (scale: number, lift: number, left: string, right: string): void => {
    const a = m * 0.4 * scale;
    const b = m * 0.56 * scale;
    const k = m * 0.1 * scale;
    const top = cy - b / 2 - lift;
    pen.poly([cx, top + k, cx - a, top, cx - a, top + b, cx, top + b + k], left);
    pen.poly([cx, top + k, cx + a, top, cx + a, top + b, cx, top + b + k], right);
  };
  sheet(1.08, m * 0.07, p.accent, p.accent);
  sheet(1, m * 0.02, PAPER, CREAM);
  sheet(0.9, -m * 0.03, p.bg, p.bg);
  sheet(0.8, -m * 0.08, PAPER, CREAM);
  const a = m * 0.32;
  const top = cy - (m * 0.56 * 0.8) / 2 + m * 0.08;
  for (let i = 0; i < 5; i++) {
    const yy = top + m * 0.09 + i * m * 0.055;
    pen.poly([cx - a * 0.85, yy, cx - a * 0.15, yy + m * 0.014, cx - a * 0.15, yy + m * 0.03, cx - a * 0.85, yy + m * 0.016], p.soft);
  }
  pen.poly([cx + a * 0.15, top + m * 0.1, cx + a * 0.85, top + m * 0.082, cx + a * 0.85, top + m * 0.3, cx + a * 0.15, top + m * 0.318], p.extra);
  pen.line(cx, cy - m * 0.3, cx, cy + m * 0.36, INK, Math.max(0.25, m * 0.004), [m * 0.02, m * 0.014]);
}

function stackArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  const random = seeded(11 + variant * 7);
  pen.rect(x, y, w, h, p.bg);
  pen.circle(x + w * 0.78, y + h * 0.24, Math.min(w, h) * 0.16, p.extra);
  const colors = [PAPER, p.soft, p.accent, CREAM, p.extra, PAPER];
  const count = Math.max(5, Math.round(h / 13));
  const base = y + h;
  const slab = (h * 0.8) / count;
  for (let i = 0; i < count; i++) {
    const width = w * (0.5 + random() * 0.34);
    const left = x + (w - width) / 2 + (random() - 0.5) * w * 0.12;
    const top = base - (i + 1) * slab;
    const color = pick(colors, i + variant, PAPER);
    pen.rect(left, top, width, slab * 0.86, color);
    if (color === PAPER || color === CREAM) {
      const sheets = Math.max(2, Math.round(slab / 1.6));
      for (let s = 1; s < sheets; s++) {
        const yy = top + (slab * 0.86 * s) / sheets;
        pen.line(left, yy, left + width, yy, p.soft === color ? PAPER : '#D9CFBD', Math.max(0.12, slab * 0.012));
      }
    }
  }
}

function stapleArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  const cx = x + w / 2;
  pen.rect(x, y, w, h, variant % 2 === 0 ? p.soft : p.bg);
  const colors = [p.accent, PAPER, p.bg === pick([p.soft, p.bg], variant, p.soft) ? p.extra : p.bg, PAPER, p.extra, PAPER];
  const count = 6;
  const reach = Math.min(w * 0.46, h * 1.5);
  const top = y + h * 0.2;
  const bottom = y + h * 1.02;
  const thickness = Math.min(w, h) * 0.075;
  for (let i = 0; i < count; i++) {
    const offset = i * thickness * 1.25;
    const a = reach - i * reach * 0.11;
    const apex = top + offset;
    pen.poly(
      [cx, apex, cx + a, bottom, cx + a - thickness * 1.5, bottom, cx, apex + thickness, cx - a + thickness * 1.5, bottom, cx - a, bottom],
      pick(colors, i, PAPER),
    );
  }
  const s = thickness * 0.5;
  pen.poly([cx, top - s * 2.2, cx + s * 4, top + s * 1.2, cx + s * 3.2, top + s * 2.2, cx, top - s * 0.6, cx - s * 3.2, top + s * 2.2, cx - s * 4, top + s * 1.2], INK);
  pen.circle(cx, y + h * 0.1, thickness * 0.5, p.extra);
}

function bleedArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  pen.rect(x, y, w, h, variant % 2 === 0 ? p.bg : p.accent);
  const m = Math.min(w, h);
  const count = w > h * 1.6 ? 3 : 1;
  const pageH = m * 0.62;
  const pageW = pageH * 0.72;
  const gap = pageW * 1.75;
  const line = Math.max(0.25, m * 0.005);
  for (let i = 0; i < count; i++) {
    const cx = x + w / 2 + (i - (count - 1) / 2) * gap;
    const left = cx - pageW / 2;
    const top = y + h / 2 - pageH / 2;
    const b = pageH * 0.06;
    pen.rect(left, top, pageW, pageH, PAPER);
    const image = pick([p.extra, p.soft, p.accent], i + variant, p.extra);
    pen.rect(left - b, top - b, pageW * 0.7 + b, pageH * 0.5 + b, image === p.accent && variant % 2 === 1 ? p.extra : image);
    pen.circle(left + pageW * 0.3, top + pageH * 0.24, pageH * 0.13, PAPER);
    for (let r = 0; r < 4; r++) pen.rect(left + pageW * 0.12, top + pageH * (0.6 + r * 0.075), pageW * (r === 3 ? 0.4 : 0.76), pageH * 0.03, CREAM);
    pen.strokeRect(left - b, top - b, pageW + 2 * b, pageH + 2 * b, p.on, line, [m * 0.015, m * 0.012]);
    pen.strokeRect(left, top, pageW, pageH, INK, line);
    const g = b * 1.4;
    const len = b * 1.6;
    for (const [px, py, sx, sy] of [
      [left, top, -1, -1],
      [left + pageW, top, 1, -1],
      [left, top + pageH, -1, 1],
      [left + pageW, top + pageH, 1, 1],
    ] as const) {
      pen.line(px + sx * g, py, px + sx * (g + len), py, p.on, line);
      pen.line(px, py + sy * g, px, py + sy * (g + len), p.on, line);
    }
  }
}

function dotsArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  pen.rect(x, y, w, h, variant % 2 === 0 ? CREAM : p.soft);
  const m = Math.min(w, h);
  const step = Math.max(3.2, m / 16);
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const t = col / Math.max(1, cols - 1);
      const offset = row % 2 === 0 ? 0 : step / 2;
      pen.circle(x + col * step + offset, y + row * step, step * (0.08 + 0.34 * t), p.bg);
    }
  }
  const ctx = pen.ctx;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = m * 0.27;
  const before = ctx.globalCompositeOperation;
  pen.circle(cx, cy, r * 1.72, PAPER);
  ctx.globalCompositeOperation = 'multiply';
  pen.circle(cx, cy - r * 0.52, r, '#19A7E0');
  pen.circle(cx - r * 0.5, cy + r * 0.34, r, '#E8308A');
  pen.circle(cx + r * 0.5, cy + r * 0.34, r, '#FFDD1F');
  ctx.globalCompositeOperation = before;
  const patch = Math.max(4, m * 0.06);
  const strip = ['#19A7E0', '#E8308A', '#FFDD1F', INK, p.bg, p.accent, p.extra, PAPER];
  const left = cx - (strip.length * patch) / 2;
  strip.forEach((color, index) => pen.rect(left + index * patch, y + h - patch * 1.6, patch, patch, color));
}

function fibreArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  const random = seeded(29 + variant * 13);
  pen.rect(x, y, w, h, variant % 2 === 0 ? p.soft : CREAM);
  const m = Math.min(w, h);
  pen.rect(x, y + h * 0.58, w, h * 0.42, p.bg);
  const count = Math.round((w * h) / 90);
  const colors = [p.accent, PAPER, p.extra, p.bg, INK];
  for (let i = 0; i < count; i++) {
    const fx = x + random() * w;
    const fy = y + random() * h;
    const length = m * (0.04 + random() * 0.1);
    const slope = (random() - 0.5) * 0.16;
    const color = pick(colors, Math.floor(random() * 5), INK);
    pen.line(fx, fy, fx + length, fy + length * slope, color, Math.max(0.3, m * 0.006));
  }
  const cx = x + w / 2;
  const cy = y + h * 0.58;
  const aw = Math.min(w * 0.36, m * 0.9);
  const t = m * 0.07;
  pen.poly([cx - aw, cy - t, cx + aw * 0.55, cy - t, cx + aw * 0.55, cy - t * 2.6, cx + aw, cy, cx + aw * 0.55, cy + t * 2.6, cx + aw * 0.55, cy + t, cx - aw, cy + t], p.accent);
  pen.circle(cx - aw, cy, t * 1.9, p.extra);
}

function bladeArt(pen: Pen, { x, y, w, h }: Box, p: Palette, variant: number): void {
  pen.rect(x, y, w, h, variant % 2 === 0 ? p.bg : p.soft);
  const m = Math.min(w, h);
  const blockTop = y + h * 0.62;
  const blockLeft = x + w * 0.1;
  const blockW = w * 0.62;
  pen.rect(blockLeft, blockTop, blockW, h * 0.4, PAPER);
  const sheets = Math.max(6, Math.round((h * 0.38) / 2.2));
  for (let i = 1; i < sheets; i++) {
    const yy = blockTop + (h * 0.38 * i) / sheets;
    pen.line(blockLeft, yy, blockLeft + blockW, yy, '#D9CFBD', Math.max(0.15, m * 0.003));
  }
  const cut = blockLeft + blockW + m * 0.035;
  for (let i = 0; i < 5; i++) {
    pen.rotate(cut + m * 0.08, blockTop + i * m * 0.07, 0.12 + i * 0.09, () => {
      pen.rect(cut + i * m * 0.02, blockTop + i * m * 0.07, m * 0.11, m * 0.035, pick([p.extra, PAPER, p.accent], i, PAPER));
    });
  }
  pen.poly([x, y, x + w, y, x + w, y + h * 0.3, x, y + h * 0.5], p.accent);
  pen.poly([x, y + h * 0.5, x + w, y + h * 0.3, x + w, y + h * 0.34, x, y + h * 0.55], PAPER);
  for (let i = 0; i < 4; i++) pen.circle(x + w * (0.14 + i * 0.24), y + h * (0.2 - i * 0.035), m * 0.03, p.extra);
}

function streetArt(pen: Pen, { x, y, w, h }: Box, p: Palette): void {
  const random = seeded(5);
  const ground = y + h * 0.86;
  pen.rect(x, y, w, h, p.soft);
  pen.circle(x + w * 0.83, y + h * 0.2, h * 0.11, p.extra);
  const shopW = Math.min(w * 0.44, h * 1.5);
  const shopLeft = x + (w - shopW) / 2;
  const houseColors = [p.accent, '#F0B429', '#E5432B', '#2346C7', PAPER, '#F3B4C0'];
  const houses = (from: number, to: number, start: number): void => {
    let left = from;
    let index = start;
    while (left < to - 1) {
      const width = Math.min(to - left, h * (0.26 + random() * 0.2));
      const top = y + h * (0.16 + random() * 0.26);
      const color = pick(houseColors, index, PAPER);
      pen.rect(left, top, width + 0.2, ground - top, color);
      const cols = Math.max(1, Math.floor(width / (h * 0.13)));
      const cell = width / cols;
      for (let row = 0; top + h * 0.07 + row * h * 0.15 < ground - h * 0.14; row++) {
        for (let col = 0; col < cols; col++) {
          pen.rect(left + col * cell + cell * 0.28, top + h * 0.07 + row * h * 0.15, cell * 0.44, h * 0.085, color === PAPER ? p.bg : PAPER);
        }
      }
      left += width;
      index++;
    }
  };
  houses(x, shopLeft, 0);
  houses(shopLeft + shopW, x + w, 3);
  const shopTop = y + h * 0.1;
  pen.rect(shopLeft, shopTop, shopW, ground - shopTop, p.bg);
  for (let i = 0; i < 5; i++) pen.rect(shopLeft + shopW * (0.08 + i * 0.18), shopTop + h * 0.07, shopW * 0.12, h * 0.13, p.soft);
  const signTop = shopTop + h * 0.27;
  pen.rect(shopLeft + shopW * 0.04, signTop, shopW * 0.92, h * 0.085, PAPER);
  for (let i = 0; i < 9; i++) pen.rect(shopLeft + shopW * (0.2 + i * 0.07), signTop + h * 0.028, shopW * 0.045, h * 0.03, INK);
  const awningTop = signTop + h * 0.11;
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    const sw = shopW / stripes;
    pen.poly(
      [shopLeft + i * sw, awningTop, shopLeft + (i + 1) * sw, awningTop, shopLeft + (i + 1) * sw + sw * 0.25 * (i - stripes / 2 + 1) * 0.3, awningTop + h * 0.1, shopLeft + i * sw + sw * 0.25 * (i - stripes / 2) * 0.3, awningTop + h * 0.1],
      i % 2 === 0 ? p.extra : PAPER,
    );
  }
  const windowTop = awningTop + h * 0.13;
  const windowH = ground - windowTop - h * 0.05;
  const windowLeft = shopLeft + shopW * 0.07;
  const windowW = shopW * 0.6;
  pen.rect(windowLeft, windowTop, windowW, windowH, INK);
  pen.line(windowLeft, windowTop + windowH * 0.16, windowLeft + windowW, windowTop + windowH * 0.16, PAPER, Math.max(0.2, h * 0.003));
  const jobs = [PAPER, p.extra, '#F3B4C0', PAPER, '#F0B429', p.soft, PAPER];
  jobs.forEach((color, index) => {
    const jw = windowW / (jobs.length + 1);
    pen.rect(windowLeft + jw * (0.5 + index), windowTop + windowH * 0.16, jw * 0.72, windowH * (0.36 + (index % 3) * 0.1), color);
  });
  pen.rect(shopLeft + shopW * 0.74, windowTop, shopW * 0.19, ground - windowTop, p.accent);
  pen.circle(shopLeft + shopW * 0.77, windowTop + (ground - windowTop) * 0.55, h * 0.012, PAPER);
  pen.rect(x, ground, w, y + h - ground, INK);
  pen.rect(x, ground, w, h * 0.02, GREY);
}

export function coverArt(pen: Pen, box: Box, spine: number, dir: 1 | -1): void {
  const { x, y, w, h } = box;
  const p = paletteAt(0);
  pen.clip(x, y, w, h, () => {
    pen.rect(x, y, w, h, p.bg);
    const cy = y + h * 0.9;
    const rings = [
      [1.02, '#C8351F'],
      [0.9, p.extra],
      [0.78, p.accent],
      [0.66, '#F3B4C0'],
      [0.54, PAPER],
      [0.42, '#2346C7'],
      [0.3, p.extra],
      [0.18, p.bg],
    ] as const;
    for (const [scale, color] of rings) pen.circle(spine, cy, w * scale, color);
    const random = seeded(3);
    const colors = [PAPER, p.accent, CREAM, p.extra, PAPER, '#F3B4C0', PAPER];
    const slab = h * 0.031;
    for (let i = 0; i < 7; i++) {
      const length = w * (0.62 + random() * 0.3);
      const top = y + h - (i + 1) * slab;
      const far = spine + dir * (w + 4);
      const near = far - dir * length;
      pen.rect(Math.min(near, far), top, Math.abs(far - near), slab * 0.84, colors[i] ?? PAPER);
    }
  });
}
