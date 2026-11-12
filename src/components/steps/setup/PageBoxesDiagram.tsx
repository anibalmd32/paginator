import { useId } from 'react';

import type { TrimSize } from '@/lib/types';

import styles from './PageBoxesDiagram.module.css';
import { formatNumber, pageBoxes } from './setupModel';

interface PageBoxesDiagramProps {
  trim: TrimSize;
  bleedMm: number;
  marksMm: number;
  safeMarginMm: number;
}

const PAGE_BOX = { width: 100, height: 136 };
const DETAIL_SIZE = 124;
const COTA = 14;

export function PageBoxesDiagram({ trim, bleedMm, marksMm, safeMarginMm }: PageBoxesDiagramProps) {
  const boxes = pageBoxes(trim, bleedMm, marksMm, safeMarginMm);
  const hasBleed = bleedMm > 0;
  const hasMarks = marksMm > 0;

  const scale = Math.min(PAGE_BOX.width / boxes.file.width, PAGE_BOX.height / boxes.file.height);
  const fileW = boxes.file.width * scale;
  const fileH = boxes.file.height * scale;
  const ox = 1;
  const oy = COTA;
  const inset = (mm: number) => mm * scale;
  const trimX = ox + inset(boxes.trimInset);
  const trimY = oy + inset(boxes.trimInset);
  const trimW = trim.widthMm * scale;
  const trimH = trim.heightMm * scale;
  const pageSvgW = fileW + COTA + 2;
  const pageSvgH = fileH + COTA + 1;

  const windowMm = Math.max(12, boxes.safeInset + 6);
  const zoom = DETAIL_SIZE / windowMm;
  const pageZoom = zoom / scale;
  const d = (mm: number) => mm * zoom;
  const cotaY = DETAIL_SIZE + 10;

  const segments = [
    hasMarks ? { from: 0, to: boxes.bleedInset, value: marksMm, key: 'marks' } : null,
    hasBleed ? { from: boxes.bleedInset, to: boxes.trimInset, value: bleedMm, key: 'bleed' } : null,
    safeMarginMm > 0 ? { from: boxes.trimInset, to: Math.min(boxes.safeInset, windowMm), value: safeMarginMm, key: 'safe' } : null,
  ].filter((segment) => segment !== null);

  const markPad = marksMm * 0.15;
  const clipId = `setup-detail-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const safeFits = boxes.safeFits;

  return (
    <figure className={styles.figure}>
      <div className={styles.views}>
        <svg
          className={styles.svg}
          width={pageSvgW}
          height={pageSvgH}
          viewBox={`0 0 ${pageSvgW} ${pageSvgH}`}
          role="img"
          aria-label={`Página de ${formatNumber(trim.widthMm)} × ${formatNumber(trim.heightMm)} mm a escala`}
        >
          <rect x={ox} y={oy} width={fileW} height={fileH} className={hasMarks ? styles.fileMarks : styles.file} />
          {hasBleed && (
            <rect
              x={ox + inset(boxes.bleedInset)}
              y={oy + inset(boxes.bleedInset)}
              width={fileW - 2 * inset(boxes.bleedInset)}
              height={fileH - 2 * inset(boxes.bleedInset)}
              className={styles.bleed}
            />
          )}
          <rect x={trimX} y={trimY} width={trimW} height={trimH} className={styles.trim} />
          {safeFits && (
            <rect
              x={ox + inset(boxes.safeInset)}
              y={oy + inset(boxes.safeInset)}
              width={trimW - 2 * inset(safeMarginMm)}
              height={trimH - 2 * inset(safeMarginMm)}
              className={styles.safe}
            />
          )}
          <g className={styles.cota}>
            <line x1={trimX} y1={6} x2={trimX + trimW} y2={6} />
            <line x1={trimX} y1={3} x2={trimX} y2={9} />
            <line x1={trimX + trimW} y1={3} x2={trimX + trimW} y2={9} />
          </g>
          <g className={styles.cota}>
            <line x1={pageSvgW - 6} y1={trimY} x2={pageSvgW - 6} y2={trimY + trimH} />
            <line x1={pageSvgW - 9} y1={trimY} x2={pageSvgW - 3} y2={trimY} />
            <line x1={pageSvgW - 9} y1={trimY + trimH} x2={pageSvgW - 3} y2={trimY + trimH} />
          </g>
          <text x={trimX + trimW / 2} y={6} className={styles.cotaText} dominantBaseline="central">
            <tspan className={styles.cotaBack}>{formatNumber(trim.widthMm)}</tspan>
          </text>
          <text
            x={pageSvgW - 6}
            y={trimY + trimH / 2}
            className={styles.cotaText}
            dominantBaseline="central"
            transform={`rotate(-90 ${pageSvgW - 6} ${trimY + trimH / 2})`}
          >
            <tspan className={styles.cotaBack}>{formatNumber(trim.heightMm)}</tspan>
          </text>
          <rect x={ox} y={oy} width={DETAIL_SIZE / pageZoom} height={DETAIL_SIZE / pageZoom} className={styles.window} />
        </svg>

        <svg
          className={styles.svg}
          width={DETAIL_SIZE + 2}
          height={cotaY + 14}
          viewBox={`-1 -1 ${DETAIL_SIZE + 2} ${cotaY + 14}`}
          role="img"
          aria-label={`Esquina ampliada ${formatNumber(pageZoom, 0)} veces`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={DETAIL_SIZE} height={DETAIL_SIZE} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <rect x={0} y={0} width={DETAIL_SIZE + 4} height={DETAIL_SIZE + 4} className={hasMarks ? styles.fileMarks : styles.file} />
            {hasBleed && <rect x={d(boxes.bleedInset)} y={d(boxes.bleedInset)} width={DETAIL_SIZE * 2} height={DETAIL_SIZE * 2} className={styles.bleed} />}
            <rect x={d(boxes.trimInset)} y={d(boxes.trimInset)} width={DETAIL_SIZE * 2} height={DETAIL_SIZE * 2} className={styles.trim} />
            {safeFits && safeMarginMm > 0 && (
              <rect x={d(boxes.safeInset)} y={d(boxes.safeInset)} width={DETAIL_SIZE * 2} height={DETAIL_SIZE * 2} className={styles.safe} />
            )}
            {hasMarks && (
              <>
                <line x1={d(markPad)} y1={d(boxes.trimInset)} x2={d(boxes.bleedInset - markPad)} y2={d(boxes.trimInset)} className={styles.crop} />
                <line x1={d(boxes.trimInset)} y1={d(markPad)} x2={d(boxes.trimInset)} y2={d(boxes.bleedInset - markPad)} className={styles.crop} />
              </>
            )}
          </g>
          <rect x={0} y={0} width={DETAIL_SIZE} height={DETAIL_SIZE} className={styles.frame} />
          {segments.map((segment) => (
            <g key={segment.key} className={styles[`seg-${segment.key}`]}>
              <line x1={d(segment.from)} y1={cotaY} x2={d(segment.to)} y2={cotaY} className={styles.segLine} />
              <line x1={d(segment.from)} y1={cotaY - 3} x2={d(segment.from)} y2={cotaY + 3} className={styles.segLine} />
              <line x1={d(segment.to)} y1={cotaY - 3} x2={d(segment.to)} y2={cotaY + 3} className={styles.segLine} />
              <text x={(d(segment.from) + d(segment.to)) / 2} y={cotaY + 11} className={styles.cotaText}>
                {formatNumber(segment.value)}
              </text>
            </g>
          ))}
          <text x={DETAIL_SIZE - 4} y={DETAIL_SIZE - 6} className={styles.zoom}>
            ×{formatNumber(pageZoom, 0)}
          </text>
        </svg>
      </div>

      <figcaption className={styles.caption}>
        <ul className={styles.legend}>
          <li>
            <span className={styles.swatchTrim} aria-hidden="true" />
            <span>Corte</span>
            <span className={styles.value}>
              {formatNumber(trim.widthMm)} × {formatNumber(trim.heightMm)} mm
            </span>
          </li>
          <li>
            <span className={styles.swatchBleed} aria-hidden="true" />
            <span>Sangrado</span>
            <span className={styles.value}>{hasBleed ? `${formatNumber(bleedMm)} mm` : 'a corte'}</span>
          </li>
          <li>
            <span className={styles.swatchSafe} aria-hidden="true" />
            <span>Zona segura</span>
            <span className={styles.value}>{safeMarginMm > 0 ? `${formatNumber(safeMarginMm)} mm` : 'sin margen'}</span>
          </li>
          <li>
            <span className={styles.swatchMarks} aria-hidden="true" />
            <span>Marcas</span>
            <span className={styles.value}>{hasMarks ? `${formatNumber(marksMm)} mm` : 'sin marcas'}</span>
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
