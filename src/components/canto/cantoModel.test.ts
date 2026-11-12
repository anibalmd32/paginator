import { describe, expect, test } from 'bun:test';

import { buildCantoModel, COVER_WEIGHT, formatPageRuns, openingLabel, positionToWeight, weightToPosition, worstSeverity } from './cantoModel';
import { samplePerfectBound, sampleSaddleStitch } from './sampleImposition';

describe('muestras de imposición', () => {
  test('grapada de 32: pliego exterior [32|1] / [2|31] y cubierta', () => {
    const imposition = sampleSaddleStitch(32);
    expect(imposition.sheets).toHaveLength(8);
    expect(imposition.sheets[0]).toMatchObject({ role: 'cover', front: { left: 32, right: 1 }, back: { left: 2, right: 31 } });
    expect(imposition.sheets[7]).toMatchObject({ front: { left: 18, right: 15 }, back: { left: 16, right: 17 } });
    expect(imposition.placements.every((placement, index) => placement.pageNumber === index + 1)).toBe(true);
  });

  test('lomo cuadrado de 96 con cubierta aparte: 6 cuadernillos de tripa', () => {
    const imposition = samplePerfectBound(96, 16);
    const interior = imposition.signatures.filter((signature) => signature.role === 'interior');
    expect(interior).toHaveLength(6);
    expect(interior.map((signature) => signature.pages)).toEqual([16, 16, 16, 16, 16, 12]);
    expect(imposition.sheets[0]).toMatchObject({ role: 'cover', front: { left: 96, right: 1 }, back: { left: 2, right: 95 } });
  });
});

describe('modelo del canto', () => {
  test('una rebanada por hoja; las del mismo pliego de una grapada son k y L−1−k', () => {
    const model = buildCantoModel(sampleSaddleStitch(32), 'leaf');
    expect(model.slices).toHaveLength(16);
    expect(model.leafCount).toBe(16);
    expect(model.leavesBySheet.get(0)).toEqual([0, 15]);
    expect(model.leavesBySheet.get(3)).toEqual([3, 12]);
    expect(model.slices[0]?.pages).toEqual([1, 2]);
  });

  test('cubierta más gruesa y en Petróleo; tripa neutra con un solo cuadernillo', () => {
    const model = buildCantoModel(sampleSaddleStitch(8), 'leaf');
    expect(model.slices.map((slice) => slice.isCover)).toEqual([true, false, false, true]);
    expect(model.slices[0]?.weight).toBe(COVER_WEIGHT);
    expect(model.slices[0]?.fill).toBe('var(--stock-cover)');
    expect(model.slices[1]?.fill).toBe('var(--stock-neutral)');
    expect(model.totalWeight).toBe(2 + 2 * COVER_WEIGHT);
  });

  test('con varios cuadernillos cada uno toma su papel de la serie', () => {
    const model = buildCantoModel(samplePerfectBound(96, 16), 'sheet');
    expect(model.slices).toHaveLength(24);
    expect(model.signatureStarts).toEqual([0, 1, 5, 9, 13, 17, 21]);
    expect(model.slices[1]?.stockName).toBe('Celeste');
    expect(model.slices[5]?.stockName).toBe('Mostaza');
    expect(model.slices[23]?.stockName).toBe('Arena');
  });

  test('posición ↔ peso acumulado son inversas', () => {
    const model = buildCantoModel(sampleSaddleStitch(16), 'leaf');
    for (const position of [0, 0.5, 1, 2.25, 7.5, 8]) {
      expect(weightToPosition(model, positionToWeight(model, position))).toBeCloseTo(position, 6);
    }
    expect(positionToWeight(model, 99)).toBe(model.totalWeight);
  });
});

describe('textos', () => {
  test('aberturas', () => {
    const imposition = sampleSaddleStitch(32);
    expect(openingLabel(imposition, 0)).toBe('Portada');
    expect(openingLabel(imposition, 6)).toBe('Págs. 12–13');
    expect(openingLabel(imposition, 16)).toBe('Contraportada');
  });

  test('tramos de páginas', () => {
    expect(formatPageRuns([31, 1, 2, 32])).toBe('1–2 · 31–32');
    expect(formatPageRuns([5])).toBe('5');
    expect(formatPageRuns([])).toBe('');
  });

  test('peor severidad', () => {
    expect(worstSeverity('info', 'error')).toBe('error');
    expect(worstSeverity(undefined, 'warning')).toBe('warning');
  });
});
