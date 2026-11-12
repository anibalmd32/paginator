import { coverArt, CREAM, drawArt, GREY, INK, PAPER, PALETTES, paletteAt, seeded } from './art';
import { BODY, caption, columnXs, headline, kicker, standfirst } from './blocks';
import {
  AD_MILL,
  AD_WORKSHOP,
  COLOPHON_NOTICE,
  COLOPHON_TEXT,
  COVER_LINES,
  CREDITS,
  GLOSSARY,
  ISSUE_DATE,
  ISSUE_NUMBER,
  ISSUE_TAGLINE,
  MAGAZINE_NAME,
} from './content';
import { BLEED, contentBox, MM_PER_PT, PAGE_H, PAGE_W } from './kit';
import type { Font, Frame } from './kit';
import { GLOSSARY_TITLE, INFOGRAPHIC_TITLE, printerSides } from './plan';
import type { TocEntry } from './plan';
import { bleedArea, fillPage, folio, SPINE } from './scene';
import type { Scene } from './scene';

const BOTTOM = PAGE_H - 25;
const DISPLAY: Font = { family: 'sans', size: 60, weight: 900, tracking: -0.02 };
const LABEL: Font = { family: 'sans', size: 7.5, weight: 700, tracking: 0.12 };
const SMALL_SANS: Font = { family: 'sans', size: 8.5, weight: 500 };

export function drawCover(scene: Scene): void {
  const frame = scene.first;
  if (!frame) return;
  const { pen } = scene;
  const p = paletteAt(0);
  fillPage(scene, frame, p.bg);
  const area = bleedArea(scene, frame);
  const spine = frame.side === 'right' ? frame.x : frame.x + PAGE_W;
  coverArt(pen, { x: area.x, y: 152, w: area.w, h: PAGE_H + BLEED - 152 }, spine, frame.side === 'right' ? 1 : -1);

  const left = frame.x + 15;
  const width = PAGE_W - 30;
  pen.text(`Nº ${ISSUE_NUMBER}`, left, 15, LABEL, p.on);
  pen.text(ISSUE_DATE.toUpperCase(), left + width, 15, LABEL, p.on, 'right');
  pen.rect(left, 17.5, width, 0.4, p.on);
  const mast = pen.fit(MAGAZINE_NAME, { family: 'sans', size: 260, weight: 900, tracking: -0.045 }, width + 2, 1, 120);
  const mastBase = 18 + mast.size * MM_PER_PT * 0.74;
  pen.text(MAGAZINE_NAME, left - 1, mastBase, mast, p.on);
  pen.text(ISSUE_TAGLINE.toUpperCase(), left, mastBase + 8, { ...LABEL, size: 9, tracking: 0.3 }, p.on);

  const [main, ...rest] = COVER_LINES;
  const linesTop = mastBase + 18;
  if (main) {
    const mainW = width * 0.58;
    const mainX = frame.side === 'right' ? left : left + width - mainW;
    pen.rect(mainX, linesTop, 10, 1.4, p.extra);
    let y = headline(pen, main.title, mainX, linesTop + 4, mainW, { family: 'sans', size: 28, weight: 850, tracking: -0.01 }, p.on, { maxLines: 2, maxHeight: 22 });
    y = pen.block(main.note, mainX, y + 2, mainW, { family: 'serif', size: 11, italic: true }, p.on, { maxHeight: 12 });
  }
  const sideW = width * 0.34;
  const sideX = frame.side === 'right' ? left + width - sideW : left;
  let y = linesTop;
  for (const line of rest) {
    y = pen.block(line.title, sideX, y, sideW, { family: 'sans', size: 12, weight: 800 }, p.on, { factor: 1.1, maxHeight: 12 });
    y = pen.block(line.note, sideX, y + 0.5, sideW, { family: 'serif', size: 9, italic: true }, p.on, { maxHeight: 9 }) + 4;
  }
  barcode(scene, frame);
}

