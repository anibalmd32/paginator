import { describe, expect, test } from 'bun:test';

import {
  cacheBudgetBytes,
  cropPixels,
  normalizeRect,
  planImageRaster,
  planPdfRaster,
  pointsToMm,
  rasterLimits,
  rectKey,
  scaleOfStep,
  scaleStepIndex,
  tierLongSide,
} from './sizing';

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const LEFT = { x: 0, y: 0, w: 0.5, h: 1 };
const RIGHT = { x: 0.5, y: 0, w: 0.5, h: 1 };
const MB = 1024 * 1024;
const LIMITS = rasterLimits(256 * MB);

const A4_W = 595.28;
const A4_H = 841.89;

describe('tierLongSide', () => {
  test('niveles de la especificación', () => {
    expect(tierLongSide('thumb')).toBe(320);
    expect(tierLongSide('mid')).toBe(1200);
    expect(tierLongSide('high')).toBe(2600);
  });
});

describe('normalizeRect', () => {
  test('acota a la unidad', () => {
    expect(normalizeRect({ x: -0.1, y: 0.2, w: 0.6, h: 2 })).toEqual({ x: 0, y: 0.2, w: 0.5, h: 0.8 });
  });

  test('valores no finitos o área nula devuelven la unidad entera', () => {
    expect(normalizeRect({ x: Number.NaN, y: 0, w: 1, h: 1 })).toEqual(FULL);
    expect(normalizeRect({ x: 0.5, y: 0, w: 0, h: 1 })).toEqual(FULL);
    expect(normalizeRect({ x: 2, y: 0, w: 1, h: 1 })).toEqual(FULL);
  });
});

describe('rectKey', () => {
  test('rectángulos iguales salvo ruido de coma flotante comparten clave', () => {
    expect(rectKey({ x: 0.1 + 0.2, y: 0, w: 0.5, h: 1 })).toBe(rectKey({ x: 0.3, y: 0, w: 0.5, h: 1 }));
    expect(rectKey(LEFT)).not.toBe(rectKey(RIGHT));
  });
});

describe('cropPixels', () => {
  test('las dos mitades teselan sin solape ni hueco, también con ancho impar', () => {
    for (const width of [1000, 1001, 1191, 37]) {
      const left = cropPixels(LEFT, width, 800);
      const right = cropPixels(RIGHT, width, 800);
      expect(left.x).toBe(0);
      expect(left.x + left.w).toBe(right.x);
      expect(right.x + right.w).toBe(width);
      expect(left.h).toBe(800);
    }
  });

  test('nunca devuelve un recorte vacío ni fuera del lienzo', () => {
    const tiny = cropPixels({ x: 0.9999, y: 0.9999, w: 0.00001, h: 0.00001 }, 100, 100);
    expect(tiny.w).toBeGreaterThanOrEqual(1);
    expect(tiny.h).toBeGreaterThanOrEqual(1);
    expect(tiny.x + tiny.w).toBeLessThanOrEqual(100);
    expect(tiny.y + tiny.h).toBeLessThanOrEqual(100);
  });
});

describe('escalera de escalas', () => {
  test('redondea hacia arriba al escalón', () => {
    for (const scale of [0.2, 0.38, 1, 1.01, 1.9, 3.3]) {
      const step = scaleStepIndex(scale);
      expect(scaleOfStep(step)).toBeGreaterThanOrEqual(scale - 1e-9);
      expect(scaleOfStep(step - 1)).toBeLessThan(scale);
    }
  });

  test('una escala que ya es un escalón no salta al siguiente', () => {
    for (let step = -8; step <= 12; step++) expect(scaleStepIndex(scaleOfStep(step))).toBe(step);
  });
});

