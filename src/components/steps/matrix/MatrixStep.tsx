import { ArrowDownToLine, ArrowLeft, Box, FileStack, RotateCcw, Sparkles } from 'lucide-react';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

import { Canto } from '@/components/canto';
import { countText, mm } from '@/components/report/labels';
import { StepLayout } from '@/components/shell';
import { Button, Callout, EmptyState, Icon, Kbd, Skeleton, Spinner, Switch, tabId, tabPanelId, Tabs, Tooltip } from '@/components/ui';
import { useDerived, useProjectStore } from '@/lib/store';
import type { Derived } from '@/lib/store';
import type { SheetFace } from '@/lib/types';

import { buildSignatureBlocks, firstFlaggedPage, flaggedSheets, nextFlaggedSheet, pageRangeText, readingSpreads, sheetRangeText, type SlotModel } from './matrixModel';
import styles from './MatrixStep.module.css';
import { useMatrixUi, type MatrixView } from './matrixUi';
import { ReadingGrid } from './ReadingGrid';
import { SheetMatrix } from './SheetMatrix';
import { SheetTip } from './SheetTip';
import { SidePanel } from './SidePanel';
import { targetOf, useGridNavigation, type CellTarget } from './useGridNavigation';
import { useSheetReorder } from './useSheetReorder';

const TABS_ID = 'matriz-vista';
const VIEW_TABS = [
  { value: 'sheets' as const, label: 'Por pliego físico' },
  { value: 'reading' as const, label: 'Por orden de lectura' },
];

const NARROW_QUERY = '(max-width: 899px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function baseGuide(derived: Derived, binding: 'saddle-stitch' | 'perfect-bound'): string[] {
  const { imposition, pageCount, spine } = derived;
  const interior = imposition.signatures.filter((signature) => signature.role === 'interior').length;
  const hasCover = imposition.signatures.some((signature) => signature.role === 'cover');
  const signatures =
    binding === 'saddle-stitch'
      ? 'grapada a caballo'
      : `${countText(interior, 'cuadernillo', 'cuadernillos')}${hasCover ? ' + cubierta' : ''}`;
  return [`${pageCount} páginas`, countText(imposition.sheets.length, 'pliego', 'pliegos'), signatures, `lomo ${mm(spine.widthMm)}`];
}

export function MatrixStep() {
  const hasPages = useProjectStore((state) => state.pages.length > 0);
  const busy = useProjectStore((state) => state.ingest.busy);
  const goToStep = useProjectStore((state) => state.goToStep);
  const [attempt, setAttempt] = useState(0);

  if (!hasPages) return busy ? <LoadingMatrix /> : <EmptyMatrix />;

  return (
    <MatrixErrorBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)} onBack={() => goToStep(1)}>
      <MatrixWorkspace />
    </MatrixErrorBoundary>
  );
}