function barcode(scene: Scene, frame: Frame): void {
  const { pen } = scene;
  const w = 34;
  const h = 20;
  const x = frame.side === 'right' ? frame.x + PAGE_W - 15 - w : frame.x + 15;
  const y = PAGE_H - 12 - h;
  pen.rect(x, y, w, h, PAPER);
  const random = seeded(12);
  let bx = x + 3;
  while (bx < x + w - 4) {
    const bw = 0.25 + Math.floor(random() * 3) * 0.3;
    pen.rect(bx, y + 2.5, bw, h - 9, INK);
    bx += bw + 0.3 + Math.floor(random() * 3) * 0.3;
  }
  pen.text('EJEMPLAR DE MUESTRA', x + w / 2, y + h - 2.5, { family: 'sans', size: 5.2, weight: 700, tracking: 0.08 }, INK, 'center');
}

export function drawFront(scene: Scene): void {
  const { first: ad, second: toc } = scene;
  if (ad) workshopAd(scene, ad);
  if (toc) contents(scene, toc);
}

function workshopAd(scene: Scene, frame: Frame): void {
  const { pen } = scene;
  const p = paletteAt(1);
  fillPage(scene, frame, p.bg);
  const box = contentBox(frame);
  kicker(pen, AD_WORKSHOP.name, box.x, 20, p.accent);
  let y = headline(pen, AD_WORKSHOP.claim, box.x, 30, box.w * 0.94, { ...DISPLAY, size: 40 }, p.on, { maxLines: 4, maxHeight: 64 });
  y = standfirst(pen, AD_WORKSHOP.body, box.x, y + 6, box.w * 0.8, p.on, 11, 26);
  const area = bleedArea(scene, frame);
  drawArt(pen, 'fold', { x: area.x, y: 122, w: area.w, h: 80 }, paletteAt(2), 1);
  let row = 212;
  for (const [number, name, hours] of AD_WORKSHOP.courses) {
    pen.rect(box.x, row, box.w, 0.4, p.on);
    pen.text(number, box.x, row + 7, { family: 'sans', size: 11, weight: 800 }, p.accent);
    pen.text(name, box.x + 14, row + 7, { family: 'sans', size: 11, weight: 700 }, p.on);
    pen.text(hours, box.x + box.w, row + 7, { family: 'serif', size: 10, italic: true }, p.on, 'right');
    row += 10;
  }
  pen.rect(box.x, row, box.w, 0.4, p.on);
  pen.text(AD_WORKSHOP.footer.toUpperCase(), box.x, BOTTOM + 2, { ...LABEL, size: 6 }, p.soft);
  folio(scene, frame, p.bg);
}

