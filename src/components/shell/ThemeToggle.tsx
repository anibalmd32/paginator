import { Monitor, Moon, Sun } from 'lucide-react';

import { Icon } from '@/components/ui/Icon';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { useTheme } from '@/components/ui/useTheme';
import type { ThemeChoice } from '@/lib/theme';
import { cx } from '@/lib/utils/cx';

import styles from './ThemeToggle.module.css';

const OPTIONS: readonly SegmentedOption<ThemeChoice>[] = [
  { value: 'system', label: 'Tema del sistema', icon: <Icon icon={Monitor} size={14} /> },
  { value: 'light', label: 'Tema claro', icon: <Icon icon={Sun} size={14} /> },
  { value: 'dark', label: 'Tema oscuro', icon: <Icon icon={Moon} size={14} /> },
];

export interface ThemeToggleProps {
  surface?: 'bar' | 'paper';
  className?: string | undefined;
}

export function ThemeToggle({ surface = 'bar', className }: ThemeToggleProps) {
  const { choice, setChoice } = useTheme();
  return (
    <SegmentedControl<ThemeChoice>
      options={OPTIONS}
      value={choice}
      onChange={setChoice}
      size="sm"
      iconOnly
      aria-label="Tema"
      className={cx(surface === 'bar' && styles.onBar, className)}
    />
  );
}
