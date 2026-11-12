import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties, KeyboardEvent, Ref } from 'react';

import { Canto, type CantoHandle } from '@/components/canto';
import { PageThumb } from '@/components/page/PageThumb';
import { Icon, IconButton, Kbd, SegmentedControl } from '@/components/ui';
import type { ImpositionResult, IssueSeverity, SheetFace, Spread, ViewerMode } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { FACE_TEXT, openingOf, openingShortText, placementText, sheetSideText } from './labels';
import styles from './ViewerStep.module.css';

export interface CantoBarProps {
  imposition: ImpositionResult;
  mode: ViewerMode;
  spreadIndex: number;
  previewSpread: number | null;
  targetSpread: number;
  sheetIndex: number;
  face: SheetFace;
  flags: ReadonlyMap<number, IssueSeverity>;
  highlightedSheet: number | null;
  disabled: boolean;
  onSeek: (position: number, phase: 'drag' | 'commit') => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectSheet: (sheetIndex: number) => void;
  onFaceChange: (face: SheetFace) => void;
  onHoverSheet: (sheetIndex: number | null) => void;
  cantoRef: Ref<CantoHandle>;
  ref?: Ref<HTMLDivElement>;
}

const FACE_OPTIONS = [
  { value: 'front', label: 'Cara', hint: 'Exterior del pliego: la que entra primero en máquina' },
  { value: 'back', label: 'Retiro', hint: 'Interior del pliego: se imprime al dar la vuelta a la hoja' },
] as const;

function SpreadTip({ imposition, spread }: { imposition: ImpositionResult; spread: Spread }) {
  const opening = openingOf(imposition, spread.index);
  const slots = [spread.left, spread.right];
  return (
    <span className={styles.tip}>
      <span className={styles.tipPages}>
        {slots.map((page, index) =>
          page === null ? (
            <span key={index} className={styles.tipVoid} />
          ) : (
            <PageThumb key={index} pageNumber={page} lazy={false} className={cx(styles.tipThumb)} />
          ),
        )}
      </span>
      <strong className={styles.tipTitle}>{openingShortText(opening)}</strong>
      {slots.map((page) =>
        page === null ? null : (
          <span key={page} className={styles.tipLine}>
            <span className={styles.tipFolio}>{page}</span> {placementText(imposition, page)}
          </span>
        ),
      )}
    </span>
  );
}

function SheetTip({ imposition, sheetIndex, face }: { imposition: ImpositionResult; sheetIndex: number; face: SheetFace }) {
  const sheet = imposition.sheets[sheetIndex];
  if (!sheet) return null;
  const side = face === 'front' ? sheet.front : sheet.back;
  return (
    <span className={styles.tip}>
      <span className={styles.tipPages}>
        <PageThumb pageNumber={side.left} lazy={false} className={cx(styles.tipThumb)} />
        <PageThumb pageNumber={side.right} lazy={false} className={cx(styles.tipThumb)} />
      </span>
      <strong className={styles.tipTitle}>
        Pliego {sheet.number} · {FACE_TEXT[face]}
      </strong>
      <span className={styles.tipLine}>págs. {sheetSideText(imposition, sheetIndex, face)}</span>
    </span>
  );
}

export function CantoBar({
  imposition,
  mode,
  spreadIndex,
  targetSpread,
  previewSpread,
  sheetIndex,
  face,
  flags,
  highlightedSheet,
  disabled,
  onSeek,
  onPrev,
  onNext,
  onSelectSheet,
  onFaceChange,
  onHoverSheet,
  cantoRef,
  ref,
}: CantoBarProps) {
  const rtl = imposition.readingDirection === 'rtl';
  const leaves = Math.floor(imposition.pageCount / 2);
  const sheetMode = mode === 'sheet';
  const atStart = sheetMode ? sheetIndex <= 0 : targetSpread <= 0;
  const atEnd = sheetMode ? sheetIndex >= imposition.sheets.length - 1 : targetSpread >= leaves;
  const prevIcon = rtl ? ChevronRight : ChevronLeft;
  const nextIcon = rtl ? ChevronLeft : ChevronRight;
  const prevKey = rtl ? '→' : '←';
  const nextKey = rtl ? '←' : '→';

  const onReadingKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (sheetMode || disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const forward = event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
    const backward = event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
    if (!forward && !backward) return;
    event.preventDefault();
    event.stopPropagation();
    if (forward) onNext();
    else onPrev();
  };

  return (
    <div ref={ref} className={cx(styles.float, styles.cantoBar)} dir={rtl ? 'rtl' : 'ltr'} data-mode={mode}>
      {sheetMode && (
        <div dir="ltr" className={styles.faceControl}>
          <SegmentedControl options={FACE_OPTIONS} value={face} onChange={onFaceChange} size="sm" aria-label="Cara del pliego a la vista" disabled={disabled} />
        </div>
      )}
      <IconButton
        size="sm"
        label={sheetMode ? 'Pliego anterior' : 'Anterior'}
        icon={<Icon icon={prevIcon} />}
        tooltipExtra={<Kbd inverse>{prevKey}</Kbd>}
        tooltipPlacement="top"
        onClick={onPrev}
        disabled={disabled || atStart}
      />
      <div className={styles.cantoSlot} style={{ '--leaves': leaves } as CSSProperties} onKeyDownCapture={onReadingKeys}>
        {sheetMode ? (
          <Canto
            key="sheet"
            imposition={imposition}
            unit="leaf"
            orientation="horizontal"
            selectedSheet={sheetIndex}
            highlightedSheet={highlightedSheet}
            onSelectSheet={onSelectSheet}
            onHoverSheet={onHoverSheet}
            flags={flags}
            ariaLabel={`Canto del ejemplar: pliego ${imposition.sheets[sheetIndex]?.number ?? sheetIndex + 1} de ${imposition.sheets.length} marcado`}
            renderTip={({ sheetIndex: hovered }) => <SheetTip imposition={imposition} sheetIndex={hovered} face={face} />}
          />
        ) : (
          <Canto
            key="reading"
            ref={cantoRef}
            imposition={imposition}
            unit="leaf"
            orientation="horizontal"
            position={spreadIndex}
            {...(disabled ? {} : { onSeek })}
            highlightedSheet={highlightedSheet}
            onHoverSheet={onHoverSheet}
            flags={flags}
            ariaLabel="Posición en el ejemplar"
            renderTip={({ spread }) => {
              const shown = previewSpread !== null ? (imposition.spreads[previewSpread] ?? spread) : spread;
              return shown ? <SpreadTip imposition={imposition} spread={shown} /> : null;
            }}
          />
        )}
      </div>
      <IconButton
        size="sm"
        label={sheetMode ? 'Pliego siguiente' : 'Siguiente'}
        icon={<Icon icon={nextIcon} />}
        tooltipExtra={<Kbd inverse>{nextKey}</Kbd>}
        tooltipPlacement="top"
        onClick={onNext}
        disabled={disabled || atEnd}
      />
    </div>
  );
}