function contents(scene: Scene, frame: Frame): void {
  const { pen, plan } = scene;
  fillPage(scene, frame, PAPER);
  const box = contentBox(frame);
  const mast = { ...DISPLAY, size: 58 };
  pen.text('Sumario', box.x - 0.6, 17 + 58 * MM_PER_PT * 0.74, mast, INK);
  pen.text(`${MAGAZINE_NAME.toUpperCase()} Nº ${ISSUE_NUMBER}`, box.x + box.w, 21, LABEL, INK, 'right');
  pen.text(ISSUE_DATE, box.x + box.w, 26, { family: 'serif', size: 9, italic: true }, GREY, 'right');
  const top = 17 + 58 * MM_PER_PT * 0.74 + 7;
  pen.rect(box.x, top, box.w, 1.2, INK);

  const entries = plan.toc;
  const available = BOTTOM - top - 6;
  const colorOf = (entry: TocEntry): string => {
    const slot = plan.spreads[Math.floor(entry.page / 2)];
    const palette = slot && slot.kind === 'article' ? paletteAt(slot.palette) : PALETTES[3];
    return palette ? (palette.bg === '#F0B429' || palette.bg === '#F3B4C0' ? palette.accent : palette.bg) : INK;
  };
  if (entries.length * 18 <= available) {
    let y = top + 6;
    for (const entry of entries) {
      pen.text(String(entry.page), box.x, y + 9, { family: 'sans', size: 24, weight: 850, tracking: -0.02 }, colorOf(entry));
      const tx = box.x + 24;
      const tw = box.w - 24;
      pen.text(entry.kicker.toUpperCase(), tx, y + 3, { ...LABEL, size: 6.5 }, GREY);
      const title = pen.fit(entry.title, { family: 'sans', size: 15, weight: 750 }, tw, 1, 10);
      pen.text(entry.title, tx, y + 9.5, title, INK);
      if (entry.author) pen.text(entry.author, tx, y + 14, { family: 'serif', size: 8.5, italic: true }, GREY);
      y += 18;
      pen.rect(tx, y - 1.6, tw, 0.25, CREAM);
    }
    if (BOTTOM - y > 70) {
      const artTop = y + 8;
      drawArt(pen, 'dots', { x: box.x, y: artTop, w: box.w, h: BOTTOM - 8 - artTop }, paletteAt(1), 1);
      caption(pen, 'Cuatro tintas, un papel y un pliego: de eso trata este número.', box.x, BOTTOM - 5, box.w, GREY, 6);
    }
  } else {
    const cols = columnXs(box.x, box.w, 2, 8);
    const perColumn = Math.ceil(entries.length / 2);
    const rowH = Math.min(14, available / perColumn);
    entries.forEach((entry, index) => {
      const column = Math.floor(index / perColumn);
      const x = cols.xs[column] ?? box.x;
      const y = top + 6 + (index % perColumn) * rowH;
      pen.text(String(entry.page), x, y + 5, { family: 'sans', size: 13, weight: 850 }, colorOf(entry));
      const tx = x + 12;
      const tw = cols.width - 12;
      const title = pen.fit(entry.title, { family: 'sans', size: 10.5, weight: 750 }, tw, 1, 7);
      pen.text(entry.title, tx, y + 5, title, INK);
      const sub = entry.author ? `${entry.kicker} · ${entry.author}` : entry.kicker;
      pen.text(sub, tx, y + 9, { family: 'serif', size: 7.5, italic: true }, GREY);
    });
  }
  folio(scene, frame);
}

