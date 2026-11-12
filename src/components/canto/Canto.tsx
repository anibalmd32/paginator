import { Flag } from 'lucide-react';
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

import { placeFloating, useFloatingPosition } from '@/components/ui/floating';
import { Icon } from '@/components/ui/Icon';
import { Tag } from '@/components/ui/Tag';
import type { ImpositionResult, IssueSeverity, Spread } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import styles from './Canto.module.css';
import { buildCantoModel, formatPageRuns, openingLabel, positionToWeight, SEVERITY_TEXT, sliceAtWeight, weightToPosition, type CantoModel, type CantoSlice } from './cantoModel';

export interface CantoProps {
  imposition: ImpositionResult;
  unit: 'leaf' | 'sheet';
  orientation: 'horizontal' | 'vertical';
  size?: 'sm' | 'md';
  position?: number;
  onSeek?: (position: number, phase: 'drag' | 'commit') => void;
  selectedSheet?: number | null;
  onSelectSheet?: (sheetIndex: number) => void;
  highlightedSheet?: number | null;
  onHoverSheet?: (sheetIndex: number | null) => void;
  flags?: ReadonlyMap<number, IssueSeverity>;
  renderTip?: (target: { leafIndex: number | null; sheetIndex: number; spread: Spread | null }) => ReactNode;
  ariaLabel?: string;
  className?: string | undefined;
  ref?: Ref<CantoHandle>;
}

export interface CantoHandle {
  setPosition(position: number): void;
}

const OPENING_GAP = { sm: 10, md: 14 } as const;
const SIGNATURE_GAP = 4;
const MAX_SLICE = { sm: 12, md: 20 } as const;
const CLICK_SLOP = 4;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export function Canto(props: CantoProps) {
  const { imposition, unit, orientation } = props;
  const model = useMemo(() => buildCantoModel(imposition, unit), [imposition, unit]);
  if (unit === 'sheet' && orientation === 'vertical') return <SheetList {...props} model={model} />;
  return <CantoStrip {...props} model={model} />;
}

function defaultTip(model: CantoModel, slice: CantoSlice, imposition: ImpositionResult, flag: IssueSeverity | undefined): ReactNode {
  const sheet = imposition.sheets[slice.sheetIndex];
  const sheetText = sheet ? `Pliego ${sheet.number}${slice.isCover ? ' · cubierta' : ''}` : '';
  const head = slice.leafIndex !== null ? `Hoja ${slice.leafIndex + 1} · págs. ${formatPageRuns(slice.pages)}` : `Págs. ${formatPageRuns(slice.pages)}`;
  const signatureText = model.slices.some((other) => other.signature !== slice.signature) ? `${slice.isCover && slice.interiorOrdinal === null ? 'Cubierta' : `Cuadernillo ${(slice.interiorOrdinal ?? slice.signature) + 1}`} · ${slice.stockName}` : null;
  return (
    <span className={styles.tipText}>
      <strong>{head}</strong>
      <span>{[sheetText, signatureText].filter(Boolean).join(' · ')}</span>
      {flag && <span>Pliego {SEVERITY_TEXT[flag]}</span>}
    </span>
  );
}

function useHighlight(highlightedSheet: number | null | undefined, onHoverSheet: CantoProps['onHoverSheet']) {
  const [hoverSlice, setHoverSlice] = useState<CantoSlice | null>(null);
  const currentRef = useRef<CantoSlice | null>(null);
  const hover = useCallback(
    (slice: CantoSlice | null): void => {
      const previous = currentRef.current;
      if (previous?.index === slice?.index) return;
      currentRef.current = slice;
      if (previous?.sheetIndex !== slice?.sheetIndex) onHoverSheet?.(slice ? slice.sheetIndex : null);
      setHoverSlice(slice);
    },
    [onHoverSheet],
  );
  const highlight = hoverSlice ? hoverSlice.sheetIndex : (highlightedSheet ?? null);
  return { hoverSlice, hover, highlight };
}

