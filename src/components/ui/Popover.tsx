import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '@/lib/utils/cx';

import { useFloatingPosition, type Align, type Placement } from './floating';
import styles from './Popover.module.css';

export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  'aria-haspopup': 'dialog';
}

export interface PopoverProps {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  title?: ReactNode;
  'aria-label'?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  align?: Align;
  className?: string | undefined;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Popover({ trigger, children, title, 'aria-label': ariaLabel, open: openProp, onOpenChange, placement = 'bottom', align = 'end', className }: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const titleId = `${id}-title`;

  const setOpen = useCallback(
    (next: boolean): void => {
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );

  const close = useCallback((): void => setOpen(false), [setOpen]);

  useFloatingPosition(open, panelRef, () => triggerRef.current, { placement, align, gap: 6 });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, close]);

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget as Node | null;
    if (!next) return;
    if (panelRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    close();
  };

  const hasTitle = title !== undefined && title !== null && title !== false;
  const content = typeof children === 'function' ? children(close) : children;

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen(!open),
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        'aria-haspopup': 'dialog',
      })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-labelledby={hasTitle ? titleId : undefined}
            aria-label={hasTitle ? undefined : ariaLabel}
            tabIndex={-1}
            className={cx(styles.panel, className)}
            onBlur={onBlur}
          >
            {hasTitle && (
              <p id={titleId} className={styles.title}>
                {title}
              </p>
            )}
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