function MatrixWorkspace() {
  const derived = useDerived();
  const config = useProjectStore((state) => state.config);
  const ingest = useProjectStore((state) => state.ingest);
  const goToStep = useProjectStore((state) => state.goToStep);
  const setHover = useProjectStore((state) => state.setHover);
  const hoverSheet = useProjectStore((state) => state.hover.sheet);
  const dismissIngestMessages = useProjectStore((state) => state.dismissIngestMessages);
  const openPageInViewer = useProjectStore((state) => state.openPageInViewer);
  const openSheetInViewer = useProjectStore((state) => state.openSheetInViewer);

  const view = useMatrixUi((state) => state.view);
  const onlyIssues = useMatrixUi((state) => state.onlyIssues);
  const selectedPageRaw = useMatrixUi((state) => state.selectedPage);
  const activeSheet = useMatrixUi((state) => state.activeSheet);
  const locate = useMatrixUi((state) => state.locate);
  const visible = useMatrixUi((state) => state.visible);
  const ui = useMatrixUi.getState;

  const narrow = useMediaQuery(NARROW_QUERY);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const { imposition, pageCount, trim } = derived;
  const selectedPage = selectedPageRaw !== null && selectedPageRaw <= pageCount ? selectedPageRaw : null;

  const blocks = useMemo(() => buildSignatureBlocks(derived, config), [derived, config]);
  const spreads = useMemo(() => readingSpreads(imposition.spreads), [imposition]);
  const flagged = useMemo(() => flaggedSheets(derived), [derived]);
  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);
  const visibleSheets = onlyIssues ? flaggedSet : null;
  const filterEmpty = onlyIssues && flagged.length === 0;
  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';
  const reorder = useSheetReorder(scrollerRef, view === 'sheets' && !onlyIssues && !printer && !ingest.busy);

  const selectSlot = useCallback((slot: SlotModel) => {
    ui().selectPage(slot.page, slot.sheetIndex);
    ui().setTabbable(slot.page);
  }, [ui]);

  const openPage3d = useCallback((page: number) => openPageInViewer(page), [openPageInViewer]);
  const openSheet = useCallback((sheetIndex: number, face: SheetFace) => openSheetInViewer(sheetIndex, face), [openSheetInViewer]);

  const selectPage = useCallback(
    (page: number) => {
      const sheet = imposition.placements[page - 1]?.sheetIndex ?? null;
      ui().selectPage(page, sheet);
      ui().locatePage(page, sheet);
    },
    [imposition, ui],
  );

  const locatePage = useCallback(
    (page: number) => ui().locatePage(page, imposition.placements[page - 1]?.sheetIndex ?? null),
    [imposition, ui],
  );

  const goToNextFlagged = (): void => {
    const next = nextFlaggedSheet(flagged, activeSheet);
    if (next === null) return;
    const row = blocks.flatMap((block) => block.rows).find((candidate) => candidate.sheet.index === next);
    const page = row ? firstFlaggedPage(row) : null;
    if (page === null) {
      ui().locateSheet(next);
      return;
    }
    ui().selectPage(page, next);
    ui().locatePage(page, next);
  };

  const onGridKeyDown = useGridNavigation(scrollerRef, {
    onSelect: (target: CellTarget) => {
      ui().selectPage(target.page, target.sheet);
      ui().setTabbable(target.page);
    },
    onOpen3d: (target) => openPageInViewer(target.page),
    onOpenSheet: (target) => openSheetInViewer(target.sheet, target.face),
    onEscape: () => ui().selectPage(null),
    onMoveSheet: (target, delta) => {
      if (!reorder) return;
      const to = target.sheet + delta;
      if (target.sheet < reorder.range.first || to < reorder.range.first || to > reorder.range.last) return;
      reorder.move(target.sheet, to, { focus: true });
    },
  });

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    if (root.querySelector('[data-cell][tabindex="0"]')) return;
    const first = root.querySelector<HTMLElement>('[data-cell]');
    const target = first ? targetOf(first) : null;
    if (target) ui().setTabbable(target.page);
  });

  useEffect(() => {
    if (!locate) return;
    const root = scrollerRef.current;
    if (!root) return;
    const sheet = locate.sheet ?? (locate.page !== null ? (imposition.placements[locate.page - 1]?.sheetIndex ?? null) : null);
    if (onlyIssues && sheet !== null && !flaggedSet.has(sheet)) {
      ui().setOnlyIssues(false);
      return;
    }
    const element =
      locate.page !== null
        ? root.querySelector<HTMLElement>(`[data-cell][data-page="${locate.page}"]`)
        : view === 'sheets'
          ? root.querySelector<HTMLElement>(`[data-sheet-row="${sheet}"]`)
          : root.querySelector<HTMLElement>(`[data-cell][data-sheet="${sheet}"]`);
    if (element) {
      element.scrollIntoView({ block: 'center' });
      const frame = requestAnimationFrame(() => element.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
      if (locate.focus && element.matches('[data-cell]')) element.focus({ preventScroll: true });
      const timer = window.setTimeout(() => ui().clearLocate(locate.nonce), 2400);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }
    ui().clearLocate(locate.nonce);
    return undefined;
  }, [locate, view, onlyIssues, flaggedSet, imposition, ui]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const selector = view === 'sheets' ? '[data-sheet-row]' : '[data-spread]';
    const shown = new Set<Element>();
    const publish = (): void => {
      let first = Infinity;
      let last = -Infinity;
      for (const element of shown) {
        const el = element as HTMLElement;
        const low = view === 'sheets' ? Number(el.dataset['sheetRow']) + 1 : Number(el.dataset['firstPage']);
        const high = view === 'sheets' ? low : Number(el.dataset['lastPage']);
        if (low < first) first = low;
        if (high > last) last = high;
      }
      ui().setVisible(Number.isFinite(first) && Number.isFinite(last) ? { view, first, last } : null);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) shown.add(entry.target);
          else shown.delete(entry.target);
        }
        publish();
      },
      { threshold: 0.35 },
    );
    root.querySelectorAll(selector).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [view, blocks, spreads, onlyIssues, ui]);

  const guide = [...baseGuide(derived, config.binding)];
  if (onlyIssues) guide.push(`filtro: ${countText(flagged.length, 'pliego con incidencias', 'pliegos con incidencias')}`);
  if (visible && visible.view === view && !filterEmpty) {
    guide.push(`a la vista: ${view === 'sheets' ? sheetRangeText(visible.first, visible.last) : pageRangeText(visible.first, visible.last)}`);
  }

  const nextReason = flagged.length === 0 ? 'Ningún pliego tiene incidencias' : undefined;
  const canto = (
    <Canto
      imposition={imposition}
      unit="sheet"
      orientation={narrow ? 'horizontal' : 'vertical'}
      size="md"
      selectedSheet={activeSheet}
      onSelectSheet={(index) => ui().locateSheet(index)}
      highlightedSheet={hoverSheet}
      onHoverSheet={(index) => setHover({ sheet: index, page: null })}
      flags={derived.worstBySheet}
      renderTip={({ sheetIndex }) => <SheetTip imposition={imposition} sheetIndex={sheetIndex} worst={derived.worstBySheet.get(sheetIndex)} />}
      ariaLabel="Pliegos en orden de alzado: elige uno para llevar la matriz hasta él"
      className={styles.cantoList}
    />
  );

  return (
    <StepLayout
      title="Pliegos"
      guide={guide}
      flush
      backAction={
        <Button variant="secondary" iconStart={<Icon icon={ArrowLeft} />} onClick={() => goToStep(2)}>
          Atrás
        </Button>
      }
      footerNote={
        ingest.busy ? (
          <span className={styles.busy} role="status">
            <Spinner size={14} /> Analizando archivos{ingest.progress ? ` · ${ingest.progress.done} de ${ingest.progress.total}` : '…'}
          </span>
        ) : (
          <span className={styles.keys} aria-hidden="true">
            <Kbd>←↑↓→</Kbd> recorrer <Kbd>Intro</Kbd> detalle <Kbd>V</Kbd> en 3D <Kbd>D</Kbd> despiece{reorder && (
              <>
                {' '}
                <Kbd>Alt+↑↓</Kbd> mover pliego
              </>
            )}
          </span>
        )
      }
      primaryAction={
        <Button variant="primary" iconStart={<Icon icon={Box} />} onClick={() => goToStep(4)}>
          Inspeccionar en 3D
        </Button>
      }
    >
      <div className={styles.workspace} style={{ '--page-aspect': trim.widthMm / trim.heightMm } as CSSProperties} data-narrow={narrow ? '' : undefined}>
        {!narrow && (
          <nav className={styles.rail} aria-label="Índice de pliegos">
            {canto}
          </nav>
        )}

        <section className={styles.center} aria-label="Matriz de pliegos">
          {narrow && <div className={styles.railStrip}>{canto}</div>}
          {ingest.error && (
            <Callout
              tone="error"
              title="La última carga no se completó"
              className={styles.alert}
              onDismiss={dismissIngestMessages}
              action={
                <Button size="sm" variant="secondary" onClick={() => goToStep(2)}>
                  Ir a carga
                </Button>
              }
            >
              {ingest.error} La matriz muestra las páginas que ya estaban cargadas.
            </Callout>
          )}
          <div className={styles.toolbar}>
            <Tabs<MatrixView> items={VIEW_TABS} value={view} onChange={(value) => ui().setView(value)} idBase={TABS_ID} aria-label="Cómo leer la matriz" className={styles.tabs} />
            <div className={styles.tools}>
              <Switch
                checked={onlyIssues}
                onChange={(checked) => ui().setOnlyIssues(checked)}
                label={
                  <>
                    Solo pliegos con incidencias <span className={styles.toolCount}>{flagged.length}</span>
                  </>
                }
                disabled={flagged.length === 0 && !onlyIssues}
              />
              <Tooltip content={nextReason}>
                <Button size="sm" variant="secondary" iconStart={<Icon icon={ArrowDownToLine} size={14} />} onClick={goToNextFlagged} aria-disabled={flagged.length === 0 || undefined}>
                  Siguiente con incidencias
                </Button>
              </Tooltip>
            </div>
          </div>

          <div
            ref={scrollerRef}
            className={styles.scroller}
            role="tabpanel"
            id={tabPanelId(TABS_ID, view)}
            aria-labelledby={tabId(TABS_ID, view)}
            aria-describedby="matriz-teclado"
            onKeyDown={onGridKeyDown}
          >
            <p id="matriz-teclado" className="visually-hidden">
              Flechas para recorrer las casillas, Intro para ver el detalle, V para abrir la página en 3D, D para abrir su cara en despiece, Escape para cerrar el detalle. En la vista por pliego físico, Alt con flecha arriba o abajo mueve el pliego entero con sus cuatro páginas, y la revista se renumera.
            </p>
            {filterEmpty ? (
              <EmptyState
                icon={Sparkles}
                title="Ningún pliego tiene incidencias"
                description="El filtro no deja nada a la vista: todos los pliegos han pasado el pre-vuelo."
                actions={
                  <Button size="sm" variant="secondary" onClick={() => ui().setOnlyIssues(false)}>
                    Ver todos los pliegos
                  </Button>
                }
                className={styles.filterEmpty}
              />
            ) : view === 'sheets' ? (
              <SheetMatrix blocks={blocks} pageCount={pageCount} visibleSheets={visibleSheets} onSelect={selectSlot} onOpen3d={openPage3d} onOpenSheet={openSheet} reorder={reorder} />
            ) : (
              <ReadingGrid derived={derived} config={config} spreads={spreads} visibleSheets={visibleSheets} onSelect={selectSlot} onOpen3d={openPage3d} />
            )}
          </div>
        </section>

        <SidePanel derived={derived} selectedPage={selectedPage} onClose={() => ui().selectPage(null)} onSelectPage={selectPage} onLocatePage={locatePage} />
      </div>
    </StepLayout>
  );
}

