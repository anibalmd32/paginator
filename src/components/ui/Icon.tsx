import type { LucideIcon } from 'lucide-react';

import { cx } from '@/lib/utils/cx';

import styles from './Icon.module.css';

export type { LucideIcon as IconComponent };

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  label?: string;
  className?: string | undefined;
}

export const ICON_STROKE = 1.75;

export function Icon({ icon: Glyph, size = 16, label, className }: IconProps) {
  const a11y = label ? ({ role: 'img', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const);
  return <Glyph size={size} strokeWidth={ICON_STROKE} className={cx(styles.icon, className)} focusable={false} {...a11y} />;
}
