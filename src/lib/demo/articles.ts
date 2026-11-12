import { drawArt, GREY, INK, PAPER, paletteAt } from './art';
import type { Palette } from './art';
import { byline, caption, columnXs, flow, flowHeight, headline, kicker, pullQuote, standfirst } from './blocks';
import { BLEED, contentBox, luminance, PAGE_H } from './kit';
import type { Font, Frame } from './kit';
import type { ArticleSlot } from './plan';
import { bleedArea, fillPage, folio, spreadBleed } from './scene';
import type { Scene } from './scene';

const GAP = 5;
const TITLE: Font = { family: 'sans', size: 54, weight: 850, tracking: -0.02 };
const RUNNING: Font = { family: 'sans', size: 6.5, weight: 700, tracking: 0.14 };
const BOTTOM = PAGE_H - 25;

function inkAccent(p: Palette): string {
  return luminance(p.bg) < 0.55 ? p.bg : p.accent;
}

function runningHead(scene: Scene, frame: Frame, slot: ArticleSlot, color: string): void {
  const box = contentBox(frame);
  const label = `${slot.kicker.toUpperCase()}  ·  ${slot.title.toUpperCase()}`;
  if (frame.side === 'left') scene.pen.text(label, box.x, 11, RUNNING, color);
  else scene.pen.text(label, box.x + box.w, 11, RUNNING, color, 'right');
}

export function drawArticle(scene: Scene, slot: ArticleSlot): void {
  switch (slot.template) {
    case 'opener':
      return opener(scene, slot);
    case 'band':
      return band(scene, slot);
    case 'gallery':
      return gallery(scene, slot);
    case 'panorama':
      return panorama(scene, slot);
  }
}

function opener(scene: Scene, slot: ArticleSlot): void {
  const { pen, first: a, second: b } = scene;
  const p = paletteAt(slot.palette);
  const art = slot.article.art;
  if (a) {
    fillPage(scene, a, p.bg);
    const area = bleedArea(scene, a);
    drawArt(pen, art, { x: area.x, y: -BLEED, w: area.w, h: 148 + BLEED }, p, slot.round);
    const box = contentBox(a);
    let y = kicker(pen, slot.kicker, box.x, 158, p.on);
    y = headline(pen, slot.title, box.x, y + 2, box.w, TITLE, p.on, { maxLines: 2, maxHeight: 44 });
    y = standfirst(pen, slot.standfirst, box.x, y + 5, box.w * 0.86, p.on, 12.5, 252 - (y + 5));
    byline(pen, slot.article.author, box.x, Math.max(y + 4, 256), box.w, p.on);
    folio(scene, a, p.bg);
  }
  if (b) {
    fillPage(scene, b, PAPER);
    const area = bleedArea(scene, b);
    const box = contentBox(b);
    const cols = columnXs(box.x, box.w, 3, GAP);
    const textHeight = flowHeight(pen, slot.paragraphs, 2, cols.width, 3);
    const artBottom = Math.min(170, Math.max(100, BOTTOM - textHeight - 14));
    drawArt(pen, art, { x: area.x, y: -BLEED, w: area.w, h: artBottom + BLEED }, paletteAt(slot.palette + 1), slot.round + 1);
    const top = artBottom + 12;
    const asideOuter = b.side === 'left';
    const textXs = asideOuter ? cols.xs.slice(1) : cols.xs.slice(0, 2);
    const asideX = (asideOuter ? cols.xs[0] : cols.xs[2]) ?? box.x;
    flow(pen, slot.paragraphs, textXs, top, cols.width, BOTTOM - top, INK, { dropCapLines: 3, dropCapColor: inkAccent(p) });
    pullQuote(pen, slot.article.quote, asideX, top, cols.width, inkAccent(p), { size: 15, maxHeight: 92 });
    caption(pen, slot.article.caption, asideX, BOTTOM - 17, cols.width, GREY, 17);
    folio(scene, b);
  }
}

function band(scene: Scene, slot: ArticleSlot): void {
  const { pen, first: a, second: b } = scene;
  const p = paletteAt(slot.palette);
  for (const frame of [a, b]) if (frame) fillPage(scene, frame, PAPER);
  const xs: number[] = [];
  let width = 0;
  for (const frame of [a, b]) {
    if (!frame) continue;
    const box = contentBox(frame);
    const cols = columnXs(box.x, box.w, 2, GAP);
    xs.push(...cols.xs);
    width = cols.width;
  }
  const textTop = Math.min(205, Math.max(172, BOTTOM - flowHeight(pen, slot.paragraphs, xs.length, width, 2) - 2));
  const bandTop = 96;
  const bandBottom = textTop - 14;
  const spread = spreadBleed();
  drawArt(pen, slot.article.art, { x: spread.x, y: bandTop, w: spread.w, h: bandBottom - bandTop }, p, slot.round);

  const accent = inkAccent(p);
  if (a) {
    const box = contentBox(a);
    let y = kicker(pen, slot.kicker, box.x, 20, accent);
    y = headline(pen, slot.title, box.x, y + 2, box.w, { ...TITLE, size: 50 }, INK, { maxLines: 2, maxHeight: 38 });
    standfirst(pen, slot.standfirst, box.x, y + 4, box.w * 0.94, INK, 11.5, bandTop - 5 - (y + 4));
    folio(scene, a);
  }
  if (b) {
    const box = contentBox(b);
    const quoteW = box.w * 0.72;
    const quoteX = b.side === 'right' ? box.x + box.w - quoteW : box.x;
    pullQuote(pen, slot.article.quote, quoteX, 22, quoteW, accent, { size: 19, maxHeight: 54 });
    byline(pen, slot.article.author, quoteX, 82, quoteW, GREY);
    caption(pen, slot.article.caption, box.x, bandBottom + 3, box.w, GREY, 8);
    folio(scene, b);
  }
  flow(pen, slot.paragraphs, xs, textTop, width, BOTTOM - textTop, INK, { dropCapLines: 2, dropCapColor: accent });
}

