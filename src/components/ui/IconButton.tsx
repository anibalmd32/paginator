import type { ReactNode } from 'react';

import { cx } from '@/lib/utils/cx';

import { Button, type ButtonProps } from './Button';
import buttonStyles from './Button.module.css';
import type { Placement } from './floating';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconStart' | 'iconEnd' | 'block' | 'aria-label'> {
  label: string;
  icon: ReactNode;
  tooltipExtra?: ReactNode;
  tooltipPlacement?: Placement;
}

export function IconButton({ label, icon, tooltipExtra, tooltipPlacement = 'bottom', variant = 'ghost', className, ...rest }: IconButtonProps) {
  const tip = tooltipExtra ? (
    <>
      {label} {tooltipExtra}
    </>
  ) : (
    label
  );
  return (
    <Tooltip content={tip} placement={tooltipPlacement} semantics="label">
      <Button variant={variant} aria-label={label} className={cx(buttonStyles.iconOnly, className)} iconStart={icon} {...rest} />
    </Tooltip>
  );
}
