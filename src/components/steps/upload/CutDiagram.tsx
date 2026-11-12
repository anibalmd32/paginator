import type { SourceUnit } from '@/lib/types';

import styles from './CutDiagram.module.css';

export interface CutHalf {
  pageNumber: number | null;
  highlighted: boolean;
}

export interface CutDiagramProps {
  unit: SourceUnit;
  left: CutHalf;
  right: CutHalf;
  rtl: boolean;
}

const WIDTH = 160;
const MARK = 6;

export function CutDiagram({ unit, left, right, rtl }: CutDiagramProps) {
  const ratio = unit.width > 0 && unit.height > 0 ? unit.height / unit.width : 0.7;
  const sheetW = WIDTH - 2;
  const sheetH = Math.round(Math.min(124, Math.max(64, sheetW * ratio)));
  const height = sheetH + 2 * MARK + 4;
  const top = MARK + 2;
  const mid = 1 + sheetW / 2;
  const label = `Hoja doble cortada por el eje: la mitad izquierda va a la ${pageText(left.pageNumber)} y la derecha a la ${pageText(right.pageNumber)}${rtl ? ' (lectura de derecha a izquierda)' : ''}.`;

  return (
    <svg className={styles.diagram} viewBox={`0 0 ${String(WIDTH)} ${String(height)}`} role="img" aria-label={label}>
      {[
        { half: left, x: 1 },
        { half: right, x: mid },
      ].map(({ half, x }) => (
        <g key={x}>
          <rect x={x} y={top} width={sheetW / 2} height={sheetH} className={half.highlighted ? styles.halfOn : styles.half} />
          <text x={x + sheetW / 4} y={top + sheetH / 2 - 5} className={styles.numeral} textAnchor="middle" dominantBaseline="central">
            {half.pageNumber ?? '—'}
          </text>
          <text x={x + sheetW / 4} y={top + sheetH / 2 + 14} className={styles.caption} textAnchor="middle" dominantBaseline="central">
            {half.pageNumber === null ? 'sin página' : 'página'}
          </text>
        </g>
      ))}
      <rect x={1} y={top} width={sheetW} height={sheetH} className={styles.sheet} />
      <line x1={mid} y1={top} x2={mid} y2={top + sheetH} className={styles.axis} />
      <line x1={mid} y1={0} x2={mid} y2={MARK} className={styles.mark} />
      <line x1={mid} y1={top + sheetH + 2} x2={mid} y2={height} className={styles.mark} />
    </svg>
  );
}

function pageText(pageNumber: number | null): string {
  return pageNumber === null ? 'ninguna página' : `página ${String(pageNumber)}`;
}