function gallery(scene: Scene, slot: ArticleSlot): void {
  const { pen, first: a, second: b } = scene;
  const p = paletteAt(slot.palette);
  if (a) {
    fillPage(scene, a, p.bg);
    const box = contentBox(a);
    let y = kicker(pen, slot.kicker, box.x, 20, p.on);
    y = headline(pen, slot.title, box.x, y + 3, box.w, { ...TITLE, size: 76, weight: 900 }, p.on, { maxLines: 3, maxHeight: 84 });
    y = standfirst(pen, slot.standfirst, box.x, y + 6, box.w * 0.82, p.on, 13, 50);
    const cols = columnXs(box.x, box.w, 2, GAP);
    const top = Math.max(y + 12, BOTTOM - flowHeight(pen, slot.paragraphs, 2, cols.width, 3) - 2);
    pen.rect(box.x, top - 6, box.w, 0.5, p.on);
    flow(pen, slot.paragraphs, cols.xs, top, cols.width, BOTTOM - top, p.on, { dropCapLines: 3, dropCapColor: p.extra });
    folio(scene, a, p.bg);
  }
  if (b) {
    fillPage(scene, b, PAPER);
    runningHead(scene, b, slot, GREY);
    const box = contentBox(b);
    const area = bleedArea(scene, b);
    const bigLeft = b.side === 'right' ? box.x : area.x;
    const bigRight = b.side === 'right' ? area.x + area.w : box.x + box.w;
    drawArt(pen, slot.article.art, { x: bigLeft, y: 17, w: bigRight - bigLeft, h: 128 }, paletteAt(slot.palette + 2), slot.round + 1);
    const half = (box.w - GAP) / 2;
    caption(pen, slot.article.caption, box.x, 149, box.w * 0.7, GREY, 10);
    const smallX = b.side === 'right' ? box.x : box.x + half + GAP;
    const quoteX = b.side === 'right' ? box.x + half + GAP : box.x;
    drawArt(pen, slot.article.art, { x: smallX, y: 166, w: half, h: BOTTOM - 166 }, p, slot.round + 2);
    pullQuote(pen, slot.article.quote, quoteX, 168, half, inkAccent(p), { size: 18, maxHeight: 62 });
    byline(pen, slot.article.author, quoteX, BOTTOM - 8, half, GREY);
    folio(scene, b);
  }
}

function panorama(scene: Scene, slot: ArticleSlot): void {
  const { pen, first: a, second: b } = scene;
  const p = paletteAt(slot.palette);
  const artBottom = 150;
  for (const frame of [a, b]) if (frame) fillPage(scene, frame, PAPER);
  const spread = spreadBleed();
  drawArt(pen, slot.article.art, { x: spread.x, y: spread.y, w: spread.w, h: artBottom - spread.y }, p, slot.round);
  const top = artBottom + 10;
  const accent = inkAccent(p);
  if (a) {
    const box = contentBox(a);
    const capW = 64;
    const capX = a.side === 'left' ? box.x : box.x + box.w - capW;
    pen.rect(capX, artBottom - 26, capW, 20, PAPER);
    caption(pen, slot.article.caption, capX + 3, artBottom - 23, capW - 6, INK, 15);
    let y = kicker(pen, slot.kicker, box.x, top, accent);
    y = headline(pen, slot.title, box.x, y + 2, box.w, { ...TITLE, size: 44 }, INK, { maxLines: 2, maxHeight: 34 });
    y = standfirst(pen, slot.standfirst, box.x, y + 4, box.w * 0.92, INK, 11.5, BOTTOM - 10 - (y + 4));
    byline(pen, slot.article.author, box.x, Math.max(y + 3, BOTTOM - 4), box.w, GREY);
    folio(scene, a);
  }
  if (b) {
    const box = contentBox(b);
    const cols = columnXs(box.x, box.w, 2, GAP);
    flow(pen, slot.paragraphs, cols.xs, top, cols.width, BOTTOM - top, INK, { dropCapLines: 3, dropCapColor: accent });
    folio(scene, b);
  }
}
