export const STOCK_NAMES = ['Celeste', 'Mostaza', 'Lila', 'Coral', 'Menta', 'Arena', 'Rosa', 'Pizarra'] as const;

export type StockName = (typeof STOCK_NAMES)[number];

export interface SignatureStock {
  name: StockName;
  cssVar: string;
  inkVar: string;
  slot: number;
}

export function signatureStock(index: number): SignatureStock {
  const count = STOCK_NAMES.length;
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  const position = ((safe % count) + count) % count;
  const slot = position + 1;
  return {
    name: STOCK_NAMES[position] ?? 'Celeste',
    cssVar: `var(--stock-${slot})`,
    inkVar: `var(--on-stock-${slot})`,
    slot,
  };
}

export const COVER_STOCK = { name: 'Petróleo', cssVar: 'var(--stock-cover)', inkVar: 'var(--on-stock-cover)' } as const;
export const NEUTRAL_STOCK = { name: 'Tripa', cssVar: 'var(--stock-neutral)', inkVar: 'var(--on-stock-neutral)' } as const;
