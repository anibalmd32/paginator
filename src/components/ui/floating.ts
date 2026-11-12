import { useLayoutEffect, type RefObject } from 'react';

export type Placement = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';

export interface FloatingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FloatingOptions {
  placement?: Placement;
  align?: Align;
  gap?: number;
  margin?: number;
}

export interface FloatingPosition {
  left: number;
  top: number;
  placement: Placement;
}

const OPPOSITE: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

export function computeFloatingPosition(
  anchor: FloatingRect,
  floating: { width: number; height: number },
  viewport: { width: number; height: number },
  { placement = 'top', align = 'center', gap = 6, margin = 8 }: FloatingOptions = {},
): FloatingPosition {
  const room: Record<Placement, number> = {
    top: anchor.top - margin,
    bottom: viewport.height - (anchor.top + anchor.height) - margin,
    left: anchor.left - margin,
    right: viewport.width - (anchor.left + anchor.width) - margin,
  };
  const needed = placement === 'top' || placement === 'bottom' ? floating.height + gap : floating.width + gap;
  const side = room[placement] >= needed || room[OPPOSITE[placement]] <= room[placement] ? placement : OPPOSITE[placement];

  const along = (start: number, size: number, floatingSize: number): number => {
    if (align === 'start') return start;
    if (align === 'end') return start + size - floatingSize;
    return start + (size - floatingSize) / 2;
  };

  let left: number;
  let top: number;
  if (side === 'top' || side === 'bottom') {
    left = along(anchor.left, anchor.width, floating.width);
    top = side === 'top' ? anchor.top - gap - floating.height : anchor.top + anchor.height + gap;
  } else {
    top = along(anchor.top, anchor.height, floating.height);
    left = side === 'left' ? anchor.left - gap - floating.width : anchor.left + anchor.width + gap;
  }

  return {
    left: Math.round(clamp(left, margin, viewport.width - margin - floating.width)),
    top: Math.round(clamp(top, margin, viewport.height - margin - floating.height)),
    placement: side,
  };
}

export type AnchorSource = Element | FloatingRect | null;

function anchorRect(source: AnchorSource): FloatingRect | null {
  if (!source) return null;
  if (source instanceof Element) {
    const rect = source.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  return source;
}

export function placeFloating(floating: HTMLElement | null, anchor: AnchorSource, options?: FloatingOptions): boolean {
  const rect = anchorRect(anchor);
  if (!floating || !rect) return false;
  const position = computeFloatingPosition(
    rect,
    { width: floating.offsetWidth, height: floating.offsetHeight },
    { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    options,
  );
  floating.style.left = `${position.left}px`;
  floating.style.top = `${position.top}px`;
  floating.dataset['placement'] = position.placement;
  return true;
}

export function useFloatingPosition(
  open: boolean,
  floatingRef: RefObject<HTMLElement | null>,
  getAnchor: () => AnchorSource,
  options: FloatingOptions = {},
): void {
  const { placement, align, gap, margin } = options;
  useLayoutEffect(() => {
    if (!open) return;
    const settings: FloatingOptions = {};
    if (placement !== undefined) settings.placement = placement;
    if (align !== undefined) settings.align = align;
    if (gap !== undefined) settings.gap = gap;
    if (margin !== undefined) settings.margin = margin;
    const update = (): void => {
      placeFloating(floatingRef.current, getAnchor(), settings);
    };
    update();
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [open, floatingRef, placement, align, gap, margin]);
}
