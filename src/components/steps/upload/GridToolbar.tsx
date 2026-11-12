import { RotateCcw } from 'lucide-react';

import { Button, Icon, SegmentedControl, Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarSpacer, Tooltip } from '@/components/ui';
import { useProjectStore } from '@/lib/store';
import type { GuideVisibility } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import styles from './GridToolbar.module.css';
import type { ThumbSize } from './ReadingGrid';

const SIZE_OPTIONS = [
  { value: 's', label: 'S', ariaLabel: 'Miniaturas pequeñas' },
  { value: 'm', label: 'M', ariaLabel: 'Miniaturas medianas' },
  { value: 'l', label: 'L', ariaLabel: 'Miniaturas grandes' },
] as const;

const GUIDES: readonly { key: keyof GuideVisibility; label: string; swatch: string | undefined }[] = [
  { key: 'trim', label: 'Corte', swatch: styles.swatchTrim },
  { key: 'bleed', label: 'Sangrado', swatch: styles.swatchBleed },
  { key: 'safe', label: 'Zona segura', swatch: styles.swatchSafe },
];

export interface GridToolbarProps {
  thumb: ThumbSize;
  onThumbChange: (size: ThumbSize) => void;
  className?: string | undefined;
}

export function GridToolbar({ thumb, onThumbChange, className }: GridToolbarProps) {
  const guides = useProjectStore((state) => state.viewer.guides);
  const setGuides = useProjectStore((state) => state.setGuides);
  const pagesEdited = useProjectStore((state) => state.pagesEdited);
  const resetPageOrder = useProjectStore((state) => state.resetPageOrder);

  return (
    <Toolbar aria-label="Vista de las páginas" surface="plain" className={cx(styles.toolbar, className)}>
      <SegmentedControl<ThumbSize>
        size="sm"
        aria-label="Tamaño de miniatura"
        options={SIZE_OPTIONS}
        value={thumb}
        onChange={onThumbChange}
      />
      <ToolbarSeparator />
      <ToolbarGroup aria-label="Guías" className={styles.guides}>
        <span className={styles.groupLabel} aria-hidden="true">
          Guías
        </span>
        {GUIDES.map((guide) => (
          <Button
            key={guide.key}
            size="sm"
            variant="ghost"
            pressed={guides[guide.key]}
            onClick={() => setGuides({ [guide.key]: !guides[guide.key] })}
            iconStart={<span className={cx(styles.swatch, guide.swatch)} aria-hidden="true" />}
          >
            {guide.label}
          </Button>
        ))}
      </ToolbarGroup>
      <ToolbarSpacer />
      {pagesEdited ? (
        <Tooltip content="Restablecer el orden de los archivos: deshace movimientos, blancas y páginas quitadas" placement="bottom" align="end">
          <Button size="sm" variant="secondary" className={styles.reset} iconStart={<Icon icon={RotateCcw} size={14} />} onClick={resetPageOrder}>
            <span className={styles.resetLabel}>Restablecer orden</span>
          </Button>
        </Tooltip>
      ) : null}
    </Toolbar>
  );
}
