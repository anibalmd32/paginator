import type { ReadingDirection } from '@/lib/types';
import { drawArticle } from './articles';
import { drawBack, drawClosing, drawCover, drawFront, drawInfographic } from './fixed';
import { Pen, PAGE_H, PAGE_W } from './kit';
import type { Box, Ctx2D } from './kit';
import { planMagazine } from './plan';
import { framesOf } from './scene';
import type { Scene } from './scene';

export interface RenderTarget {
  ctx: Ctx2D;
  region: Box;
  dest: { x: number; y: number; w: number; h: number };
}

export function renderSpread(target: RenderTarget, spreadIndex: number, total: number, dir: ReadingDirection): string[] {
  const plan = planMagazine(total);
  const slot = plan.spreads[spreadIndex];
  if (!slot) throw new Error(`El pliego ${spreadIndex} no existe en un ejemplar de ${plan.total} páginas`);
  const { ctx, region, dest } = target;
  const u = dest.w / region.w;
  const ky = dest.h / (region.h * u);
  const pen = new Pen(ctx, u);
  const frames = framesOf(spreadIndex, plan.total, dir);
  pen.label = [frames.left?.n, frames.right?.n].filter((n) => n !== undefined).join('-');
  const scene: Scene = { pen, plan, total: plan.total, dir, slot, index: spreadIndex, ...frames };

  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(dest.x, dest.y, dest.w, dest.h);
    ctx.clip();
    ctx.translate(dest.x - region.x * u, dest.y - region.y * u * ky);
    ctx.scale(1, ky);
    ctx.textBaseline = 'alphabetic';
    switch (slot.kind) {
      case 'cover':
        drawCover(scene);
        break;
      case 'front':
        drawFront(scene);
        break;
      case 'article':
        drawArticle(scene, slot);
        break;
      case 'infographic':
        drawInfographic(scene);
        break;
      case 'closing':
        drawClosing(scene);
        break;
      case 'back':
        drawBack(scene);
        break;
    }
  } finally {
    ctx.restore();
  }
  return pen.issues;
}

export function pageRegion(frameX: number, extra: { top: number; bottom: number; left: number; right: number }): Box {
  return {
    x: frameX - extra.left,
    y: -extra.top,
    w: PAGE_W + extra.left + extra.right,
    h: PAGE_H + extra.top + extra.bottom,
  };
}
