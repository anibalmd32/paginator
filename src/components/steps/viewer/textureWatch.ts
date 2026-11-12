import type { PageTextureProvider } from '@/lib/viewer';

export interface TextureWatch {
  provider: PageTextureProvider;
  waiting(pages: readonly number[]): boolean;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export function createTextureWatch(source: PageTextureProvider): TextureWatch {
  const inFlight = new Map<number, number>();
  const arrived = new Set<number>();
  const listeners = new Set<() => void>();
  let frame = 0;

  const notify = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const listener of [...listeners]) listener();
    });
  };

  const settle = (page: number): void => {
    const count = (inFlight.get(page) ?? 1) - 1;
    if (count <= 0) inFlight.delete(page);
    else inFlight.set(page, count);
    notify();
  };

  const provider: PageTextureProvider = async (page, tier, signal) => {
    inFlight.set(page, (inFlight.get(page) ?? 0) + 1);
    notify();
    try {
      const bitmap = await source(page, tier, signal);
      arrived.add(page);
      return bitmap;
    } finally {
      settle(page);
    }
  };

  return {
    provider,
    waiting: (pages) => inFlight.size > 0 && pages.some((page) => !arrived.has(page)),
    reset: () => {
      arrived.clear();
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