export function drawInfographic(scene: Scene): void {
  const { pen, first: a, second: b, total, dir } = scene;
  const p = paletteAt(4);
  for (const frame of [a, b]) if (frame) fillPage(scene, frame, CREAM);
  const sheets = total / 4;
  const sides = printerSides(total, dir);

  if (a) {
    const box = contentBox(a);
    let y = kicker(pen, 'Infografía', box.x, 20, p.accent);
    headline(pen, INFOGRAPHIC_TITLE, box.x, y + 2, box.w, { ...DISPLAY, size: 40 }, INK, { maxLines: 2, maxHeight: 32 });
    folio(scene, a, CREAM);
  }
  if (b) {
    const box = contentBox(b);
    const text =
      `Este ejemplar de ${total} páginas sale de ${sheets} pliegos grapados a caballo. Cada uno lleva cuatro páginas: ` +
      `dos en la cara, que queda por fuera, y dos en el retiro. Las dos páginas de una misma cara suman siempre ${total + 1}.`;
    pen.block(text, box.x, 22, box.w, { ...BODY, size: 10.5 }, INK, { factor: 1.4, maxHeight: 40 });
    folio(scene, b, CREAM);
  }

  const baseY = 182;
  const step = Math.min(11, 96 / sheets);
  const label: Font = { family: 'sans', size: sheets > 10 ? 5.6 : 7, weight: 700 };
  const colors = [p.accent, p.extra, '#1D5E4B', '#F0B429'];
  for (let i = 0; i < sheets; i++) {
    const rx = 186 - i * step;
    const ry = 112 - i * step * 0.55;
    const color = colors[i % colors.length] ?? INK;
    pen.halfEllipse(SPINE, baseY, rx, ry, color, i === 0 ? 1.6 : 1.1);
    const side = sides[2 * i];
    const back = sides[2 * i + 1];
    if (!side || !back) continue;
    const leftPages = `${side.left}·${back.left}`;
    const rightPages = `${back.right}·${side.right}`;
    const row = i % 2 === 0 ? 0 : 3.4;
    pen.text(leftPages, SPINE - rx, baseY + 5 + row, label, INK, 'center');
    pen.text(rightPages, SPINE + rx, baseY + 5 + row, label, INK, 'center');
  }
  pen.line(SPINE, baseY - 116, SPINE, baseY + 1, INK, 0.3, [1.2, 1]);
  const big: Font = { family: 'sans', size: 46, weight: 900, tracking: -0.03 };
  const unit: Font = { family: 'sans', size: 8, weight: 700, tracking: 0.16 };
  pen.text(String(total), SPINE - 8, baseY - 22, big, p.accent, 'right');
  pen.text('PÁGINAS', SPINE - 8, baseY - 15, unit, INK, 'right');
  pen.text(String(sheets), SPINE + 8, baseY - 22, big, p.extra);
  pen.text(sheets === 1 ? 'PLIEGO' : 'PLIEGOS', SPINE + 8, baseY - 15, unit, INK);
  pen.text('LOMO · GRAPA', SPINE + 2, baseY - 117, { ...LABEL, size: 6 }, INK);

  const cardW = 40;
  const cardH = 24;
  const top = 196;
  sides.forEach((side, index) => {
    if (side.face !== 'front') return;
    const sheet = side.sheet;
    const back = sides[index + 1];
    if (!back) return;
    const onFirst = sheet < Math.ceil(sheets / 2);
    const frame = onFirst ? a : b;
    if (!frame) return;
    const box = contentBox(frame);
    const k = onFirst ? sheet : sheet - Math.ceil(sheets / 2);
    const perRow = 4;
    const x = box.x + (k % perRow) * (cardW + (box.w - perRow * cardW) / (perRow - 1));
    const y = top + Math.floor(k / perRow) * (cardH + 4);
    pen.text(`PLIEGO ${sheet + 1}`, x, y + 3, { ...LABEL, size: 6 }, INK);
    const cell = (cx: number, n: number, fill: string): void => {
      pen.rect(cx, y + 5, 8.6, 12, fill);
      pen.text(String(n), cx + 4.3, y + 13, { family: 'sans', size: 7.5, weight: 800 }, fill === PAPER ? INK : PAPER, 'center');
    };
    cell(x, side.left, PAPER);
    cell(x + 8.8, side.right, PAPER);
    cell(x + 21, back.left, p.accent);
    cell(x + 29.8, back.right, p.accent);
    pen.text('cara', x + 8.7, y + 21, { family: 'serif', size: 6.5, italic: true }, GREY, 'center');
    pen.text('retiro', x + 29.9, y + 21, { family: 'serif', size: 6.5, italic: true }, GREY, 'center');
  });
}

export function drawClosing(scene: Scene): void {
  const { first: glossary, second: colophon } = scene;
  if (glossary) glossaryPage(scene, glossary);
  if (colophon) colophonPage(scene, colophon);
}

function glossaryPage(scene: Scene, frame: Frame): void {
  const { pen } = scene;
  fillPage(scene, frame, PAPER);
  const box = contentBox(frame);
  const p = paletteAt(2);
  let y = kicker(pen, 'Vocabulario', box.x, 20, p.accent);
  y = headline(pen, GLOSSARY_TITLE, box.x, y + 2, box.w, { ...DISPLAY, size: 44 }, INK, { maxLines: 2, maxHeight: 34 });
  pen.rect(box.x, y + 4, box.w, 1.2, INK);
  const cols = columnXs(box.x, box.w, 2, 8);
  const half = Math.ceil(GLOSSARY.length / 2);
  const top = y + 10;
  let bottom = top;
  GLOSSARY.forEach(([term, definition], index) => {
    const column = index < half ? 0 : 1;
    const x = cols.xs[column] ?? box.x;
    if (index === half) bottom = Math.max(bottom, y);
    if (index === 0 || index === half) y = top;
    pen.text(term, x, y + 4, { family: 'sans', size: 10, weight: 800 }, INK);
    y = pen.block(definition, x, y + 6, cols.width, { ...BODY, size: 9 }, INK, { factor: 1.38 }) + 5;
  });
  bottom = Math.max(bottom, y);
  const artTop = Math.max(bottom + 4, 176);
  drawArt(pen, 'staple', { x: box.x, y: artTop, w: box.w, h: BOTTOM - 10 - artTop }, p, 0);
  caption(pen, 'Maqueta de una revista grapada: cada pliego cabalga sobre el siguiente.', box.x, BOTTOM - 7, box.w, GREY, 6);
  folio(scene, frame);
}

