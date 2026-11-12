import { BookOpenText, Upload } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { CantoHandle } from '@/components/canto';
import { Button, Callout, EmptyState, Icon, toast, useTheme, VisuallyHidden } from '@/components/ui';
import { pageTextureProvider, selectDerived, useDerived, useProjectStore } from '@/lib/store';
import type { CameraPreset, GuideVisibility, SheetFace, ViewerMode } from '@/lib/types';
import { MagazineEngine } from '@/lib/viewer';

import { CantoBar } from './CantoBar';
import { readEngineTheme } from './engineTheme';
import { GuideWords } from './GuideWords';
import { liveReadingText, liveSheetText, openingOf } from './labels';
import { buildMagazineModel, contentSignature, structuralSignature } from './model';
import { PageLabels, type PageLabelsHandle } from './PageLabels';
import { SHORTCUTS_DESCRIPTION } from './shortcuts';
import { createTextureWatch } from './textureWatch';
import { LeftToolbar, RightToolbar } from './Toolbars';
import styles from './ViewerStep.module.css';

const EDGE = 12;
const LOADING_DELAY_MS = 250;
const ZOOM_STEP = 1.25;

function isTextEntry(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(element.type);
}

const OWNS_ARROWS = 'input, select, textarea, [role="slider"], [role="radiogroup"], [role="listbox"], [role="tablist"], [role="menu"]';
const OWNS_SPACE = `${OWNS_ARROWS}, button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="option"]`;

