import { Layers, Wrench } from 'lucide-react';
import { memo, type CSSProperties } from 'react';

import { countText, SEVERITY_LABEL, sheetNumeral, sheetRoleText } from '@/components/report/labels';
import { Button, Icon, Tag, TONE_ICON, toast, Tooltip } from '@/components/ui';
import { formatPageRuns, sheetRise } from '@/components/canto';
import { useProjectStore } from '@/lib/store';
import type { IssueFix, SheetFace } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import type { SheetRowModel, SignatureBlockModel, SlotModel } from './matrixModel';
import { readingPartner } from './matrixModel';
import { useMatrixUi } from './matrixUi';
import { PageSlot } from './PageSlot';
import styles from './SheetMatrix.module.css';

export interface SheetMatrixProps {
  blocks: readonly SignatureBlockModel[];
  pageCount: number;
  visibleSheets: ReadonlySet<number> | null;
  onSelect: (slot: SlotModel) => void;
  onOpen3d: (page: number) => void;
  onOpenSheet: (sheetIndex: number, face: SheetFace) => void;
}

export const SheetMatrix = memo(function SheetMatrix({ blocks, pageCount, visibleSheets, onSelect, onOpen3d, onOpenSheet }: SheetMatrixProps) {
  return (
    <div className={styles.matrix}>
      <div className={styles.columns} aria-hidden="true">
        <span>Pliego</span>
        <span className={styles.columnFace}>
          Cara <span className={styles.columnNote}>exterior · A | B</span>
        </span>
        <span className={styles.columnFace}>
          Retiro <span className={styles.columnNote}>interior · C | D</span>
        </span>
      </div>
      {blocks.map((block) => {
        const rows = visibleSheets ? block.rows.filter((row) => visibleSheets.has(row.sheet.index)) : block.rows;
        if (rows.length === 0) return null;
        const headId = `cuadernillo-${block.info.index}`;
        return (
          <section key={block.info.index} className={styles.block} aria-labelledby={headId}>
            <header className={styles.blockHead}>
              <Tag {...(block.isCover ? { cover: true } : block.stockIndex !== null ? { signature: block.stockIndex } : {})}>{block.stock.name}</Tag>
              <h2 id={headId} className={styles.blockTitle}>
                {block.title}
              </h2>
              <p className={styles.blockMeta}>
                págs. {formatPageRuns(block.info.pageNumbers)} · {countText(block.info.sheets, 'pliego', 'pliegos')}
                {visibleSheets && rows.length < block.rows.length ? ` · ${rows.length} con incidencias` : ''}
              </p>
            </header>
            <div className={styles.rows}>
              {rows.map((row) => (
                <SheetRow key={row.sheet.index} row={row} pageCount={pageCount} onSelect={onSelect} onOpen3d={onOpen3d} onOpenSheet={onOpenSheet} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
});

interface SheetRowProps {
  row: SheetRowModel;
  pageCount: number;
  onSelect: (slot: SlotModel) => void;
  onOpen3d: (page: number) => void;
  onOpenSheet: (sheetIndex: number, face: SheetFace) => void;
}

const SheetRow = memo(function SheetRow({ row, pageCount, onSelect, onOpen3d, onOpenSheet }: SheetRowProps) {
  const { sheet, slots, primaryIssue } = row;
  const hovered = useProjectStore((state) => state.hover.sheet === sheet.index);
  const active = useMatrixUi((state) => state.activeSheet === sheet.index);
  const [a, b, c, d] = slots;
  const { tone } = row;
  const numeral = sheetNumeral(sheet.number);
  const headId = `pliego-${sheet.index}-titulo`;

  return (
    <article
      className={cx(styles.row, tone && styles[`tone-${tone}`])}
      data-sheet-row={sheet.index}
      data-hover={hovered ? '' : undefined}
      data-active={active ? '' : undefined}
      aria-labelledby={headId}
      style={{ '--fill': row.stock.cssVar, '--rise': sheetRise(sheet) } as CSSProperties}
    >
      <div className={styles.head}>
        <h3 id={headId} className={styles.numeral}>
          <span className="visually-hidden">Pliego </span>
          {numeral}
        </h3>
        <p className={styles.role}>{sheetRoleText(sheet)}</p>
        <span className={styles.edge} aria-hidden="true" />
        <div className={styles.headActions}>
          <DespieceButton sheetIndex={sheet.index} sheetNumber={sheet.number} onOpenSheet={onOpenSheet} />
        </div>
      </div>

      <Face face="front" sheetNumber={sheet.number} left={a} right={b} pageCount={pageCount} onSelect={onSelect} onOpen3d={onOpen3d} />
      <Face face="back" sheetNumber={sheet.number} left={c} right={d} pageCount={pageCount} onSelect={onSelect} onOpen3d={onOpen3d} />

      {primaryIssue && tone && (
        <div className={styles.issueLine}>
          <Icon icon={TONE_ICON[tone]} size={14} className={styles.issueIcon} label={SEVERITY_LABEL[primaryIssue.severity].one} />
          <p className={styles.issueText}>
            {primaryIssue.title}
            {row.issueCount > 1 && <span className={styles.issueMore}> · {countText(row.issueCount - 1, 'incidencia más', 'incidencias más')}</span>}
          </p>
          {primaryIssue.fix && <RowFix fix={primaryIssue.fix} />}
        </div>
      )}
    </article>
  );
});

function RowFix({ fix }: { fix: IssueFix }) {
  const { label } = fix;
  return (
    <Button
      size="sm"
      variant="secondary"
      iconStart={<Icon icon={Wrench} size={14} />}
      onClick={() => {
        useProjectStore.getState().applyFix(fix);
        toast({ title: `Arreglo aplicado: ${label.charAt(0).toLowerCase()}${label.slice(1)}`, tone: 'success' });
      }}
    >
      {label}
    </Button>
  );
}

function DespieceButton({ sheetIndex, sheetNumber, onOpenSheet }: { sheetIndex: number; sheetNumber: number; onOpenSheet: (sheetIndex: number, face: SheetFace) => void }) {
  const label = `Ver el pliego ${sheetNumber} extendido en el visor (despiece)`;
  return (
    <Tooltip content={label} placement="right" semantics="label">
      <Button size="sm" variant="ghost" tabIndex={-1} className={styles.despiece} aria-label={label} iconStart={<Icon icon={Layers} size={14} />} onClick={() => onOpenSheet(sheetIndex, 'front')}>
        Despiece
      </Button>
    </Tooltip>
  );
}

interface FaceProps {
  face: SheetFace;
  sheetNumber: number;
  left: SlotModel;
  right: SlotModel;
  pageCount: number;
  onSelect: (slot: SlotModel) => void;
  onOpen3d: (page: number) => void;
}

function Face({ face, sheetNumber, left, right, pageCount, onSelect, onOpen3d }: FaceProps) {
  return (
    <div className={styles.face} role="group" aria-label={`${face === 'front' ? 'Cara' : 'Retiro'} del pliego ${sheetNumber}`}>
      <div className={styles.pair}>
        <PageSlot slot={left} partner={readingPartner(left.page, pageCount)} variant="sheet" side="left" onSelect={onSelect} onOpen3d={onOpen3d} />
        <span className={styles.spine} aria-hidden="true" />
        <PageSlot slot={right} partner={readingPartner(right.page, pageCount)} variant="sheet" side="right" onSelect={onSelect} onOpen3d={onOpen3d} />
      </div>
    </div>
  );
}
