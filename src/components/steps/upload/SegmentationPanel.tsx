import { useMemo } from 'react';

import { SegmentedControl, Switch } from '@/components/ui';
import { classifyUnits } from '@/lib/imposition';
import { useDerived, useProjectStore } from '@/lib/store';
import type { InputMode, PageHalf, SourceUnit, SpreadKind } from '@/lib/types';

import { CutDiagram, type CutHalf } from './CutDiagram';
import { plural, segmentationSummary } from './format';
import { Panel } from './Panel';
import styles from './SegmentationPanel.module.css';

const INPUT_OPTIONS = [
  { value: 'pages', label: 'Páginas sueltas' },
  { value: 'spreads', label: 'Pliegos dobles' },
] as const;

const KIND_OPTIONS = [
  { value: 'reader', label: 'De lectura', hint: 'Páginas enfrentadas 2-3, 4-5…: se cortan por el eje central' },
  { value: 'printer', label: 'De imprenta', hint: 'Cara y retiro de cada pliego, ya impuestos: se calcula la imposición inversa' },
] as const;

export interface SegmentationPanelProps {
  selectedId: string | null;
  onGoToConfig: () => void;
}

export function SegmentationPanel({ selectedId, onGoToConfig }: SegmentationPanelProps) {
  const config = useProjectStore((state) => state.config);
  const units = useProjectStore((state) => state.units);
  const pages = useProjectStore((state) => state.pages);
  const updateConfig = useProjectStore((state) => state.updateConfig);
  const { effectivePages, blankPageNumbers } = useDerived();

  const kinds = useMemo(() => classifyUnits(units, config.inputMode), [units, config.inputMode]);
  const fromFiles = pages.filter((page) => page.origin === 'file').length;
  const summary = segmentationSummary(config, units, kinds, fromFiles);
  const manualBlanks = pages.filter((page) => page.origin === 'manual-blank').length;
  const autoBlanks = blankPageNumbers.length - manualBlanks;

  const spreads = config.inputMode === 'spreads';
  const printer = spreads && config.spreadKind === 'printer';

  const cut = useMemo(() => {
    if (!spreads) return null;
    const pageNumberOf = new Map<string, number>();
    effectivePages.forEach((page, index) => {
      if (page.unitId !== null) pageNumberOf.set(`${page.unitId}:${page.half}`, index + 1);
    });
    const selected = selectedId !== null ? effectivePages.find((page) => page.id === selectedId) : undefined;
    const ordered = [...units].sort((a, b) => a.order - b.order);
    const doubles = ordered.filter((unit) => pageNumberOf.has(`${unit.id}:left`) && pageNumberOf.has(`${unit.id}:right`));
    const selectedUnit: SourceUnit | undefined =
      selected?.unitId && selected.half !== 'full' ? units.find((candidate) => candidate.id === selected.unitId) : undefined;
    const unit = selectedUnit ?? doubles[1] ?? doubles[0];
    if (!unit) return null;
    const half = (side: PageHalf): CutHalf => ({
      pageNumber: pageNumberOf.get(`${unit.id}:${side}`) ?? null,
      highlighted: selected?.unitId === unit.id && selected.half === side,
    });
    return {
      unit,
      position: ordered.indexOf(unit) + 1,
      total: ordered.length,
      left: half('left'),
      right: half('right'),
    };
  }, [spreads, effectivePages, selectedId, units]);

  return (
    <Panel id="carga-segmentacion" title="Segmentación" aside={`${String(effectivePages.length)} ${plural(effectivePages.length, 'página', 'páginas')}`}>
      <div className={styles.summary}>
        <p className={styles.headline}>{summary.headline}</p>
        {summary.breakdown ? <p className={styles.breakdown}>{summary.breakdown}</p> : null}
        {autoBlanks > 0 || manualBlanks > 0 ? (
          <p className={styles.breakdown}>
            {[
              autoBlanks > 0 ? `+ ${String(autoBlanks)} ${plural(autoBlanks, 'cortesía', 'cortesías')} para cerrar pliego` : null,
              manualBlanks > 0 ? `+ ${String(manualBlanks)} ${plural(manualBlanks, 'blanca', 'blancas')} a mano` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>

      <div className={styles.controls}>
        <SegmentedControl<InputMode>
          size="sm"
          block
          label="Entrada"
          options={INPUT_OPTIONS}
          value={config.inputMode}
          onChange={(inputMode) => updateConfig({ inputMode })}
        />
        {spreads ? (
          <SegmentedControl<SpreadKind>
            size="sm"
            block
            label="Los pliegos son"
            options={KIND_OPTIONS}
            value={config.spreadKind}
            onChange={(spreadKind) => updateConfig({ spreadKind })}
          />
        ) : null}
        {spreads && !printer ? (
          <Switch
            checked={config.wraparoundCover}
            onChange={(wraparoundCover) => updateConfig({ wraparoundCover })}
            label="Cubierta envolvente"
            description="La primera hoja es contraportada + portada"
          />
        ) : null}
        {printer ? (
          <p className={styles.note}>
            Imposición inversa {config.binding === 'saddle-stitch' ? 'a caballo' : `en cuadernillos de ${String(config.signaturePages)} págs.`}
            {config.readingDirection === 'rtl' ? ', de derecha a izquierda' : ''}.{' '}
            <button type="button" className={styles.link} onClick={onGoToConfig}>
              Cambiar encuadernación
            </button>
          </p>
        ) : null}
      </div>

      {cut ? (
        <figure className={styles.cut}>
          <CutDiagram unit={cut.unit} left={cut.left} right={cut.right} rtl={config.readingDirection === 'rtl'} />
          <figcaption className={styles.caption}>
            <span className={styles.captionTitle}>
              Hoja {cut.position} de {cut.total}
            </span>
            <span className={styles.captionFile}>{cut.unit.label}</span>
            <span>{printer ? 'Cara de pliego: cada mitad va a su página por imposición inversa.' : 'Se corta por el eje central.'}</span>
          </figcaption>
        </figure>
      ) : null}
    </Panel>
  );
}
