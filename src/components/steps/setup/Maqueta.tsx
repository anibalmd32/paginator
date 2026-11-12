import { ArrowRight, CircleAlert, FileWarning } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react';

import { buildCantoModel, Canto, formatPageRuns } from '@/components/canto';
import { Button, Callout, Icon, Spinner, Tag } from '@/components/ui';
import { PREVIEW_PAGE_COUNT, useDerived, useProjectStore } from '@/lib/store';
import type { ImpositionResult, SheetImposition, SignatureInfo } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import styles from './Maqueta.module.css';
import { capacityOf, densityFor, formatSpine, formatTrimNumbers, matchTrimPreset, plural, sheetAriaLabel, slotKindOf, type SheetDensity, type SlotKind } from './setupModel';
import { SheetSchematic } from './SheetSchematic';

export function Maqueta() {
  const config = useProjectStore((state) => state.config);
  const isDemo = useProjectStore((state) => state.isDemo);
  const ingest = useProjectStore((state) => state.ingest);
  const hover = useProjectStore((state) => state.hover);
  const setHover = useProjectStore((state) => state.setHover);
  const goToStep = useProjectStore((state) => state.goToStep);
  const dismissIngestMessages = useProjectStore((state) => state.dismissIngestMessages);
  const derived = useDerived();
  const { imposition, trim, spine, hasPages } = derived;

  const capacity = capacityOf({
    hasPages,
    supplied: derived.suppliedPageCount,
    declared: config.declaredPageCount,
    preview: PREVIEW_PAGE_COUNT,
  });

  const blankSet = useMemo(() => new Set(derived.blankPageNumbers), [derived.blankPageNumbers]);
  const kindOf = useCallback(
    (page: number): SlotKind => slotKindOf(page, blankSet, derived.effectivePages, config.autoPadBlanks),
    [blankSet, derived.effectivePages, config.autoPadBlanks],
  );
  const courtesyCount = derived.blankPageNumbers.filter((page) => kindOf(page) !== 'blank').length;

  const perfect = imposition.binding === 'perfect-bound';
  const interiorSignatures = imposition.signatures.filter((signature) => signature.role === 'interior').length;
  const preset = matchTrimPreset(trim);
  const formatLabel = config.trim.mode === 'auto' ? (hasPages ? 'formato deducido' : 'formato supuesto') : preset ? `formato ${preset.label}` : 'formato a medida';

  useEffect(() => () => setHover({ page: null, sheet: null }), [setHover]);

  const busy = ingest.busy;
  const progress = ingest.progress;
  const loadingText = ingest.source === 'demo' ? 'Componiendo la revista de ejemplo…' : 'Leyendo archivos…';
  const density = densityFor(imposition.sheets.length);

  const onHoverCanto = useCallback(
    (sheet: number | null): void => {
      if (sheet === null && useProjectStore.getState().hover.page !== null) return;
      setHover({ sheet, page: null });
    },
    [setHover],
  );

  return (
    <section className={styles.panel} aria-labelledby="setup-maqueta-title">
      <header className={styles.head}>
        <div className={styles.titles}>
          <h2 id="setup-maqueta-title" className={styles.title}>
            Maqueta
          </h2>
          <p className={styles.source}>{hasPages ? 'Según los archivos cargados' : `Previsión con ${String(capacity.wanted)} ${plural(capacity.wanted, 'página', 'páginas')}`}</p>
        </div>
        <div className={styles.headAside}>
          {busy ? (
            <span className={styles.loading} role="status">
              <Spinner size={14} />
              {progress && progress.total > 0 ? `${loadingText} ${String(progress.done)} de ${String(progress.total)}` : loadingText}
            </span>
          ) : isDemo ? (
            <Tag>Revista de ejemplo · sintética</Tag>
          ) : null}
        </div>
      </header>

      {ingest.error && !busy && (
        <Callout
          tone="error"
          compact
          className={styles.callout}
          title="No se pudieron leer los archivos"
          action={
            <Button size="sm" iconEnd={<Icon icon={ArrowRight} size={14} />} onClick={() => goToStep(2)}>
              Ir a carga
            </Button>
          }
          onDismiss={dismissIngestMessages}
        >
          {ingest.error} {hasPages ? 'La maqueta sigue con los archivos que ya estaban cargados.' : 'La maqueta sigue con la previsión.'}
        </Callout>
      )}

      <dl className={styles.readings} aria-label="Lecturas del trabajo">
        <Reading value={String(derived.pageCount)} label={courtesyCount === 0 ? 'páginas' : config.autoPadBlanks ? `páginas · ${String(courtesyCount)} ${plural(courtesyCount, 'cortesía', 'cortesías')}` : `páginas · ${plural(courtesyCount, 'falta', 'faltan')} ${String(courtesyCount)}`} />
        <Reading value={String(imposition.sheets.length)} label={plural(imposition.sheets.length, 'pliego', 'pliegos')} />
        <Reading
          value={String(perfect ? interiorSignatures : 1)}
          label={
            perfect
              ? `${plural(interiorSignatures, 'cuadernillo', 'cuadernillos')}${config.separateCover ? ' + cubierta' : ''}`
              : 'cuadernillo'
          }
        />
        <Reading value={formatSpine(spine.widthMm)} unit="mm" label="lomo" />
        <Reading value={formatTrimNumbers(trim)} unit="mm" label={formatLabel} wide />
      </dl>

      <div className={styles.canto} dir={imposition.readingDirection === 'rtl' ? 'rtl' : 'ltr'}>
        <p className={styles.cantoLabel} dir="ltr">
          Canto
          <span className={styles.cantoCount}>
            {imposition.pageCount / 2} {plural(imposition.pageCount / 2, 'hoja', 'hojas')}
          </span>
        </p>
        <Canto
          className={styles.cantoStrip}
          imposition={imposition}
          unit="leaf"
          orientation="horizontal"
          highlightedSheet={hover.sheet}
          onHoverSheet={onHoverCanto}
        />
      </div>

      <SheetGrid
        imposition={imposition}
        kindOf={kindOf}
        pageAspect={clampAspect(trim.widthMm / trim.heightMm)}
        density={density}
        busy={busy}
        highlightedSheet={hover.sheet}
        highlightedPage={hover.page}
        onHover={(page, sheet) => setHover({ page, sheet })}
      />

      <footer className={styles.foot}>
        <StatusLine imposition={imposition} kindOf={kindOf} page={hover.page} sheet={hover.sheet} />
        {courtesyCount > 0 && (
          <ul className={styles.legend} aria-label="Leyenda de casillas">
            {config.autoPadBlanks ? (
              <li>
                <span className={styles.keyCourtesy} aria-hidden="true" />
                cortesía: blanca que cierra el pliego
              </li>
            ) : (
              <li className={styles.legendError}>
                <span className={styles.keyMissing} aria-hidden="true" />
                <Icon icon={CircleAlert} size={12} />
                falta: el pliego queda abierto
              </li>
            )}
          </ul>
        )}
      </footer>
    </section>
  );
}

function clampAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 210 / 297;
  return Math.min(1.4, Math.max(0.5, aspect));
}

function wideBoost(aspect: number): number {
  return aspect > 1 ? Math.min(1.5, Math.sqrt(aspect / (210 / 297))) : 1;
}

function Reading({ value, unit, label, wide = false }: { value: string; unit?: string; label: string; wide?: boolean }) {
  return (
    <div className={cx(styles.reading, wide && styles.readingWide)}>
      <dt className={styles.readingLabel}>{label}</dt>
      <dd className={styles.readingValue}>
        <span key={value} className={styles.tick}>
          {value}
        </span>
        {unit && <span className={styles.unit}>{unit}</span>}
      </dd>
    </div>
  );
}

interface SheetGridProps {
  imposition: ImpositionResult;
  kindOf: (page: number) => SlotKind;
  pageAspect: number;
  density: SheetDensity;
  busy: boolean;
  highlightedSheet: number | null;
  highlightedPage: number | null;
  onHover: (page: number | null, sheet: number | null) => void;
}

interface SheetGroup {
  signature: SignatureInfo;
  sheets: SheetImposition[];
  title: string;
  pages: string;
  tag: { cover: true } | { signature: number } | null;
}

function SheetGrid({ imposition, kindOf, pageAspect, density, busy, highlightedSheet, highlightedPage, onHover }: SheetGridProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const rtl = imposition.readingDirection === 'rtl';
  const stockBySheet = useMemo(() => {
    const model = buildCantoModel(imposition, 'sheet');
    return new Map(model.slices.map((slice) => [slice.sheetIndex, slice]));
  }, [imposition]);

  const groups = useMemo<SheetGroup[]>(() => {
    const multiple = imposition.signatures.length > 1;
    let interiorOrdinal = 0;
    return imposition.signatures.map((signature) => {
      const sheets = imposition.sheets.slice(signature.firstSheetIndex, signature.firstSheetIndex + signature.sheets);
      const stockName = stockBySheet.get(signature.firstSheetIndex)?.stockName ?? '';
      if (signature.role === 'cover') {
        return { signature, sheets, title: `Cubierta · ${stockName}`, pages: formatPageRuns(signature.pageNumbers), tag: multiple ? { cover: true } : null };
      }
      const ordinal = interiorOrdinal;
      interiorOrdinal += 1;
      return {
        signature,
        sheets,
        title: `Cuadernillo ${String(ordinal + 1)} · ${stockName}`,
        pages: formatPageRuns(signature.pageNumbers),
        tag: multiple ? { signature: ordinal } : null,
      };
    });
  }, [imposition, stockBySheet]);

  const showHeaders = imposition.signatures.length > 1;
  const activeIndex = Math.min(focusIndex, imposition.sheets.length - 1);

  const neighbour = (from: number, key: string): number | null => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-sheet]') ?? [])];
    const current = items[from];
    if (!current) return null;
    if (key === 'Home') return 0;
    if (key === 'End') return items.length - 1;
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (key === forward) return Math.min(items.length - 1, from + 1);
    if (key === backward) return Math.max(0, from - 1);
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
    const box = current.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    let bestIndex: number | null = null;
    let bestDy = Infinity;
    let bestDx = Infinity;
    for (const [index, item] of items.entries()) {
      const rect = item.getBoundingClientRect();
      const dy = key === 'ArrowDown' ? rect.top - box.top : box.top - rect.top;
      if (dy <= 1) continue;
      const dx = Math.abs(rect.left + rect.width / 2 - centre);
      if (dy < bestDy - 1 || (Math.abs(dy - bestDy) <= 1 && dx < bestDx)) {
        bestIndex = index;
        bestDy = dy;
        bestDx = dx;
      }
    }
    return bestIndex;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number): void => {
    const next = neighbour(index, event.key);
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    listRef.current?.querySelectorAll<HTMLElement>('[data-sheet]')[next]?.focus();
  };

  const onFocus = (index: number, sheet: SheetImposition) => (event: FocusEvent<HTMLLIElement>) => {
    setFocusIndex(index);
    if (event.target === event.currentTarget) onHover(null, sheet.index);
  };

  const onBlur = (event: FocusEvent<HTMLLIElement>): void => {
    if (!listRef.current?.contains(event.relatedTarget as Node | null)) onHover(null, null);
  };

  let flatIndex = -1;
  return (
    <div
      ref={listRef}
      className={cx(styles.sheets, styles[`density-${density}`])}
      style={{ '--wide': wideBoost(pageAspect) } as CSSProperties}
      dir={rtl ? 'rtl' : 'ltr'}
      aria-busy={busy ? true : undefined}
      onPointerLeave={() => onHover(null, null)}
    >
      {groups.map((group) => (
        <div key={group.signature.index} className={styles.group} role="group" aria-label={showHeaders ? `${group.title}, págs. ${group.pages}` : 'Pliegos en orden de alzado'}>
          {showHeaders && (
            <p className={styles.groupHead}>
              {group.tag && 'cover' in group.tag ? <Tag size="sm" cover>{group.title}</Tag> : group.tag ? <Tag size="sm" signature={group.tag.signature}>{group.title}</Tag> : null}
              {group.signature.role !== 'cover' && <span className={styles.groupPages}>págs. {group.pages}</span>}
            </p>
          )}
          <ul className={styles.grid}>
            {group.sheets.map((sheet) => {
              flatIndex += 1;
              const index = flatIndex;
              const stock = stockBySheet.get(sheet.index);
              return (
                <SheetSchematic
                  key={sheet.index}
                  sheet={sheet}
                  kindOf={kindOf}
                  pageAspect={pageAspect}
                  density={density}
                  rtl={rtl}
                  showRole={!showHeaders}
                  stockFill={stock?.fill ?? 'var(--stock-neutral)'}
                  stockInk={stock?.ink ?? 'var(--on-stock-neutral)'}
                  highlighted={highlightedSheet === sheet.index}
                  highlightedPage={highlightedPage}
                  ariaLabel={sheetAriaLabel(sheet, kindOf)}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onHoverPage={(page, sheetIndex) => onHover(page, page === null ? null : sheetIndex)}
                  onFocus={onFocus(index, sheet)}
                  onBlur={onBlur}
                  onKeyDown={(event) => onKeyDown(event, index)}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const SLOT_SIDE = { left: 'izquierda', right: 'derecha' } as const;
const FACE_NAME = { front: 'cara', back: 'retiro' } as const;

function StatusLine({ imposition, kindOf, page, sheet }: { imposition: ImpositionResult; kindOf: (page: number) => SlotKind; page: number | null; sheet: number | null }) {
  const multiple = imposition.signatures.length > 1;
  if (page !== null) {
    const placement = imposition.placements[page - 1];
    const target = placement ? imposition.sheets[placement.sheetIndex] : undefined;
    if (placement && target) {
      const kind = kindOf(page);
      return (
        <p className={styles.status}>
          <strong className={styles.statusStrong}>Pág. {page}</strong>
          {kind === 'courtesy' && <span className={styles.statusMuted}>cortesía</span>}
          {kind === 'missing' && (
            <span className={styles.statusError}>
              <Icon icon={FileWarning} size={12} /> falta
            </span>
          )}
          <Icon icon={ArrowRight} size={12} className={styles.statusArrow} />
          <span>
            pliego {target.number} · {FACE_NAME[placement.face]} · {SLOT_SIDE[placement.position]}
            {multiple ? ` · ${signatureName(imposition, placement.signature)}` : ''}
          </span>
        </p>
      );
    }
  }
  if (sheet !== null) {
    const target = imposition.sheets[sheet];
    if (target) {
      return (
        <p className={styles.status}>
          <strong className={styles.statusStrong}>Pliego {target.number}</strong>
          <span>
            cara {target.front.left} | {target.front.right} · retiro {target.back.left} | {target.back.right}
          </span>
        </p>
      );
    }
  }
  return <p className={cx(styles.status, styles.statusHint)}>Pasa por una casilla para ver su folio de lectura y su sitio en el pliego.</p>;
}

function signatureName(imposition: ImpositionResult, signatureIndex: number): string {
  if (imposition.signatures[signatureIndex]?.role === 'cover') return 'cubierta';
  const ordinal = imposition.signatures.slice(0, signatureIndex).filter((signature) => signature.role === 'interior').length;
  return `cuadernillo ${String(ordinal + 1)}`;
}