export function ViewerStep() {
  const config = useProjectStore((state) => state.config);
  const viewer = useProjectStore((state) => state.viewer);
  const hover = useProjectStore((state) => state.hover);
  const active = useProjectStore((state) => state.step === 4);
  const setViewer = useProjectStore((state) => state.setViewer);
  const setGuides = useProjectStore((state) => state.setGuides);
  const setHover = useProjectStore((state) => state.setHover);
  const goToStep = useProjectStore((state) => state.goToStep);
  const derived = useDerived();
  const { imposition } = derived;
  const { resolved: theme } = useTheme();
  const leaves = Math.floor(imposition.pageCount / 2);
  const rtl = imposition.readingDirection === 'rtl';
  const descriptionId = useId();

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [engine, setEngine] = useState<MagazineEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spread, setSpread] = useState(viewer.spreadIndex);
  const [preview, setPreview] = useState<number | null>(null);
  const [preset, setPreset] = useState<CameraPreset | 'free'>('reading');
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bottomInset, setBottomInset] = useState(112);

  const rootRef = useRef<HTMLElement>(null);
  const cantoRef = useRef<CantoHandle>(null);
  const labelsRef = useRef<PageLabelsHandle>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const watch = useMemo(() => createTextureWatch(pageTextureProvider), []);
  const lastSettledRef = useRef<number | null>(null);
  const engineSheetRef = useRef<{ index: number; face: SheetFace } | null>(null);
  const contentRef = useRef('');
  const draggingRef = useRef(false);
  const wasActiveRef = useRef(active);
  const savedGuidesRef = useRef<GuideVisibility | null>(null);
  const shortcutsReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!host) return;
    setError(null);
    const created = new MagazineEngine(host, {
      onSpreadChange: (index, settled) => {
        setSpread(index);
        if (!settled) return;
        lastSettledRef.current = index;
        const state = useProjectStore.getState();
        if (state.viewer.spreadIndex !== index) {
          state.setViewer({ spreadIndex: index });
          if (state.hover.page !== null || state.hover.sheet !== null) state.setHover({ page: null, sheet: null });
        }
        if (state.viewer.mode === 'reading') setAnnouncement(liveReadingText(openingOf(selectImposition(state), index)));
      },
      onPosition: (position) => {
        if (!draggingRef.current) cantoRef.current?.setPosition(position);
      },
      onAnchors: (anchors) => labelsRef.current?.update(anchors),
      onSheetChange: (index, face) => {
        engineSheetRef.current = { index, face };
        const state = useProjectStore.getState();
        if (state.viewer.sheetIndex !== index || state.viewer.face !== face) state.setViewer({ sheetIndex: index, face });
        state.setHover({ page: null, sheet: null });
        if (state.viewer.mode === 'sheet') setAnnouncement(liveSheetText(selectImposition(state), index, face));
      },
      onCameraPresetChange: setPreset,
      onError: setError,
    });
    engineSheetRef.current = null;
    lastSettledRef.current = null;
    contentRef.current = '';
    setEngine(created);
    return () => {
      created.dispose();
      setEngine((current) => (current === created ? null : current));
    };
  }, [host]);

  const structure = useMemo(() => structuralSignature(config, derived), [config, derived]);
  const content = useMemo(() => contentSignature(config, derived), [config, derived]);

  useEffect(() => {
    if (!engine || !derived.hasPages) return;
    const stored = useProjectStore.getState().viewer.spreadIndex;
    engine.setModel(buildMagazineModel(config, derived, watch.provider), { spreadIndex: stored });
    watch.reset();
    contentRef.current = content;
    const actual = engine.spreadIndex;
    lastSettledRef.current = actual;
    setSpread(actual);
    const { sheetIndex: storedSheet } = useProjectStore.getState().viewer;
    const lastSheet = Math.max(0, derived.imposition.sheets.length - 1);
    engineSheetRef.current = null;
    if (actual !== stored || storedSheet > lastSheet) setViewer({ spreadIndex: actual, sheetIndex: Math.min(storedSheet, lastSheet) });
  }, [engine, structure]);

  useEffect(() => {
    if (!engine || contentRef.current === content) return;
    contentRef.current = content;
    watch.reset();
    engine.invalidateTextures();
  }, [engine, content, watch]);

  useEffect(() => {
    engine?.setTheme(readEngineTheme());
  }, [engine, theme]);

  useEffect(() => {
    if (!engine) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (): void => engine.setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [engine]);

  useEffect(() => {
    engine?.setGuides(viewer.guides);
  }, [engine, viewer.guides]);

  useEffect(() => {
    if (!engine) return;
    const known = engineSheetRef.current;
    if (!known || known.index !== viewer.sheetIndex || known.face !== viewer.face) engine.showSheet(viewer.sheetIndex, viewer.face);
    engine.setMode(viewer.mode);
  }, [engine, viewer.mode, viewer.sheetIndex, viewer.face]);

  useEffect(() => {
    if (!engine) return;
    const target = viewer.spreadIndex;
    if (target === lastSettledRef.current || target === engine.spreadIndex) return;
    engine.goToSpread(target, { animate: wasActiveRef.current });
  }, [engine, viewer.spreadIndex]);

  useEffect(() => {
    if (!active || !host || error) return;
    const focused = document.activeElement;
    if (focused instanceof Element && isTextEntry(focused)) return;
    host.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [active, host, error]);

  useEffect(() => {
    wasActiveRef.current = active;
  });

  const visiblePages = useMemo((): number[] => {
    if (viewer.mode === 'sheet') {
      const sheet = imposition.sheets[viewer.sheetIndex];
      if (!sheet) return [];
      const side = viewer.face === 'front' ? sheet.front : sheet.back;
      return [side.left, side.right];
    }
    const current = imposition.spreads[spread];
    return [current?.left ?? null, current?.right ?? null].filter((page): page is number => page !== null);
  }, [imposition, spread, viewer.mode, viewer.sheetIndex, viewer.face]);

  useEffect(() => {
    let timer = 0;
    const check = (): void => {
      if (watch.waiting(visiblePages)) {
        if (timer === 0) {
          timer = window.setTimeout(() => {
            timer = 0;
            setLoading(watch.waiting(visiblePages));
          }, LOADING_DELAY_MS);
        }
      } else {
        window.clearTimeout(timer);
        timer = 0;
        setLoading(false);
      }
    };
    check();
    const unsubscribe = watch.subscribe(check);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [watch, visiblePages]);

  useEffect(() => {
    const sync = (): void => setFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if ((!active || error !== null) && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [active, error]);

  const toggleFullscreen = useCallback((): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenEnabled) {
      toast({ tone: 'warning', title: 'Pantalla completa no disponible', description: 'El navegador no la permite aquí. Prueba con F11.' });
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {
      toast({ tone: 'warning', title: 'No se pudo pasar a pantalla completa', description: 'El navegador lo ha impedido. Prueba con F11.' });
    });
  }, []);

  useEffect(() => {
    const bar = bottomBarRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setBottomInset(bar.offsetHeight + EDGE));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [derived.hasPages, error]);

  const sheetMode = viewer.mode === 'sheet';
  const disabled = error !== null || engine === null;

  const next = (): void => engine?.next();
  const prev = (): void => engine?.prev();

  const first = (): void => {
    if (sheetMode) setViewer({ sheetIndex: 0 });
    else engine?.goToSpread(0);
  };

  const last = (): void => {
    if (sheetMode) setViewer({ sheetIndex: Math.max(0, imposition.sheets.length - 1) });
    else engine?.goToSpread(leaves);
  };

  const changeMode = (mode: ViewerMode): void => {
    if (mode === viewer.mode) return;
    if (mode === 'reading') {
      setViewer({ mode });
      return;
    }
    const current = imposition.spreads[spread];
    const pages = [current?.left ?? null, current?.right ?? null].filter((page): page is number => page !== null);
    const page = pages.length > 0 ? Math.min(...pages) : 1;
    const placement = imposition.placements[page - 1];
    setViewer(placement ? { mode, sheetIndex: placement.sheetIndex, face: placement.face } : { mode });
  };

  const flipFace = (): void => setViewer({ face: viewer.face === 'front' ? 'back' : 'front' });

  const toggleGuides = (): void => {
    const { guides } = viewer;
    const bleedAvailable = sheetMode && config.bleedMm > 0;
    const shown = (set: GuideVisibility): boolean => set.trim || set.safe || (bleedAvailable && set.bleed);
    if (shown(guides)) {
      savedGuidesRef.current = guides;
      setGuides({ trim: false, safe: false, bleed: false });
      return;
    }
    const saved = savedGuidesRef.current;
    setGuides(saved && shown(saved) ? saved : { trim: true, safe: true, bleed: bleedAvailable });
  };

  const toggleLabels = (): void => setViewer({ labels: !viewer.labels });

  const togglePreset = (): void => engine?.setCameraPreset(preset === 'top' ? 'reading' : 'top');

  const jumpToPage = (pageNumber: number): void => {
    if (sheetMode) {
      const placement = imposition.placements[pageNumber - 1];
      if (placement) setViewer({ sheetIndex: placement.sheetIndex, face: placement.face });
      return;
    }
    engine?.goToPage(pageNumber);
  };

  const onSeek = (position: number, phase: 'drag' | 'commit'): void => {
    if (phase === 'drag') {
      draggingRef.current = true;
      setPreview(Math.round(position));
      return;
    }
    draggingRef.current = false;
    setPreview(null);
    engine?.goToSpread(Math.round(position));
  };

  const back = (): void => goToStep(3);

  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || disabled) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && isTextEntry(target)) return;
    const root = rootRef.current;
    const inStep = target === null || target === document.body || target === document.documentElement || (root !== null && root.contains(target));
    const inPanel = target !== null && styles.panel !== undefined && target.closest(`.${styles.panel}`) !== null;
    const inWorkArea = target instanceof HTMLElement && target.tagName === 'MAIN';
    if (!inStep && !inPanel && !inWorkArea) return;
    const owner = event.key === ' ' ? OWNS_SPACE : OWNS_ARROWS;
    const onControl = target !== null && target !== host && target.closest(owner) !== null;

    const navigation: Record<string, (() => void) | undefined> = {
      ArrowRight: rtl ? prev : next,
      ArrowLeft: rtl ? next : prev,
      PageDown: next,
      PageUp: prev,
      ' ': event.shiftKey ? prev : next,
      Home: first,
      End: last,
    };
    const navigate = navigation[event.key];
    if (navigate) {
      if (onControl || inPanel) return;
      event.preventDefault();
      navigate();
      return;
    }

    let handled = true;
    switch (event.key.toLowerCase()) {
      case '+':
      case '=':
        engine?.zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
      case '−':
        engine?.zoomBy(1 / ZOOM_STEP);
        break;
      case '0':
        engine?.resetView();
        break;
      case 'c':
        togglePreset();
        break;
      case 'd':
        changeMode(sheetMode ? 'reading' : 'sheet');
        break;
      case 'r':
        if (sheetMode) flipFace();
        else handled = false;
        break;
      case 'g':
        toggleGuides();
        break;
      case 'e':
        if (!sheetMode) toggleLabels();
        else handled = false;
        break;
      case 'f':
        toggleFullscreen();
        break;
      case '?':
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          shortcutsReturnRef.current?.focus({ preventScroll: true });
          shortcutsReturnRef.current = null;
        } else {
          const focused = document.activeElement;
          shortcutsReturnRef.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
          setShortcutsOpen(true);
        }
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent): void => keyHandler.current(event);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);

  if (!derived.hasPages) {
    return (
      <section className={styles.root} aria-labelledby={`${descriptionId}-title`}>
        <h1 id={`${descriptionId}-title`} className="visually-hidden">
          Inspección 3D
        </h1>
        <div className={styles.centerLayer}>
          <EmptyState
            className={styles.emptyCard}
            icon={BookOpenText}
            title="Aún no hay páginas que hojear"
            description="El visor reconstruye la revista a partir de las páginas cargadas. Carga el PDF o las imágenes y vuelve aquí."
            actions={
              <Button variant="primary" iconStart={<Icon icon={Upload} />} onClick={() => goToStep(2)}>
                Ir a carga
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  const shownSpread = preview ?? spread;

  return (
    <section ref={rootRef} className={styles.root} data-fullscreen={fullscreen && active ? '' : undefined} aria-labelledby={`${descriptionId}-title`}>
      <h1 id={`${descriptionId}-title`} className="visually-hidden">
        Inspección 3D
      </h1>

      <div
        ref={setHost}
        className={styles.stage}
        role="application"
        tabIndex={error ? -1 : 0}
        aria-hidden={error ? true : undefined}
        aria-label="Visor 3D del ejemplar"
        aria-roledescription="visor 3D"
        aria-describedby={descriptionId}
      />
      <p id={descriptionId} hidden>
        {SHORTCUTS_DESCRIPTION}
      </p>

      <PageLabels ref={labelsRef} derived={derived} hover={hover} visible={viewer.labels && !sheetMode && !error} bottomInset={bottomInset} />

      {error && (
        <div className={styles.centerLayer}>
          <Callout
            tone="error"
            live
            className={styles.errorCard}
            title="No se puede mostrar el visor 3D"
            action={
              <Button variant="secondary" size="sm" onClick={back}>
                Volver a pliegos
              </Button>
            }
          >
            <p>{error}</p>
            <p>Activa la aceleración por hardware o prueba con otro navegador. La matriz de pliegos sigue disponible para revisar la imposición.</p>
          </Callout>
        </div>
      )}

      <div className={styles.overlay}>
        <div className={styles.top}>
          <div className={styles.topStart}>
            <LeftToolbar mode={viewer.mode} disabled={disabled} onBack={back} onModeChange={changeMode} />
          </div>
          {!error && (
            <div className={styles.topCenter}>
              <GuideWords
                imposition={imposition}
                mode={viewer.mode}
                spreadIndex={shownSpread}
                sheetIndex={viewer.sheetIndex}
                face={viewer.face}
                loading={loading}
                disabled={disabled}
                onJump={jumpToPage}
              />
            </div>
          )}
          {!error && (
            <div className={styles.topEnd}>
              <RightToolbar
                mode={viewer.mode}
                preset={preset}
                guides={viewer.guides}
                labels={viewer.labels}
                fullscreen={fullscreen}
                disabled={disabled}
                safeMarginMm={config.safeMarginMm}
                bleedMm={config.bleedMm}
                shortcutsOpen={shortcutsOpen}
                onShortcutsOpenChange={setShortcutsOpen}
                onPreset={(next) => engine?.setCameraPreset(next)}
                onZoom={(factor) => engine?.zoomBy(factor)}
                onReset={() => engine?.resetView()}
                onGuides={setGuides}
                onLabels={(labels) => setViewer({ labels })}
                onFullscreen={toggleFullscreen}
              />
            </div>
          )}
        </div>

        {!error && (
          <div className={styles.bottom}>
            <CantoBar
              ref={bottomBarRef}
              cantoRef={cantoRef}
              imposition={imposition}
              mode={viewer.mode}
              spreadIndex={viewer.spreadIndex}
              targetSpread={spread}
              previewSpread={preview}
              sheetIndex={viewer.sheetIndex}
              face={viewer.face}
              flags={derived.worstBySheet}
              highlightedSheet={hover.sheet}
              disabled={disabled}
              onSeek={onSeek}
              onPrev={prev}
              onNext={next}
              onSelectSheet={(sheetIndex) => setViewer({ sheetIndex })}
              onFaceChange={(face) => setViewer({ face })}
              onHoverSheet={(sheet) => setHover({ sheet, page: null })}
            />
          </div>
        )}
      </div>

      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </section>
  );
}

function selectImposition(state: ReturnType<typeof useProjectStore.getState>) {
  return selectDerived(state).imposition;
}
