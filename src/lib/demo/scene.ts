import type { ReadingDirection } from '@/lib/types';
import { CREAM, INK, PAPER } from './art';
import { ISSUE_NUMBER, MAGAZINE_NAME, SAMPLE_MARK } from './content';
import { BLEED, luminance, PAGE_H, PAGE_W } from './kit';
import type { Box, Font, Frame, Pen } from './kit';
import type { MagazinePlan, SpreadSlot } from './plan';

export const SPINE = PAGE_W;

export interface Scene {
  pen: Pen;
  plan: MagazinePlan;
  total: number;
  dir: ReadingDirection;
  slot: SpreadSlot;
  index: number;
  left: Frame | null;
  right: Frame | null;
  first: Frame | null;
  second: Frame | null;
}

export function sideOf(pageNumber: number, dir: ReadingDirection): 'left' | 'right' {
  const even = pageNumber % 2 === 0;
  return even === (dir === 'ltr') ? 'left' : 'right';
}

export function frameOf(pageNumber: number, dir: ReadingDirection): Frame {
  const side = sideOf(pageNumber, dir);
  return { n: pageNumber, side, x: side === 'left' ? 0 : SPINE };
}

export function framesOf(index: number, total: number, dir: ReadingDirection): Pick<Scene, 'left' | 'right' | 'first' | 'second'> {
  const pages = [2 * index, 2 * index + 1].filter((n) => n >= 1 && n <= total);
  const frames = pages.map((n) => frameOf(n, dir));
  return {
    left: frames.find((f) => f.side === 'left') ?? null,
    right: frames.find((f) => f.side === 'right') ?? null,
    first: frames[0] ?? null,
    second: frames[1] ?? null,
  };
}

export function trimBox(frame: Frame): Box {
  return { x: frame.x, y: 0, w: PAGE_W, h: PAGE_H };
}

export function hasNeighbour(scene: Scene, frame: Frame): boolean {
  return frame.side === 'left' ? scene.right !== null : scene.left !== null;
}

export function bleedArea(scene: Scene, frame: Frame): Box {
  const spineBleed = hasNeighbour(scene, frame) ? 0 : BLEED;
  const x = frame.side === 'left' ? frame.x - BLEED : frame.x - spineBleed;
  return { x, y: -BLEED, w: PAGE_W + BLEED + spineBleed, h: PAGE_H + 2 * BLEED };
}

export function fillPage(scene: Scene, frame: Frame, color: string): void {
  scene.pen.box(bleedArea(scene, frame), color);
}

export function textOn(bg: string, dark = INK, light = PAPER): string {
  return luminance(bg) > 0.55 ? dark : light;
}

export function spreadBleed(): Box {
  return { x: -BLEED, y: -BLEED, w: 2 * PAGE_W + 2 * BLEED, h: PAGE_H + 2 * BLEED };
}

const FOLIO_FONT: Font = { family: 'sans', size: 9, weight: 800 };
const FOLIO_NAME: Font = { family: 'sans', size: 6.5, weight: 600, tracking: 0.08 };
const FOLIO_MARK: Font = { family: 'sans', size: 5.5, weight: 700, tracking: 0.18 };

export const FOLIO_Y = PAGE_H - 11;

export function folio(scene: Scene, frame: Frame, bg: string = PAPER): void {
  const { pen } = scene;
  const color = textOn(bg);
  const soft = luminance(bg) > 0.55 ? '#6F6A60' : CREAM;
  const number = String(frame.n);
  const name = `${MAGAZINE_NAME.toUpperCase()} · Nº ${ISSUE_NUMBER}`;
  const gap = 3;
  const numberW = pen.measure(number, FOLIO_FONT);
  const nameW = pen.measure(name, FOLIO_NAME);
  if (frame.side === 'right') {
    const right = frame.x + PAGE_W - 15;
    pen.text(number, right, FOLIO_Y, FOLIO_FONT, color, 'right');
    pen.text(name, right - numberW - gap, FOLIO_Y, FOLIO_NAME, soft, 'right');
    pen.text(SAMPLE_MARK, right - numberW - gap - nameW - gap, FOLIO_Y, FOLIO_MARK, color, 'right');
  } else {
    const left = frame.x + 15;
    pen.text(number, left, FOLIO_Y, FOLIO_FONT, color);
    pen.text(name, left + numberW + gap, FOLIO_Y, FOLIO_NAME, soft);
    pen.text(SAMPLE_MARK, left + numberW + gap + nameW + gap, FOLIO_Y, FOLIO_MARK, color);
  }
}