function colophonPage(scene: Scene, frame: Frame): void {
  const { pen } = scene;
  fillPage(scene, frame, INK);
  const box = contentBox(frame);
  const accent = paletteAt(0).extra;
  let y = kicker(pen, `${MAGAZINE_NAME} · Nº ${ISSUE_NUMBER}`, box.x, 20, accent);
  y = headline(pen, 'Colofón', box.x, y + 2, box.w, { ...DISPLAY, size: 48 }, PAPER, { maxLines: 1, maxHeight: 20 });
  y += 8;
  for (const [role, names] of CREDITS) {
    pen.rect(box.x, y, box.w, 0.25, GREY);
    pen.text(role.toUpperCase(), box.x, y + 6, { ...LABEL, size: 6.5 }, CREAM);
    y = pen.block(names, box.x + 52, y + 2.2, box.w - 52, { family: 'serif', size: 11 }, PAPER, { factor: 1.3 }) + 3;
  }
  pen.rect(box.x, y, box.w, 0.25, GREY);
  y = pen.block(COLOPHON_TEXT, box.x, y + 10, box.w * 0.82, { family: 'serif', size: 11.5, italic: true }, PAPER, { factor: 1.42 });
  const noticeTop = Math.max(y + 12, BOTTOM - 48);
  const noticeH = BOTTOM - noticeTop;
  pen.strokeRect(box.x, noticeTop, box.w, noticeH, accent, 0.5);
  pen.text('EJEMPLO', box.x + 6, noticeTop + 9, { ...LABEL, size: 8, tracking: 0.3 }, accent);
  pen.block(COLOPHON_NOTICE, box.x + 6, noticeTop + 13, box.w - 12, SMALL_SANS, CREAM, { factor: 1.4, maxHeight: noticeH - 15 });
  folio(scene, frame, INK);
}

export function drawBack(scene: Scene): void {
  const frame = scene.first;
  if (!frame) return;
  const { pen } = scene;
  const p = paletteAt(2);
  fillPage(scene, frame, p.bg);
  const area = bleedArea(scene, frame);
  drawArt(pen, 'stack', { x: area.x, y: 150, w: area.w, h: PAGE_H + BLEED - 150 }, paletteAt(3), 0);
  const box = contentBox(frame);
  kicker(pen, AD_MILL.name, box.x, 20, INK);
  let y = headline(pen, AD_MILL.claim, box.x, 30, box.w, { ...DISPLAY, size: 72 }, INK, { maxLines: 3, maxHeight: 70 });
  y = standfirst(pen, AD_MILL.body, box.x, y + 6, box.w * 0.78, INK, 11.5, 24);
  let x = box.x;
  const chipColors = [PAPER, paletteAt(0).bg, paletteAt(1).bg];
  AD_MILL.ranges.forEach((range, index) => {
    const font: Font = { family: 'sans', size: 9, weight: 750 };
    const w = pen.measure(range, font) + 12;
    pen.rect(x, y + 6, 4, 4, chipColors[index] ?? PAPER);
    pen.text(range, x + 6, y + 9.6, font, INK);
    x += w + 4;
  });
  const footerFont: Font = { family: 'sans', size: 6.2, weight: 700, tracking: 0.1 };
  const footer = AD_MILL.footer.toUpperCase();
  const fw = pen.measure(footer, footerFont) + 8;
  const fx = frame.side === 'right' ? box.x + box.w - fw : box.x;
  pen.rect(fx, PAGE_H - 22, fw, 7, PAPER);
  pen.text(footer, fx + 4, PAGE_H - 17.4, footerFont, INK);
}
