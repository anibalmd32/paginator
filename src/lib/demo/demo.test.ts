import { describe, expect, test } from 'bun:test';
import { checkDemoPage, demoConfigPatch, DEMO_TITLE, describeDemoFiles, drawDemoPage } from './index';
import type { Ctx2D } from './kit';
import { planMagazine, normalizePageCount, printerSides } from './plan';
import { sideOf } from './scene';

function fakeContext(): { ctx: Ctx2D; calls: string[] } {
  const calls: string[] = [];
  const state: Record<string | symbol, unknown> = { font: '10px serif', letterSpacing: '0px' };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'measureText') {
        return (text: string) => {
          const px = Number(/([\d.]+)px/.exec(String(target.font))?.[1] ?? 10);
          const spacing = Number(/(-?[\d.]+)px/.exec(String(target.letterSpacing))?.[1] ?? 0);
          let em = 0;
          for (const ch of text) em += ch === ' ' ? 0.28 : ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 0.72 : 0.56;
          return { width: em * px + spacing * text.length };
        };
      }
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push(String(key));
        void args;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
    has(target, key) {
      return key === 'letterSpacing' || key in target;
    },
  });
  return { ctx: ctx as unknown as Ctx2D, calls };
}

const COUNTS = [8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64];

describe('plan de la revista', () => {
  test('normaliza el número de páginas a múltiplo de 4 entre 8 y 64', () => {
    expect(normalizePageCount(undefined)).toBe(24);
    expect(normalizePageCount(3)).toBe(8);
    expect(normalizePageCount(22)).toBe(24);
    expect(normalizePageCount(100)).toBe(64);
  });

  test.each(COUNTS)('%i páginas: estructura fija y pliego central panorámico', (total) => {
    const plan = planMagazine(total);
    expect(plan.spreads.length).toBe(total / 2 + 1);
    expect(plan.spreads[0]?.kind).toBe('cover');
    expect(plan.spreads[1]?.kind).toBe('front');
    expect(plan.spreads[total / 2 - 1]?.kind).toBe('closing');
    expect(plan.spreads[total / 2]?.kind).toBe('back');
    const central = plan.spreads[total / 4];
    expect(central?.kind === 'article' && central.template).toBe('panorama');
    const crossing = plan.spreads.filter((s) => s.kind === 'infographic' || (s.kind === 'article' && (s.template === 'band' || s.template === 'panorama')));
    expect(crossing.length).toBeGreaterThanOrEqual(total >= 12 ? 2 : 1);
    for (const entry of plan.toc) {
      expect(entry.page % 2).toBe(0);
      expect(entry.page).toBeGreaterThan(3);
      expect(entry.page).toBeLessThan(total);
    }
  });

  test('imposición a caballo: las páginas de una cara suman N+1', () => {
    for (const total of COUNTS) {
      const sides = printerSides(total, 'ltr');
      expect(sides.length).toBe(total / 2);
      for (const side of sides) expect(side.left + side.right).toBe(total + 1);
      const pages = sides.flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
      expect(pages).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    }
    expect(printerSides(8, 'ltr').slice(0, 2)).toEqual([
      { sheet: 0, face: 'front', left: 8, right: 1 },
      { sheet: 0, face: 'back', left: 2, right: 7 },
    ]);
    expect(printerSides(8, 'rtl')[0]).toEqual({ sheet: 0, face: 'front', left: 1, right: 8 });
  });

  test('lados de página según la dirección de lectura', () => {
    expect(sideOf(1, 'ltr')).toBe('right');
    expect(sideOf(2, 'ltr')).toBe('left');
    expect(sideOf(1, 'rtl')).toBe('left');
    expect(sideOf(2, 'rtl')).toBe('right');
  });
});

