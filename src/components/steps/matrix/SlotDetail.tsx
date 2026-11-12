import { ArrowLeftRight, Box, Layers, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { PageThumb } from '@/components/page/PageThumb';
import { decimal, FACE_TEXT, HALF_TEXT, POSITION_LONG, SEVERITY_LABEL, slotLetter, slotPositionShort } from '@/components/report/labels';
import { Button, ButtonGroup, Field, Icon, IconButton, NumberField, TONE_ICON, toast, Tooltip } from '@/components/ui';
import { useDerived, useProjectStore } from '@/lib/store';
import type { PageBox } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import { readingPartner, stockOf } from './matrixModel';
import styles from './SlotDetail.module.css';

export interface SlotDetailProps {
  page: number;
  onClose: () => void;
  onSelectPage: (page: number) => void;
}

export function SlotDetail({ page, onClose, onSelectPage }: SlotDetailProps) {
  const derived = useDerived();
  const config = useProjectStore((state) => state.config);
  const pages = useProjectStore((state) => state.pages);
  const guides = useProjectStore((state) => state.viewer.guides);
  const setGuides = useProjectStore((state) => state.setGuides);
  const swapPages = useProjectStore((state) => state.swapPages);
  const openPageInViewer = useProjectStore((state) => state.openPageInViewer);
  const openSheetInViewer = useProjectStore((state) => state.openSheetInViewer);
  const headingId = useId();

  const { imposition, pageCount, effectivePages, unitsById } = derived;
  const placement = imposition.placements[page - 1];
  const sheet = placement ? imposition.sheets[placement.sheetIndex] : undefined;
  const entry = effectivePages[page - 1];
  const unit = entry?.unitId ? unitsById.get(entry.unitId) : undefined;
  const partner = readingPartner(page, pageCount);
  const issues = derived.issuesByPage.get(page) ?? [];

  const [swapWith, setSwapWith] = useState<number | null>(partner ?? (page < pageCount ? page + 1 : page - 1));
  useEffect(() => setSwapWith(partner ?? (page < pageCount ? page + 1 : page - 1)), [page, partner, pageCount]);

  if (!placement || !sheet) return null;

  const hasExtra = config.bleedMm > 0 || config.marksMm > 0;
  const box: PageBox = hasExtra ? 'source' : 'trim';
  const interiorSignatures = imposition.signatures.filter((signature) => signature.role === 'interior');
  const interiorOrdinal = interiorSignatures.findIndex((signature) => signature.index === sheet.signature);
  const stock = stockOf(sheet.role === 'cover' ? 'cover' : 'interior', interiorOrdinal >= 0 ? interiorOrdinal : null, interiorSignatures.length);
  const signatureInfo = imposition.signatures[sheet.signature];
  const signatureText = signatureInfo?.role === 'cover' ? 'Cubierta' : interiorSignatures.length <= 1 ? 'Cuadernillo único' : `Cuadernillo ${interiorOrdinal + 1}`;

  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';
  const indexOf = (n: number): number => {
    const id = effectivePages[n - 1]?.id;
    return id ? pages.findIndex((candidate) => candidate.id === id) : -1;
  };
  const ownIndex = indexOf(page);
  const otherIndex = swapWith !== null ? indexOf(swapWith) : -1;
  let swapBlock: string | null = null;
  if (printer) swapBlock = 'En pliegos de imprenta el orden lo dicta la imposición: corrígelo en los archivos.';
  else if (ownIndex < 0) swapBlock = 'Las cortesías automáticas no se mueven: inserta blancas a mano en la carga.';
  else if (swapWith === null || swapWith === page) swapBlock = 'Elige otra página.';
  else if (otherIndex < 0) swapBlock = `La página ${swapWith} es una cortesía automática y no se puede mover.`;

  const doSwap = (): void => {
    if (swapBlock || swapWith === null) return;
    const other = swapWith;
    swapPages(ownIndex, otherIndex);
    toast({
      title: `Páginas ${Math.min(page, other)} y ${Math.max(page, other)} intercambiadas`,
      tone: 'success',
      action: { label: 'Deshacer', onClick: () => useProjectStore.getState().swapPages(ownIndex, otherIndex) },
    });
  };

  const despieceLabel = `Abrir ${placement.face === 'front' ? 'la cara' : 'el retiro'} del pliego ${String(sheet.number)} extendido en el visor (despiece)`;

  const facts: [string, ReactNode][] = [
    [
      'Casilla',
      <>
        Pliego {sheet.number} · {FACE_TEXT[placement.face]} · {POSITION_LONG[placement.position]} <span className={styles.letter}>{slotLetter(placement.face, placement.position)}</span>
      </>,
    ],
    ['Cuadernillo', `${signatureText} · ${stock.name}`],
    [
      'Enfrentada con',
      partner !== null ? (
        <button type="button" className={styles.link} onClick={() => onSelectPage(partner)}>
          Página {partner}
        </button>
      ) : page === 1 ? (
        'Nadie: es la portada'
      ) : (
        'Nadie: es la contraportada'
      ),
    ],
    [
      'Origen',
      entry?.origin === 'auto-blank'
        ? 'Cortesía añadida para cerrar el pliego'
        : entry?.origin === 'manual-blank'
          ? 'Blanca insertada a mano'
          : unit
            ? `${unit.label}${entry && entry.half !== 'full' ? ` · ${HALF_TEXT[entry.half]}` : ''}`
            : 'Sin archivo',
    ],
    [
      'Folio detectado',
      entry && entry.detectedFolio !== null ? (
        <span className={cx(entry.detectedFolio !== page && styles.mismatch)}>
          {entry.detectedFolio}
          {entry.detectedFolio !== page ? ` (está en la posición ${page})` : ''}
        </span>
      ) : (
        <span className={styles.muted}>No detectado</span>
      ),
    ],
  ];
  if (unit?.widthMm && unit.heightMm) facts.push(['Tamaño', `${decimal(unit.widthMm)} × ${decimal(unit.heightMm)} mm en el archivo`]);

  return (
    <section className={styles.detail} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          Página <span className={styles.titleNumber}>{page}</span>
        </h2>
        <span className={styles.slotText}>{slotPositionShort(placement.face, placement.position)}</span>
        <IconButton size="sm" label="Cerrar el detalle" tooltipExtra="(Esc)" icon={<Icon icon={X} size={14} />} onClick={onClose} className={styles.close} />
      </header>

      <div className={styles.preview}>
        <div className={styles.previewPaper}>
          <PageThumb pageNumber={page} box={box} guides={guides} lazy={false} />
        </div>
        <div className={styles.previewSide}>
          <ButtonGroup aria-label="Guías sobre la vista previa" className={styles.guides}>
            <Button
              size="sm"
              variant="ghost"
              pressed={guides.trim}
              iconStart={<span className={styles.swatchTrim} aria-hidden="true" />}
              onClick={() => setGuides({ trim: !guides.trim })}
              aria-disabled={!hasExtra || undefined}
              title={hasExtra ? undefined : 'El archivo va a corte: el borde de la miniatura ya es la línea de corte'}
            >
              Corte
            </Button>
            <Button
              size="sm"
              variant="ghost"
              pressed={guides.bleed}
              iconStart={<span className={styles.swatchBleed} aria-hidden="true" />}
              onClick={() => setGuides({ bleed: !guides.bleed })}
              aria-disabled={config.bleedMm === 0 || undefined}
              title={config.bleedMm === 0 ? 'El archivo no trae sangrado (0 mm en la configuración)' : undefined}
            >
              Sangrado
            </Button>
            <Button size="sm" variant="ghost" pressed={guides.safe} iconStart={<span className={styles.swatchSafe} aria-hidden="true" />} onClick={() => setGuides({ safe: !guides.safe })}>
              Zona segura
            </Button>
          </ButtonGroup>
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" iconStart={<Icon icon={Box} size={14} />} onClick={() => openPageInViewer(page)}>
              Ver en 3D
            </Button>
            <Tooltip content={despieceLabel} placement="left">
              <Button size="sm" variant="secondary" iconStart={<Icon icon={Layers} size={14} />} onClick={() => openSheetInViewer(sheet.index, placement.face)}>
                Despiece
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      <dl className={styles.facts}>
        {facts.map(([term, value]) => (
          <div key={term} className={styles.fact}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {issues.length > 0 && (
        <ul className={styles.issues} aria-label="Incidencias de esta página">
          {issues.map((issue) => (
            <li key={issue.id} className={cx(styles.issue, styles[`tone-${issue.severity}`])}>
              <Icon icon={TONE_ICON[issue.severity]} size={14} className={styles.issueIcon} label={SEVERITY_LABEL[issue.severity].one} />
              <span>{issue.title}</span>
            </li>
          ))}
        </ul>
      )}

      <Field label="Intercambiar con la página…" hint={swapBlock && swapBlock !== 'Elige otra página.' ? swapBlock : undefined} className={styles.swap}>
        <div className={styles.swapRow}>
          <NumberField
            size="sm"
            value={swapWith}
            min={1}
            max={pageCount}
            onChange={setSwapWith}
            disabled={printer || ownIndex < 0}
            onKeyDown={(event) => {
              if (event.key === 'Enter') doSwap();
            }}
            boxClassName={styles.swapBox}
          />
          <Button size="sm" variant="secondary" iconStart={<Icon icon={ArrowLeftRight} size={14} />} onClick={doSwap} disabled={swapBlock !== null}>
            Intercambiar
          </Button>
        </div>
      </Field>
    </section>
  );
}