describe('planPdfRaster', () => {
  test('la región mide al menos lo pedido y como mucho un escalón más', () => {
    for (const tier of ['thumb', 'mid', 'high'] as const) {
      const want = tierLongSide(tier);
      const plan = planPdfRaster(A4_W, A4_H, FULL, want, LIMITS);
      const longSide = Math.max(plan.crop.w, plan.crop.h);
      expect(longSide).toBeGreaterThanOrEqual(want - 1);
      expect(longSide).toBeLessThanOrEqual(want * 2 ** 0.25 + 1);
      expect(plan.surfaceWidth).toBe(Math.round(A4_W * plan.scale));
      expect(plan.surfaceHeight).toBe(Math.round(A4_H * plan.scale));
    }
  });

  test('las dos mitades de un pliego comparten render y casan en el lomo', () => {
    const left = planPdfRaster(2 * A4_W, A4_H, LEFT, 1200, LIMITS);
    const right = planPdfRaster(2 * A4_W, A4_H, RIGHT, 1200, LIMITS);
    expect(left.step).toBe(right.step);
    expect(left.surfaceWidth).toBe(right.surfaceWidth);
    expect(left.crop.x + left.crop.w).toBe(right.crop.x);
    expect(right.crop.x + right.crop.w).toBe(right.surfaceWidth);
    expect(left.crop.h).toBeGreaterThanOrEqual(1199);
  });

  test('caja de corte y caja completa de una página con sangrado caen en el mismo escalón', () => {
    const w = (226 * 72) / 25.4;
    const h = (313 * 72) / 25.4;
    const trim = { x: 8 / 226, y: 8 / 313, w: 210 / 226, h: 297 / 313 };
    const full = planPdfRaster(w, h, FULL, 1200, LIMITS);
    const trimmed = planPdfRaster(w, h, trim, 1200, LIMITS);
    expect(Math.abs(full.step - trimmed.step)).toBeLessThanOrEqual(1);
  });

  test('una región diminuta no dispara un lienzo gigantesco', () => {
    const plan = planPdfRaster(A4_W, A4_H, { x: 0.4, y: 0.4, w: 0.01, h: 0.01 }, 2600, LIMITS);
    expect(plan.surfaceWidth * plan.surfaceHeight).toBeLessThanOrEqual(LIMITS.maxPixels);
    expect(Math.max(plan.surfaceWidth, plan.surfaceHeight)).toBeLessThanOrEqual(LIMITS.maxSide);
    expect(plan.crop.w).toBeGreaterThanOrEqual(1);
  });
});

describe('planImageRaster', () => {
  test('reduce al lado largo pedido', () => {
    const plan = planImageRaster(2480, 3508, FULL, 320);
    expect(plan.outHeight).toBe(320);
    expect(plan.outWidth).toBe(Math.round((2480 * 320) / 3508));
    expect(plan.scale).toBeCloseTo(320 / 3508, 6);
    expect(plan.crop).toEqual({ x: 0, y: 0, w: 2480, h: 3508 });
  });

  test('nunca amplía por encima de la resolución nativa', () => {
    const plan = planImageRaster(620, 877, FULL, 2600);
    expect(plan.scale).toBe(1);
    expect(plan.outWidth).toBe(620);
    expect(plan.outHeight).toBe(877);
  });

  test('mitades de un pliego en imagen', () => {
    const left = planImageRaster(1241, 877, LEFT, 1200);
    const right = planImageRaster(1241, 877, RIGHT, 1200);
    expect(left.crop.x + left.crop.w).toBe(right.crop.x);
    expect(right.crop.x + right.crop.w).toBe(1241);
    expect(left.outHeight).toBe(877);
  });
});

describe('presupuesto y límites', () => {
  test('256 MB salvo en equipos con poca memoria', () => {
    expect(cacheBudgetBytes(undefined)).toBe(256 * MB);
    expect(cacheBudgetBytes(8)).toBe(256 * MB);
    expect(cacheBudgetBytes(4)).toBe(128 * MB);
    expect(cacheBudgetBytes(2)).toBe(128 * MB);
  });

  test('un render no pasa de la mitad de la caché', () => {
    for (const budget of [128 * MB, 256 * MB]) {
      expect(rasterLimits(budget).maxPixels * 4).toBeLessThanOrEqual(budget / 2);
    }
  });

  test('un pliego doble A4 a nivel high cabe sin recortar escala con 256 MB', () => {
    const plan = planPdfRaster(2 * A4_W, A4_H, LEFT, 2600, LIMITS);
    expect(plan.crop.h).toBeGreaterThanOrEqual(2599);
  });
});

describe('pointsToMm', () => {
  test('A4 y tamaños con sangrado', () => {
    expect(pointsToMm(A4_W)).toBeCloseTo(210, 1);
    expect(pointsToMm(A4_H)).toBeCloseTo(297, 1);
    expect(pointsToMm(72)).toBe(25.4);
    expect(pointsToMm((226 * 72) / 25.4)).toBe(226);
  });
});