function EmptyMatrix() {
  const goToStep = useProjectStore((state) => state.goToStep);
  const loadDemo = useProjectStore((state) => state.loadDemo);
  const [loading, setLoading] = useState(false);
  return (
    <StepLayout title="Pliegos" guide={['sin páginas']}>
      <EmptyState
        icon={FileStack}
        title="Aún no hay pliegos que comprobar"
        description="La matriz se llena al cargar las páginas: cada pliego con su cara y su retiro, en espejo respecto al lomo, y el pre-vuelo con lo que haya que corregir."
        actions={
          <>
            <Button variant="primary" onClick={() => goToStep(2)}>
              Ir a carga
            </Button>
            <Button
              variant="secondary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                void loadDemo({ pageCount: 24 })
                  .then(() => goToStep(3))
                  .finally(() => setLoading(false));
              }}
            >
              Probar con la revista de ejemplo
            </Button>
          </>
        }
        footnote="Tus archivos no salen del navegador."
        className={styles.empty}
      />
    </StepLayout>
  );
}

function LoadingMatrix() {
  const progress = useProjectStore((state) => state.ingest.progress);
  return (
    <StepLayout title="Pliegos" guide={[progress ? `analizando ${progress.fileName} · ${progress.done} de ${progress.total}` : 'analizando archivos…']} flush>
      <div className={styles.workspace} aria-busy="true">
        <div className={styles.rail}>
          <Skeleton lines={8} />
        </div>
        <div className={styles.center}>
          <div className={styles.skeletonRows}>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={styles.skeletonRow}>
                <Skeleton width="3.5rem" height="1.75rem" shape="block" />
                <Skeleton shape="block" aspectRatio={1.414} />
                <Skeleton shape="block" aspectRatio={1.414} />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sideSkeleton}>
          <Skeleton shape="block" height="5rem" />
          <Skeleton lines={4} />
        </div>
      </div>
    </StepLayout>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
  onBack: () => void;
}

class MatrixErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('El paso «Pliegos» no se pudo pintar.', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <StepLayout title="Pliegos" guide={['no se pudo calcular la imposición']}>
        <div className={styles.errorBox}>
          <Callout
            tone="error"
            title="No se pudo dibujar la matriz de pliegos"
            action={
              <>
                <Button size="sm" variant="secondary" iconStart={<Icon icon={RotateCcw} size={14} />} onClick={this.props.onRetry}>
                  Reintentar
                </Button>
                <Button size="sm" variant="secondary" onClick={this.props.onBack}>
                  Revisar la configuración
                </Button>
              </>
            }
          >
            {error.message || 'Error desconocido.'} Revisa la encuadernación y el total de páginas en la configuración; tus archivos siguen cargados.
          </Callout>
        </div>
      </StepLayout>
    );
  }
}
