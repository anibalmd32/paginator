import { useMemo, useState, type CSSProperties } from 'react';

import { Canto } from '@/components/canto';
import { buildCantoModel } from '@/components/canto/cantoModel';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { computeImposition } from '@/lib/imposition';
import type { BindingType, ImpositionResult, ReadingDirection, SheetImposition, SheetSide } from '@/lib/types';

import styles from './ImpositionPlayground.module.css';

type PageOption = '8' | '16' | '24' | '32';

const PAGE_OPTIONS: readonly SegmentedOption<PageOption>[] = [
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '24', label: '24' },
  { value: '32', label: '32' },
];

const BINDING_OPTIONS: readonly SegmentedOption<BindingType>[] = [
  { value: 'saddle-stitch', label: 'Grapada', hint: 'A caballo: los pliegos se encartan uno dentro de otro' },
  { value: 'perfect-bound', label: 'Lomo cuadrado', hint: 'Cuadernillos de 16 páginas alzados, con la cubierta aparte' },
];

const DIRECTION_OPTIONS: readonly SegmentedOption<ReadingDirection>[] = [
  { value: 'ltr', label: 'Izq. a der.', hint: 'Lectura occidental' },
  { value: 'rtl', label: 'Der. a izq.', hint: 'Árabe, hebreo, manga' },
];

const ORDINALS = ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º', '7.º', '8.º'];

interface PageFocus {
  page: number;
  sheet: number;
}

function roleText(sheet: SheetImposition, imposition: ImpositionResult): string {
  const nth = `${ORDINALS[sheet.indexInSignature] ?? `${String(sheet.indexInSignature + 1)}.º`} de ${String(sheet.sheetsInSignature)}`;
  if (imposition.binding === 'saddle-stitch') return sheet.role === 'cover' ? `Exterior, con la cubierta · ${nth}` : `Encartado · ${nth}`;
  if (sheet.role === 'cover') return 'Cubierta aparte';
  const interiorOrdinal = imposition.signatures.filter((s) => s.role === 'interior').findIndex((s) => s.index === sheet.signature);
  return `Cuadernillo ${String(interiorOrdinal + 1)} · ${nth}`;
}

function describe(imposition: ImpositionResult, page: number): string {
  const placement = imposition.placements[page - 1];
  const sheet = placement ? imposition.sheets[placement.sheetIndex] : undefined;
  if (!placement || !sheet) return '';
  const face = placement.face === 'front' ? 'cara' : 'retiro';
  const side = placement.position === 'left' ? 'a la izquierda' : 'a la derecha';
  return `La página ${String(page)} cae en el pliego ${String(sheet.number)}, ${face}, ${side} del lomo.`;
}

export function ImpositionPlayground() {
  const [pages, setPages] = useState<PageOption>('24');
  const [binding, setBinding] = useState<BindingType>('saddle-stitch');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [hoverSheet, setHoverSheet] = useState<number | null>(null);
  const [focus, setFocus] = useState<PageFocus | null>(null);

  const pageCount = Number(pages);
  const imposition = useMemo(
    () => computeImposition(pageCount, { binding, signaturePages: 16, separateCover: true, readingDirection: direction }),
    [pageCount, binding, direction],
  );
  const sheetStock = useMemo(() => buildCantoModel(imposition, 'sheet').slices, [imposition]);
  const interiorSignatures = imposition.signatures.filter((s) => s.role === 'interior').length;

  const highlighted = focus?.sheet ?? hoverSheet;
  const version = `${pages}-${binding}-${direction}`;
  const summary = [
    `${pages} páginas`,
    `${String(imposition.sheets.length)} pliegos`,
    binding === 'saddle-stitch'
      ? 'un cuadernillo a caballo'
      : `cubierta aparte y ${String(interiorSignatures)} ${interiorSignatures === 1 ? 'cuadernillo' : 'cuadernillos'}`,
  ].join(' · ');

  return (
    <div className={styles.play} data-dir={direction}>
      <div className={styles.controls}>
        <SegmentedControl label="Páginas" options={PAGE_OPTIONS} value={pages} onChange={setPages} />
        <SegmentedControl label="Encuadernación" options={BINDING_OPTIONS} value={binding} onChange={setBinding} />
        <SegmentedControl label="Lectura" options={DIRECTION_OPTIONS} value={direction} onChange={setDirection} />
      </div>

      <div className={styles.summaryRow}>
        <p className={styles.summary}>{summary}</p>
        <Canto
          imposition={imposition}
          unit="leaf"
          orientation="horizontal"
          size="md"
          highlightedSheet={highlighted}
          onHoverSheet={setHoverSheet}
          ariaLabel={`Canto del ejemplar: ${summary}`}
          className={styles.canto}
        />
      </div>

      <p className={styles.readout} aria-live="polite">
        {focus ? describe(imposition, focus.page) : 'Pasa por una página para ver dónde cae; por un pliego, para ver sus hojas en el canto.'}
      </p>

      <ol key={version} className={styles.sheets} aria-label="Pliegos impuestos">
        {imposition.sheets.map((sheet) => {
          const stock = sheetStock[sheet.index];
          return (
            <li
              key={sheet.index}
              className={styles.sheet}
              data-highlighted={highlighted === sheet.index ? '' : undefined}
              data-cover={sheet.role === 'cover' ? '' : undefined}
              style={{ '--i': sheet.index } as CSSProperties}
              onPointerEnter={() => setHoverSheet(sheet.index)}
              onPointerLeave={() => setHoverSheet((current) => (current === sheet.index ? null : current))}
            >
              <div className={styles.sheetHead}>
                <span className={styles.numeral}>{sheet.number}</span>
                <span className={styles.role}>{roleText(sheet, imposition)}</span>
                <span
                  className={styles.edge}
                  style={{ '--fill': stock?.fill, '--rise': stock?.rise ?? 0 } as CSSProperties}
                  title={stock ? `Papel del cuadernillo: ${stock.stockName}` : undefined}
                />
              </div>
              <Face label="Cara" letters={['A', 'B']} side={sheet.front} sheet={sheet.index} onFocusPage={setFocus} focus={focus} />
              <Face label="Retiro" letters={['C', 'D']} side={sheet.back} sheet={sheet.index} onFocusPage={setFocus} focus={focus} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface FaceProps {
  label: string;
  letters: [string, string];
  side: SheetSide;
  sheet: number;
  focus: PageFocus | null;
  onFocusPage: (focus: PageFocus | null) => void;
}

function Face({ label, letters, side, sheet, focus, onFocusPage }: FaceProps) {
  const cells: Array<{ page: number; letter: string; slot: 'left' | 'right' }> = [
    { page: side.left, letter: letters[0], slot: 'left' },
    { page: side.right, letter: letters[1], slot: 'right' },
  ];
  return (
    <figure className={styles.face}>
      <figcaption className={styles.faceLabel}>
        {label} <span className={styles.faceLetters}>{letters.join(' | ')}</span>
      </figcaption>
      <div className={styles.faceSheet}>
        {cells.map((cell) => (
          <span
            key={cell.slot}
            className={styles.page}
            data-slot={cell.slot}
            data-focused={focus?.page === cell.page ? '' : undefined}
            onPointerEnter={() => onFocusPage({ page: cell.page, sheet })}
            onPointerLeave={() => onFocusPage(null)}
          >
            <span className={styles.folio}>
              <span className="visually-hidden">Página </span>
              {cell.page}
            </span>
            <span className={styles.letter} aria-hidden="true">
              {cell.letter}
            </span>
          </span>
        ))}
        <span className={styles.spine} aria-hidden="true" />
      </div>
    </figure>
  );
}
