import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { computeImposition } from '@/lib/imposition';
import { subscribeTheme } from '@/lib/theme';
import type { RasterTier } from '@/lib/types';
import type { MagazineEngine, MagazineModel, PageTextureProvider } from '@/lib/viewer';

import styles from './HeroMagazine.module.css';

const PAGE_COUNT = 24;
const LAST_SPREAD = PAGE_COUNT / 2;
const STILL_SPREAD = 6;
const DWELL_MS = 2000;
const DWELL_COVER_MS = 3200;
const POSTER_TIMEOUT_MS = 4000;
const TIER_HEIGHT: Record<RasterTier, number> = { thumb: 360, mid: 900, high: 1400 };
const SOURCE_HEIGHT = 1400;
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const IMPOSITION = computeImposition(PAGE_COUNT, {
  binding: 'saddle-stitch',
  signaturePages: 16,
  separateCover: false,
  readingDirection: 'ltr',
});

const pageUrl = (n: number): string => `/landing/canto/p${String(n).padStart(2, '0')}.jpg`;

function spreadLabel(spread: number): string {
  if (spread <= 0) return 'Portada';
  if (spread >= LAST_SPREAD) return 'Contraportada';
  return `Págs. ${String(2 * spread)}–${String(2 * spread + 1)}`;
}

function pagesOfSpread(spread: number): number[] {
  return [2 * spread, 2 * spread + 1].filter((n) => n >= 1 && n <= PAGE_COUNT);
}

const reducedMotionQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