describe('variantes de archivo', () => {
  test('páginas sueltas', () => {
    const files = describeDemoFiles(24, 'pages', 'ltr', false);
    expect(files.map((f) => f.name).slice(0, 2)).toEqual(['canto_p01.jpg', 'canto_p02.jpg']);
    expect(files.length).toBe(24);
    expect(files[0]?.widthMm).toBe(210);
    const bleed = describeDemoFiles(24, 'pages', 'ltr', true);
    expect(bleed[0]?.widthMm).toBe(226);
    expect(bleed[0]?.heightMm).toBe(313);
  });

  test('pliegos de lectura con portada y contraportada sueltas', () => {
    const files = describeDemoFiles(24, 'reader-spreads', 'ltr', true);
    expect(files.length).toBe(13);
    expect(files[0]?.name).toBe('canto_p01.jpg');
    expect(files[1]?.name).toBe('canto_pliego_02-03.jpg');
    expect(files[1]?.parts).toEqual([
      { page: 2, side: 'left' },
      { page: 3, side: 'right' },
    ]);
    expect(files[1]?.widthMm).toBe(436);
    expect(files[12]?.name).toBe('canto_p24.jpg');
    const rtl = describeDemoFiles(24, 'reader-spreads', 'rtl', false);
    expect(rtl[1]?.parts[0]).toEqual({ page: 3, side: 'left' });
  });

  test('caras impuestas en orden de máquina y con nombres que se ordenan solos', () => {
    const files = describeDemoFiles(16, 'printer-spreads', 'ltr', false);
    expect(files.map((f) => f.name).slice(0, 3)).toEqual(['canto_pliego01_cara.jpg', 'canto_pliego01_retiro.jpg', 'canto_pliego02_cara.jpg']);
    expect(files[0]?.parts.map((p) => p.page)).toEqual([16, 1]);
    expect(files[1]?.parts.map((p) => p.page)).toEqual([2, 15]);
    const sorted = [...files.map((f) => f.name)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    expect(sorted).toEqual(files.map((f) => f.name));
  });

  test('configuración que acompaña a cada variante', () => {
    expect(demoConfigPatch()).toMatchObject({ inputMode: 'pages', bleedMm: 0, marksMm: 0, declaredPageCount: 24, title: DEMO_TITLE });
    expect(demoConfigPatch({ variant: 'printer-spreads', withBleedAndMarks: true, readingDirection: 'rtl', pageCount: 32 })).toMatchObject({
      inputMode: 'spreads',
      spreadKind: 'printer',
      bleedMm: 3,
      marksMm: 5,
      readingDirection: 'rtl',
      declaredPageCount: 32,
      trim: { mode: 'auto' },
    });
    expect(demoConfigPatch({ variant: 'reader-spreads' })).toMatchObject({ inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: false });
  });
});

describe('composición', () => {
  test.each(COUNTS)('%i páginas: ningún texto desborda en LTR ni en RTL', (total) => {
    for (const dir of ['ltr', 'rtl'] as const) {
      for (let n = 1; n <= total; n++) {
        const { ctx } = fakeContext();
        expect({ page: n, dir, issues: checkDemoPage(ctx, n, total, 620, 877, dir) }).toEqual({ page: n, dir, issues: [] });
      }
    }
  });

  test('drawDemoPage rechaza páginas inexistentes', () => {
    const { ctx } = fakeContext();
    expect(() => drawDemoPage(ctx, 0, 24, 100, 141)).toThrow();
    expect(() => drawDemoPage(ctx, 25, 24, 100, 141)).toThrow();
    drawDemoPage(ctx, 24, 24, 100, 141);
  });

  test('es determinista: mismas llamadas de dibujo en cada ejecución', () => {
    const a = fakeContext();
    const b = fakeContext();
    drawDemoPage(a.ctx, 5, 24, 300, 424);
    drawDemoPage(b.ctx, 5, 24, 300, 424);
    expect(a.calls.length).toBeGreaterThan(50);
    expect(a.calls).toEqual(b.calls);
  });
});
