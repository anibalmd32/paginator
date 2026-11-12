import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '@/lib/utils/cx';

import { useFloatingPosition, type Align, type Placement } from './floating';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  align?: Align;
  delay?: number;
  semantics?: 'description' | 'label';
  className?: string | undefined;
}

const DEFAULT_DELAY = 350;
const WARM_WINDOW_MS = 400;
let lastClosedAt = 0;

export function Tooltip({ content, children, placement = 'top', align = 'center', delay = DEFAULT_DELAY, semantics = 'description', className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const id = useId();
  const hasContent = content !== null && content !== undefined && content !== false && content !== '';

  const getAnchor = useCallback((): Element | null => wrapperRef.current?.firstElementChild ?? null, []);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (immediate: boolean): void => {
      clearTimer();
      const warm = performance.now() - lastClosedAt < WARM_WINDOW_MS;
      if (immediate || warm || delay <= 0) setOpen(true);
      else timerRef.current = window.setTimeout(() => setOpen(true), delay);
    },
    [clearTimer, delay],
  );

  const hide = useCallback((): void => {
    clearTimer();
    setOpen((wasOpen) => {
      if (wasOpen) lastClosedAt = performance.now();
      return false;
    });
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, hide]);

  useEffect(() => {
    if (!open || semantics !== 'description') return;
    const anchor = getAnchor();
    if (!anchor) return;
    const previous = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', previous ? `${previous} ${id}` : id);
    return () => {
      if (previous) anchor.setAttribute('aria-describedby', previous);
      else anchor.removeAttribute('aria-describedby');
    };
  }, [open, semantics, id, getAnchor]);

  useFloatingPosition(open && hasContent, bubbleRef, getAnchor, { placement, align, gap: 6 });

  const onPointerEnter = (event: PointerEvent<HTMLSpanElement>): void => {
    if (event.pointerType === 'touch') return;
    show(false);
  };

  const pointerFocusRef = useRef(false);
  const onPointerDown = (): void => {
    pointerFocusRef.current = true;
    hide();
    window.setTimeout(() => {
      pointerFocusRef.current = false;
    }, 400);
  };

  const onFocus = (event: FocusEvent<HTMLSpanElement>): void => {
    if (pointerFocusRef.current) return;
    if (event.target instanceof Element && event.target.matches(':focus-visible')) show(true);
  };

  if (!hasContent) return <>{children}</>;

  return (
    <span ref={wrapperRef} className={styles.anchor} onPointerEnter={onPointerEnter} onPointerLeave={hide} onPointerDown={onPointerDown} onFocus={onFocus} onBlur={hide}>
      {children}
      {open &&
        createPortal(
          <div ref={bubbleRef} id={id} role="tooltip" aria-hidden={semantics === 'label' ? true : undefined} className={cx(styles.bubble, className)}>
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
