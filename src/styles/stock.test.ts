import { describe, expect, test } from 'bun:test';

import { signatureStock, STOCK_NAMES } from './stock';

describe('signatureStock', () => {
  test('asigna los ocho papeles con nombre en orden', () => {
    expect(STOCK_NAMES.map((_, index) => signatureStock(index).name)).toEqual([
      'Celeste',
      'Mostaza',
      'Lila',
      'Coral',
      'Menta',
      'Arena',
      'Rosa',
      'Pizarra',
    ]);
    expect(signatureStock(0)).toEqual({ name: 'Celeste', cssVar: 'var(--stock-1)', inkVar: 'var(--on-stock-1)', slot: 1 });
  });

  test('repite la serie pasado el octavo y tolera índices raros', () => {
    expect(signatureStock(8).name).toBe('Celeste');
    expect(signatureStock(13).cssVar).toBe('var(--stock-6)');
    expect(signatureStock(-1).name).toBe('Pizarra');
    expect(signatureStock(Number.NaN).name).toBe('Celeste');
  });
});
