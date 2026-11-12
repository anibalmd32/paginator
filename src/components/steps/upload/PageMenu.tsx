import { ArrowRightLeft, Box, CornerDownLeft, FilePlus2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, Icon, Kbd, NumberField } from '@/components/ui';

import styles from './PageMenu.module.css';

export interface PageMenuProps {
  pageNumber: number;
  pageCount: number;
  lockedReason: string | null;
  onMoveTo: (position: number) => void;
  onInsertBlank: (after: boolean) => void;
  onRemove: () => void;
  onOpenInViewer: () => void;
  close: () => void;
}

export function PageMenu({ pageNumber, pageCount, lockedReason, onMoveTo, onInsertBlank, onRemove, onOpenInViewer, close }: PageMenuProps) {
  const [position, setPosition] = useState<number | null>(pageNumber);
  const locked = lockedReason !== null;
  const target = position === null ? null : Math.min(pageCount, Math.max(1, Math.round(position)));
  const canMove = !locked && target !== null && target !== pageNumber;

  const run = (action: () => void): void => {
    action();
    close();
  };

  return (
    <div className={styles.menu}>
      <form
        className={styles.move}
        onSubmit={(event) => {
          event.preventDefault();
          if (canMove && target !== null) run(() => onMoveTo(target));
        }}
      >
        <NumberField
          label="Mover a la posición…"
          size="sm"
          value={position}
          onChange={setPosition}
          min={1}
          max={pageCount}
          allowEmpty
          disabled={locked}
          fieldClassName={styles.moveField}
          hint={locked ? undefined : `De 1 a ${String(pageCount)}`}
        />
        <Button type="submit" size="sm" variant="secondary" iconStart={<Icon icon={CornerDownLeft} size={14} />} disabled={!canMove}>
          Mover
        </Button>
      </form>

      <div className={styles.items} role="group" aria-label={`Acciones de la página ${String(pageNumber)}`}>
        <Button size="sm" variant="ghost" block className={styles.item} iconStart={<Icon icon={FilePlus2} size={14} />} disabled={locked} onClick={() => run(() => onInsertBlank(false))}>
          Insertar blanca antes
        </Button>
        <Button size="sm" variant="ghost" block className={styles.item} iconStart={<Icon icon={FilePlus2} size={14} />} disabled={locked} onClick={() => run(() => onInsertBlank(true))}>
          Insertar blanca después
        </Button>
        <Button size="sm" variant="ghost" block className={styles.item} iconStart={<Icon icon={Trash2} size={14} />} disabled={locked} onClick={() => run(onRemove)}>
          Quitar página
        </Button>
        <span className={styles.rule} aria-hidden="true" />
        <Button size="sm" variant="ghost" block className={styles.item} iconStart={<Icon icon={Box} size={14} />} onClick={() => run(onOpenInViewer)}>
          Ver en 3D
        </Button>
      </div>

      {locked ? (
        <p className={styles.reason}>
          <Icon icon={ArrowRightLeft} size={14} />
          <span>{lockedReason}</span>
        </p>
      ) : (
        <p className={styles.hint}>
          Con el foco en la página, <Kbd keys={['Alt', '←']} /> o <Kbd keys={['Alt', '→']} /> la mueve una posición.
        </p>
      )}
    </div>
  );
}
