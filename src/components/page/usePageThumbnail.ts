import { useEffect, useState } from 'react';

import { pageRegion, regionKey, useProjectStore } from '@/lib/store';
import type { PageBox } from '@/lib/store';
import { thumbnailUrl } from '@/lib/ingest';

export type ThumbnailStatus = 'blank' | 'loading' | 'ready' | 'error';

export interface PageThumbnail {
  url: string | null;
  status: ThumbnailStatus;
}

interface Loaded {
  key: string;
  url: string | null;
  failed: boolean;
}

export function usePageThumbnail(pageNumber: number, box: PageBox = 'trim', enabled = true): PageThumbnail {
  const key = useProjectStore((state) => regionKey(pageRegion(pageNumber, box, state)));
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!enabled || key === 'blank') return;
    const region = pageRegion(pageNumber, box);
    if (!region) return;

    const controller = new AbortController();
    thumbnailUrl(region.unitId, region.rect, { signal: controller.signal })
      .then((url) => {
        if (!controller.signal.aborted) setLoaded({ key, url, failed: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        console.warn(`No se pudo generar la miniatura de la página ${pageNumber}.`, error);
        setLoaded({ key, url: null, failed: true });
      });
    return () => controller.abort();
  }, [key, enabled, pageNumber, box]);

  if (key === 'blank') return { url: null, status: 'blank' };
  if (loaded && loaded.key === key) {
    return loaded.failed ? { url: null, status: 'error' } : { url: loaded.url, status: 'ready' };
  }
  return { url: null, status: 'loading' };
}
