import { describe, expect, test } from 'bun:test';

import { createBookSpec, surfaceParams } from './bookLayout';
import {
  createCurveParams,
  createCurveSamples,
  LEAF_SAMPLES,
  sampleCurve,
  sineIntegral,
  solveRestShape,
} from './leafCurve';
import type { MagazineModel } from './types';

const W = 210;

function arcLength(samples: ReturnType<typeof createCurveSamples>): number {
  let length = 0;
  for (let i = 1; i < LEAF_SAMPLES; i += 1) {
    length += Math.hypot((samples.x[i] ?? 0) - (samples.x[i - 1] ?? 0), (samples.z[i] ?? 0) - (samples.z[i - 1] ?? 0));
  }
  return length;
}

function model(binding: MagazineModel['binding'], pageCount = 32): MagazineModel {
  return {
    pageCount,
    trim: { widthMm: W, heightMm: 297 },
    binding,
    readingDirection: 'ltr',
    interiorCaliperMm: 0.09,
    coverCaliperMm: 0.22,
    coverLeavesPerSide: 1,
    sheets: [],
    safeMarginMm: 5,
    bleedMm: 3,
    getPageTexture: async () => null,
  };
}

describe('curva de hoja', () => {
  test('la integral seno coincide con valores conocidos', () => {
    expect(sineIntegral(0)).toBe(0);
    expect(sineIntegral(1)).toBeCloseTo(0.946083, 5);
    expect(sineIntegral(1.25)).toBeCloseTo(1.14645, 4);
  });

  test('la forma de reposo sube exactamente lo pedido', () => {
    for (const climb of [0, 0.5, 2, 6, 30]) {
      const shape = solveRestShape(climb, 15, { angle: 0, lambda: 1 });
      expect(shape.lambda * sineIntegral(Math.abs(shape.angle))).toBeCloseTo(climb, 3);
    }
  });

  test('la hoja no se estira en ninguna postura (la textura conserva su proporción)', () => {
    const spec = createBookSpec(model('perfect-bound'));
    const params = createCurveParams();
    const samples = createCurveSamples();
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      for (const curl of [0, 0.6, -1.1]) {
        surfaceParams(spec, spec.total * 0.4, t, 0.4, curl, 1, params);
        sampleCurve(params, W, samples);
        expect(Math.abs(arcLength(samples) - W)).toBeLessThan(W * 0.002);
      }
    }
  });

  test('una hoja en reposo alcanza la altura de su pila', () => {
    for (const binding of ['saddle-stitch', 'perfect-bound'] as const) {
      const spec = createBookSpec(model(binding));
      const params = createCurveParams();
      const samples = createCurveSamples();
      const depth = spec.total * 0.3;
      surfaceParams(spec, depth, 0, 0.3, 0, 0, params);
      sampleCurve(params, W, samples);
      expect(samples.z[LEAF_SAMPLES - 1] ?? 0).toBeCloseTo(spec.total - depth, 1);
      surfaceParams(spec, depth, 1, 0.3, 0, 0, params);
      sampleCurve(params, W, samples);
      expect(samples.z[LEAF_SAMPLES - 1] ?? 0).toBeCloseTo(depth, 1);
      expect(samples.x[LEAF_SAMPLES - 1] ?? 0).toBeLessThan(-W * 0.95);
    }
  });

  test('a mitad de giro la hoja está de pie sobre el lomo', () => {
    const spec = createBookSpec(model('saddle-stitch'));
    const params = createCurveParams();
    const samples = createCurveSamples();
    surfaceParams(spec, spec.total / 2, 0.5, 0.5, 0, 1, params);
    sampleCurve(params, W, samples);
    expect(Math.abs(samples.x[LEAF_SAMPLES - 1] ?? 0)).toBeLessThan(W * 0.2);
    expect(samples.z[LEAF_SAMPLES - 1] ?? 0).toBeGreaterThan(W * 0.8);
  });
});

describe('orden de capas junto al lomo (sin cruces que dejen asomar la página de debajo)', () => {
  function heightAt(samples: ReturnType<typeof createCurveSamples>, x: number): number {
    for (let i = 1; i < LEAF_SAMPLES; i += 1) {
      const x0 = samples.x[i - 1] ?? 0;
      const x1 = samples.x[i] ?? 0;
      if ((x >= x0 && x <= x1) || (x <= x0 && x >= x1)) {
        const u = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        return (samples.z[i - 1] ?? 0) + u * ((samples.z[i] ?? 0) - (samples.z[i - 1] ?? 0));
      }
    }
    return Number.NaN;
  }

  for (const binding of ['saddle-stitch', 'perfect-bound'] as const) {
    test(`${binding}: la hoja que empieza a girar va por encima de la página que deja al descubierto`, () => {
      const spec = createBookSpec(model(binding, 24));
      const params = createCurveParams();
      const flipping = createCurveSamples();
      const below = createCurveSamples();
      const a = 3;
      const cA = spec.cum[a] ?? 0;
      const cNext = spec.cum[a + 1] ?? 0;
      const f = cA / spec.total;
      for (const t of [0, 0.02, 0.05, 0.1]) {
        surfaceParams(spec, cA, t, f, 0, 1, params);
        sampleCurve(params, W, flipping);
        surfaceParams(spec, cNext, 0, f, 0, 1, params);
        sampleCurve(params, W, below);
        for (const x of [0.5, 2, 5, 10, 20, 40, 80, 150]) {
          const zTop = heightAt(flipping, x);
          const zBelow = heightAt(below, x);
          if (Number.isNaN(zTop) || Number.isNaN(zBelow)) continue;
          expect(zTop).toBeGreaterThanOrEqual(zBelow - 1e-3);
        }
      }
    });
  }

  test('con la revista cerrada la portada no se dobla junto al lomo', () => {
    const spec = createBookSpec(model('saddle-stitch', 24));
    const params = createCurveParams();
    const cover = createCurveSamples();
    surfaceParams(spec, 0, 0, 0, 0, 0, params);
    sampleCurve(params, W, cover);
    const slopeNearSpine = Math.atan2(cover.tz[1] ?? 0, cover.tx[1] ?? 1);
    expect(slopeNearSpine).toBeLessThan(0.6);
  });
});