export function HeroMagazine() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MagazineEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const visibleRef = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [spread, setSpread] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    const engine = engineRef.current;
    if (!engine || !playingRef.current || !visibleRef.current) return;
    const current = engine.spreadIndex;
    timerRef.current = setTimeout(
      () => {
        timerRef.current = null;
        const live = engineRef.current;
        if (!live || !playingRef.current || !visibleRef.current) return;
        live.goToSpread(live.spreadIndex >= LAST_SPREAD ? 0 : live.spreadIndex + 1);
      },
      current === 0 ? DWELL_COVER_MS : DWELL_MS,
    );
  }, [clearTimer]);

  const setAutoplay = useCallback(
    (on: boolean) => {
      playingRef.current = on;
      setPlaying(on);
      if (on) schedule();
      else clearTimer();
    },
    [clearTimer, schedule],
  );

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let disposed = false;
    let unsubscribeTheme: (() => void) | null = null;
    let posterTimer: ReturnType<typeof setTimeout> | null = null;
    const motion = reducedMotionQuery();
    const reduced = motion?.matches ?? false;
    const initialSpread = reduced ? STILL_SPREAD : 0;
    const waiting = new Set(pagesOfSpread(initialSpread));
    const blobs = new Map<number, Promise<Blob>>();

    const reveal = (): void => {
      if (disposed) return;
      requestAnimationFrame(() => requestAnimationFrame(() => !disposed && setReady(true)));
    };

    const loadBlob = (n: number): Promise<Blob> => {
      let pending = blobs.get(n);
      if (!pending) {
        pending = fetch(pageUrl(n)).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${String(response.status)} al cargar ${pageUrl(n)}`);
          return response.blob();
        });
        pending.catch(() => blobs.delete(n));
        blobs.set(n, pending);
      }
      return pending;
    };

    const provider: PageTextureProvider = async (n, tier, signal) => {
      const blob = await loadBlob(n);
      if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      const height = TIER_HEIGHT[tier];
      const bitmap =
        height >= SOURCE_HEIGHT
          ? await createImageBitmap(blob)
          : await createImageBitmap(blob, { resizeHeight: height, resizeQuality: 'high' });
      if (tier !== 'thumb' && waiting.delete(n) && waiting.size === 0) reveal();
      return bitmap;
    };

    void Promise.all([import('@/lib/viewer'), import('@/components/steps/viewer/engineTheme')])
      .then(([{ MagazineEngine: Engine }, { readEngineTheme }]) => {
        if (disposed) return;
        const engine = new Engine(host, {
          onSpreadChange: (index, settled) => {
            setSpread(index);
            if (settled) schedule();
          },
          onError: (message) => {
            setError(message);
            setAutoplay(false);
          },
        });
        engineRef.current = engine;
        engine.setReducedMotion(reduced);
        engine.setTheme(readEngineTheme());
        unsubscribeTheme = subscribeTheme(() => engine.setTheme(readEngineTheme()));
        const model: MagazineModel = {
          pageCount: PAGE_COUNT,
          trim: { widthMm: 210, heightMm: 297 },
          binding: 'saddle-stitch',
          readingDirection: 'ltr',
          interiorCaliperMm: 0.09,
          coverCaliperMm: 0.22,
          coverLeavesPerSide: 1,
          sheets: IMPOSITION.sheets,
          safeMarginMm: 5,
          bleedMm: 0,
          getPageTexture: provider,
        };
        engine.setModel(model, { spreadIndex: initialSpread });
        setSpread(initialSpread);
        posterTimer = setTimeout(reveal, POSTER_TIMEOUT_MS);
        if (!reduced) setAutoplay(true);
      })
      .catch((cause: unknown) => {
        console.error('No se pudo cargar el visor 3D de la portada.', cause);
        if (!disposed) setError('No se pudo cargar el ejemplar en 3D.');
      });

    const onMotionChange = (event: MediaQueryListEvent): void => {
      const engine = engineRef.current;
      engine?.setReducedMotion(event.matches);
      if (event.matches) {
        setAutoplay(false);
        engine?.goToSpread(STILL_SPREAD, { animate: false });
      }
    };
    motion?.addEventListener('change', onMotionChange);

    return () => {
      disposed = true;
      motion?.removeEventListener('change', onMotionChange);
      unsubscribeTheme?.();
      if (posterTimer !== null) clearTimeout(posterTimer);
      clearTimer();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [clearTimer, schedule, setAutoplay]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? true;
        if (visibleRef.current) schedule();
        else clearTimer();
      },
      { threshold: 0.2 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [clearTimer, schedule]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stop = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('[data-autoplay-toggle]')) return;
      if (playingRef.current) setAutoplay(false);
    };
    const passWheel = (event: WheelEvent): void => event.stopPropagation();
    stage.addEventListener('pointerdown', stop, { capture: true });
    stage.addEventListener('keydown', stop, { capture: true });
    stage.addEventListener('wheel', passWheel, { capture: true, passive: true });
    return () => {
      stage.removeEventListener('pointerdown', stop, { capture: true });
      stage.removeEventListener('keydown', stop, { capture: true });
      stage.removeEventListener('wheel', passWheel, { capture: true });
    };
  }, [setAutoplay]);

  const go = (delta: number): void => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.goToSpread(engine.spreadIndex + delta);
  };

  const label = spreadLabel(spread);

  return (
    <div ref={stageRef} className={styles.stage} data-ready={ready ? '' : undefined}>
      <div ref={canvasHostRef} className={styles.canvas} aria-hidden="true" />

      <div className={styles.poster} aria-hidden="true">
        <div className={styles.posterBook}>
          <picture className={styles.posterLeft}>
            <source media="(prefers-reduced-motion: reduce)" srcSet={pageUrl(12)} />
            <img src={BLANK} alt="" width={990} height={1400} decoding="async" />
          </picture>
          <picture className={styles.posterRight}>
            <source media="(prefers-reduced-motion: reduce)" srcSet={pageUrl(13)} />
            <img src={pageUrl(1)} alt="" width={990} height={1400} decoding="async" fetchPriority="high" />
          </picture>
        </div>
      </div>

      <p className={styles.caption}>
        <span className={styles.captionTitle}>«Canto» nº 12, revista de ejemplo</span>
        <span className={styles.captionHint}>
          {error ?? 'Ficticia, 24 páginas grapadas. Arrástrala o pulsa una esquina para hojearla.'}
        </span>
      </p>

      <div className={styles.bar} role="group" aria-label="Hojear la revista de ejemplo">
        <button type="button" className={styles.button} onClick={() => go(-1)} disabled={spread <= 0 || error !== null} aria-label="Página anterior">
          <Icon icon={ChevronLeft} size={18} />
        </button>
        <p className={styles.where} aria-live={playing ? 'off' : 'polite'}>
          <span className={styles.whereLabel}>{label}</span>
          <span className={styles.whereTotal}> de {PAGE_COUNT}</span>
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={() => go(1)}
          disabled={spread >= LAST_SPREAD || error !== null}
          aria-label="Página siguiente"
        >
          <Icon icon={ChevronRight} size={18} />
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setAutoplay(!playingRef.current)}
          data-autoplay-toggle=""
          disabled={error !== null}
          aria-pressed={playing}
        >
          <Icon icon={playing ? Pause : Play} size={16} />
          <span>{playing ? 'Pausar' : 'Hojear sola'}</span>
        </button>
      </div>
    </div>
  );
}