function CantoStrip({
  imposition,
  unit,
  orientation,
  size = 'md',
  position,
  onSeek,
  selectedSheet = null,
  onSelectSheet,
  highlightedSheet,
  onHoverSheet,
  flags,
  renderTip,
  ariaLabel,
  className,
  ref,
  model,
}: CantoProps & { model: CantoModel }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef(position ?? 0);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const tipId = useId();
  const { hoverSlice, hover, highlight } = useHighlight(highlightedSheet, onHoverSheet);

  const isLeaf = unit === 'leaf';
  const hasPosition = isLeaf && position !== undefined;
  const isSlider = isLeaf && onSeek !== undefined;
  const isListbox = !isLeaf;
  const vertical = orientation === 'vertical';
  const rtl = model.rtl;
  const leafCount = model.leafCount;
  const gap = hasPosition ? OPENING_GAP[size] : unit === 'sheet' ? SIGNATURE_GAP * Math.max(0, model.signatureStarts.length - 1) : 0;

  const signatureOrdinal = useMemo(() => {
    const ordinals = new Map<number, number>();
    model.signatureStarts.forEach((start, ordinal) => ordinals.set(start, ordinal));
    let current = 0;
    return model.slices.map((slice) => {
      current = ordinals.get(slice.index) ?? current;
      return current;
    });
  }, [model]);

  const paint = useCallback(
    (next: number): void => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = clamp(next, 0, leafCount);
      positionRef.current = clamped;
      const opening = Math.round(clamped);
      track.style.setProperty('--opening', String(positionToWeight(model, opening)));
      for (const element of track.querySelectorAll<HTMLElement>('[data-slice]')) {
        const index = Number(element.dataset['slice']);
        const turned = index < opening;
        if (turned !== element.hasAttribute('data-turned')) element.toggleAttribute('data-turned', turned);
      }
      if (isSlider) {
        track.setAttribute('aria-valuenow', String(opening));
        track.setAttribute('aria-valuetext', openingLabel(imposition, opening));
      }
    },
    [imposition, isSlider, leafCount, model],
  );

  useImperativeHandle(ref, () => ({ setPosition: (next: number) => paint(next) }), [paint]);

  useLayoutEffect(() => {
    if (hasPosition && dragRef.current === null) paint(position ?? 0);
  }, [hasPosition, position, paint]);

  const weightAt = (clientX: number, clientY: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const length = vertical ? rect.height : rect.width;
    let offset = vertical ? clientY - rect.top : rtl ? rect.right - clientX : clientX - rect.left;
    offset -= gap / 2;
    const usable = Math.max(1, length - gap);
    return clamp((offset / usable) * model.totalWeight, 0, model.totalWeight);
  };

  const sliceAt = (clientX: number, clientY: number): CantoSlice | null => {
    const track = trackRef.current;
    if (!track) return null;
    const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-slice]');
    if (hit && track.contains(hit)) return model.slices[Number(hit.dataset['slice'])] ?? null;
    return sliceAtWeight(model, weightAt(clientX, clientY));
  };

  const seekFromPointer = (clientX: number, clientY: number, phase: 'drag' | 'commit'): void => {
    const fractional = clamp(weightToPosition(model, weightAt(clientX, clientY)), 0, leafCount);
    const value = phase === 'commit' ? Math.round(fractional) : fractional;
    paint(value);
    onSeek?.(value, phase);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    if (isSlider) {
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      seekFromPointer(event.clientX, event.clientY, 'drag');
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_SLOP) drag.moved = true;
      if (isSlider) {
        seekFromPointer(event.clientX, event.clientY, 'drag');
        hover(sliceAt(event.clientX, event.clientY));
        return;
      }
    }
    if (event.pointerType !== 'touch') hover(sliceAt(event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (isSlider) seekFromPointer(event.clientX, event.clientY, 'commit');
    if (!drag.moved && onSelectSheet) {
      const slice = sliceAt(event.clientX, event.clientY);
      if (slice) onSelectSheet(slice.sheetIndex);
    }
  };

  const onPointerCancel = (): void => {
    if (dragRef.current && isSlider) onSeek?.(Math.round(positionRef.current), 'commit');
    dragRef.current = null;
  };

  const activeSheetSlice = useMemo(() => model.slices.find((slice) => slice.sheetIndex === selectedSheet) ?? null, [model, selectedSheet]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const forwardKey = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const backwardKey = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    if (isSlider) {
      const current = Math.round(positionRef.current);
      const page = Math.max(1, Math.round(leafCount / 10));
      let next: number;
      switch (event.key) {
        case forwardKey:
        case vertical ? 'ArrowRight' : 'ArrowUp':
          next = current + 1;
          break;
        case backwardKey:
        case vertical ? 'ArrowLeft' : 'ArrowDown':
          next = current - 1;
          break;
        case 'PageUp':
          next = current + page;
          break;
        case 'PageDown':
          next = current - page;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = leafCount;
          break;
        default:
          return;
      }
      event.preventDefault();
      next = clamp(next, 0, leafCount);
      paint(next);
      onSeek?.(next, 'commit');
      return;
    }
    if (isListbox && onSelectSheet) {
      const sheets = model.slices;
      const index = activeSheetSlice ? activeSheetSlice.index : -1;
      let next: number;
      if (event.key === forwardKey) next = index + 1;
      else if (event.key === backwardKey) next = index <= 0 ? 0 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = sheets.length - 1;
      else return;
      event.preventDefault();
      const target = sheets[clamp(next, 0, sheets.length - 1)];
      if (target) onSelectSheet(target.sheetIndex);
    }
  };

  const tipSlice = hoverSlice;
  const getTipAnchor = useCallback((): Element | null => {
    if (!tipSlice) return null;
    return trackRef.current?.querySelector(`[data-slice="${tipSlice.index}"]`) ?? null;
  }, [tipSlice]);
  useFloatingPosition(tipSlice !== null, tipRef, getTipAnchor, { placement: vertical ? 'right' : 'top', gap: 10 });
  useLayoutEffect(() => {
    if (tipSlice) placeFloating(tipRef.current, getTipAnchor(), { placement: vertical ? 'right' : 'top', gap: 10 });
  }, [tipSlice, getTipAnchor, vertical]);

  const tipContent = tipSlice
    ? renderTip
      ? renderTip({ leafIndex: tipSlice.leafIndex, sheetIndex: tipSlice.sheetIndex, spread: tipSlice.leafIndex !== null ? (imposition.spreads[tipSlice.leafIndex] ?? null) : null })
      : defaultTip(model, tipSlice, imposition, flags?.get(tipSlice.sheetIndex))
    : null;

  const flaggedCount = flags ? [...new Set(model.slices.map((slice) => slice.sheetIndex))].filter((sheet) => flags.has(sheet)).length : 0;
  const summary = `${imposition.pageCount} páginas · ${imposition.sheets.length} ${imposition.sheets.length === 1 ? 'pliego' : 'pliegos'}${flaggedCount > 0 ? ` · ${flaggedCount} con incidencias` : ''}`;
  const label = ariaLabel ?? (isSlider ? 'Posición en el ejemplar' : isListbox ? 'Pliegos en orden de alzado' : `Canto del ejemplar: ${summary}`);
  const opening = Math.round(clamp(position ?? 0, 0, leafCount));
  const optionId = (slice: CantoSlice): string => `${tipId}-o${slice.index}`;

  const a11y = isSlider
    ? {
        role: 'slider',
        tabIndex: 0,
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': leafCount,
        'aria-valuenow': opening,
        'aria-valuetext': openingLabel(imposition, opening),
        'aria-orientation': orientation,
      }
    : isListbox
      ? {
          role: 'listbox',
          tabIndex: 0,
          'aria-label': label,
          'aria-orientation': orientation,
          'aria-activedescendant': activeSheetSlice ? optionId(activeSheetSlice) : undefined,
        }
      : { role: 'img', 'aria-label': label };

  const maxSlice = MAX_SLICE[size];
  const style = {
    '--total': model.totalWeight,
    '--gap': `${gap}px`,
    '--dir': rtl && !vertical ? -1 : 1,
    '--opening': positionToWeight(model, opening),
    '--max-length': `${model.totalWeight * maxSlice + gap}px`,
  } as CSSProperties;

  return (
    <div className={cx(styles.strip, styles[size], vertical ? styles.vertical : styles.horizontal, flags && styles.withFlags, className)} dir={rtl ? 'rtl' : 'ltr'}>
      <div
        ref={trackRef}
        className={styles.track}
        style={style}
        data-has-position={hasPosition ? '' : undefined}
        data-unit={unit}
        data-interactive={isSlider || onSelectSheet ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          if (!dragRef.current) hover(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => hover(null)}
        {...a11y}
      >
        {model.slices.map((slice) => {
          const flag = flags?.get(slice.sheetIndex);
          const sliceStyle = {
            '--start': slice.start,
            '--w': slice.weight,
            '--fill': slice.fill,
            '--sg': signatureOrdinal[slice.index] ?? 0,
            '--rise': slice.rise,
          } as CSSProperties;
          const highlighted = highlight !== null && slice.sheetIndex === highlight;
          const selected = selectedSheet !== null && slice.sheetIndex === selectedSheet;
          return (
            <span
              key={slice.index}
              data-slice={slice.index}
              id={isListbox ? optionId(slice) : undefined}
              role={isListbox ? 'option' : undefined}
              aria-selected={isListbox ? selected : undefined}
              aria-label={isListbox ? `Pliego ${imposition.sheets[slice.sheetIndex]?.number ?? slice.sheetIndex + 1}, págs. ${formatPageRuns(slice.pages)}${flag ? `, ${SEVERITY_TEXT[flag]}` : ''}` : undefined}
              className={styles.slice}
              style={sliceStyle}
              data-cover={slice.isCover ? '' : undefined}
              data-turned={hasPosition && slice.index < opening ? '' : undefined}
              data-highlighted={highlighted ? '' : undefined}
              data-selected={selected ? '' : undefined}
            >
              {flag && <Icon icon={Flag} size={size === 'sm' ? 10 : 12} className={cx(styles.flag, styles[`flag-${flag}`])} />}
            </span>
          );
        })}
        {hasPosition && (
          <span className={styles.handle} aria-hidden="true">
            <span className={styles.knob} />
          </span>
        )}
      </div>
      {tipSlice &&
        tipContent !== null &&
        createPortal(
          <div ref={tipRef} className={styles.tip} role="tooltip" aria-hidden="true">
            {tipContent}
          </div>,
          document.body,
        )}
    </div>
  );
}

function SheetList({ imposition, size = 'md', selectedSheet = null, onSelectSheet, highlightedSheet, onHoverSheet, flags, renderTip, ariaLabel, className, model }: CantoProps & { model: CantoModel }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const { hoverSlice, hover, highlight } = useHighlight(highlightedSheet, onHoverSheet);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const selectedIndex = model.slices.findIndex((slice) => slice.sheetIndex === selectedSheet);
  const activeIndex = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);
  const optionId = (index: number): string => `${baseId}-s${index}`;

  const groups = useMemo(() => {
    const result: { signature: number; slices: CantoSlice[] }[] = [];
    for (const slice of model.slices) {
      const last = result[result.length - 1];
      if (last && last.signature === slice.signature) last.slices.push(slice);
      else result.push({ signature: slice.signature, slices: [slice] });
    }
    return result;
  }, [model]);

  useEffect(() => {
    if (focusIndex === null) return;
    listRef.current?.querySelector(`#${CSS.escape(optionId(focusIndex))}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  const select = (index: number): void => {
    const slice = model.slices[index];
    if (!slice) return;
    setFocusIndex(index);
    onSelectSheet?.(slice.sheetIndex);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = model.slices.length - 1;
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(last, activeIndex + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, activeIndex - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    select(next);
  };

  const getTipAnchor = useCallback((): Element | null => (hoverSlice ? (listRef.current?.querySelector(`[data-slice="${hoverSlice.index}"]`) ?? null) : null), [hoverSlice]);
  useFloatingPosition(hoverSlice !== null && renderTip !== undefined, tipRef, getTipAnchor, { placement: 'right', gap: 8 });
  useLayoutEffect(() => {
    if (hoverSlice) placeFloating(tipRef.current, getTipAnchor(), { placement: 'right', gap: 8 });
  }, [hoverSlice, getTipAnchor]);

  const multipleSignatures = groups.length > 1;

  return (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel ?? 'Pliegos en orden de alzado'}
      aria-activedescendant={model.slices.length > 0 ? optionId(activeIndex) : undefined}
      className={cx(styles.list, styles[size], className)}
      onKeyDown={onKeyDown}
      onBlur={() => setFocusIndex(null)}
      onPointerLeave={() => hover(null)}
    >
      {groups.map((group) => {
        const first = group.slices[0];
        if (!first) return null;
        const info = imposition.signatures[group.signature];
        const headId = `${baseId}-g${group.signature}`;
        const pages = info?.pages ?? group.slices.length * 4;
        return (
          <div key={group.signature} role="group" aria-labelledby={headId} className={styles.group}>
            <div id={headId} className={styles.groupHead}>
              {first.isCover && info?.role === 'cover' ? (
                <Tag cover size="sm">
                  Cubierta
                </Tag>
              ) : (
                <Tag size="sm" {...(multipleSignatures && first.interiorOrdinal !== null ? { signature: first.interiorOrdinal } : {})}>
                  {multipleSignatures ? `Cuadernillo ${(first.interiorOrdinal ?? group.signature) + 1}` : 'Tripa'}
                </Tag>
              )}
              <span className={styles.groupMeta}>
                {group.slices.length} {group.slices.length === 1 ? 'pliego' : 'pliegos'} · {pages} págs.
                {multipleSignatures && !first.isCover && <span className={styles.stockName}> · {first.stockName}</span>}
              </span>
            </div>
            {group.slices.map((slice) => {
              const sheet = imposition.sheets[slice.sheetIndex];
              const flag = flags?.get(slice.sheetIndex);
              const selected = slice.sheetIndex === selectedSheet;
              const highlighted = highlight !== null && slice.sheetIndex === highlight;
              return (
                <div
                  key={slice.index}
                  id={optionId(slice.index)}
                  role="option"
                  aria-selected={selected}
                  data-slice={slice.index}
                  data-selected={selected ? '' : undefined}
                  data-highlighted={highlighted ? '' : undefined}
                  data-cover={slice.isCover ? '' : undefined}
                  data-active={activeIndex === slice.index ? '' : undefined}
                  className={styles.row}
                  style={{ '--fill': slice.fill, '--rise': slice.rise } as CSSProperties}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'touch') hover(slice);
                  }}
                  onClick={() => {
                    select(slice.index);
                    listRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <span className={styles.edge} aria-hidden="true" />
                  <span className={styles.number}>{sheet?.number ?? slice.sheetIndex + 1}</span>
                  <span className={styles.pages}>{formatPageRuns(slice.pages)}</span>
                  {slice.isCover && <span className="visually-hidden">, cubierta</span>}
                  <span className={styles.flagCell}>
                    {flag && (
                      <>
                        <Icon icon={Flag} size={12} className={cx(styles.flag, styles[`flag-${flag}`])} />
                        <span className="visually-hidden">{SEVERITY_TEXT[flag]}</span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      {hoverSlice &&
        renderTip &&
        createPortal(
          <div ref={tipRef} className={styles.tip} role="tooltip" aria-hidden="true">
            {renderTip({ leafIndex: null, sheetIndex: hoverSlice.sheetIndex, spread: null })}
          </div>,
          document.body,
        )}
    </div>
  );
}
