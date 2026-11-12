import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Callout,
  FormSection,
  Icon,
  IconButton,
  NumberField,
  RadioCards,
  SegmentedControl,
  Select,
  Switch,
  type RadioCardOption,
  type SegmentedOption,
  type SelectOption,
} from '@/components/ui';
import { COVER_PAPERS, INTERIOR_PAPERS, SIGNATURE_PAGE_OPTIONS, TRIM_PRESETS } from '@/lib/imposition';
import type { PaperPreset } from '@/lib/imposition';
import { PREVIEW_PAGE_COUNT, useDerived, useProjectStore } from '@/lib/store';
import type { BindingType, BlankPlacement, InputMode, IssueCode, ReadingDirection, SpreadKind } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { PagesDiagram, PerfectDiagram, SaddleDiagram, SpreadsDiagram } from './diagrams';
import { PageBoxesDiagram } from './PageBoxesDiagram';
import styles from './SetupForm.module.css';
import {
  capacityOf,
  courtesyNote,
  DEFAULT_BLEED_MM,
  DEFAULT_MARKS_MM,
  expectedInput,
  formatNumber,
  formatSpine,
  formatTrimNumbers,
  hasCoverPaper,
  PAPER_CUSTOM,
  paperPresetId,
  plural,
  TRIM_AUTO,
  TRIM_CUSTOM,
  TRIM_LIMITS,
  trimFromSelect,
  trimSelectValue,
} from './setupModel';

const INPUT_OPTIONS: readonly RadioCardOption<InputMode>[] = [
  {
    value: 'pages',
    title: 'Páginas individuales',
    description: 'Un archivo por página, o un PDF con las páginas seguidas 1, 2, 3…',
    illustration: <PagesDiagram />,
  },
  {
    value: 'spreads',
    title: 'Pliegos dobles',
    description: 'Hojas apaisadas con dos páginas cada una.',
    illustration: <SpreadsDiagram />,
  },
];

const SPREAD_KIND_OPTIONS: readonly SegmentedOption<SpreadKind>[] = [
  { value: 'reader', label: 'De lectura' },
  { value: 'printer', label: 'De imprenta, ya impuestos' },
];

const SPREAD_KIND_HINT: Record<SpreadKind, string> = {
  reader: 'Páginas enfrentadas 2-3, 4-5…: se cortan por el eje central.',
  printer: 'Cara y retiro de cada pliego, tal como van a máquina: se calcula la imposición inversa.',
};

const BINDING_OPTIONS: readonly RadioCardOption<BindingType>[] = [
  {
    value: 'saddle-stitch',
    title: 'Grapada a caballo',
    description: 'Pliegos encartados uno dentro de otro y grapados por el lomo.',
    illustration: <SaddleDiagram />,
  },
  {
    value: 'perfect-bound',
    title: 'Lomo cuadrado o cosido',
    description: 'Cuadernillos apilados, con lomo plano y cubierta envolvente.',
    illustration: <PerfectDiagram />,
  },
];

const SIGNATURE_OPTIONS: readonly SelectOption[] = SIGNATURE_PAGE_OPTIONS.map((pages) => {
  const sheets = pages / 4;
  return { value: String(pages), label: `${String(pages)} págs. · ${String(sheets)} ${plural(sheets, 'pliego', 'pliegos')}` };
});

type PageCountMode = 'files' | 'declared';

const PAGE_COUNT_OPTIONS: readonly SegmentedOption<PageCountMode>[] = [
  { value: 'files', label: 'Según los archivos' },
  { value: 'declared', label: 'Declarar total' },
];

const PLACEMENT_OPTIONS: readonly SelectOption<BlankPlacement>[] = [
  { value: 'before-back-cover', label: 'Antes de la contraportada' },
  { value: 'end', label: 'Al final' },
];

const DIRECTION_OPTIONS: readonly SegmentedOption<ReadingDirection>[] = [
  { value: 'ltr', label: 'Izquierda → derecha' },
  { value: 'rtl', label: 'Derecha → izquierda' },
];

const DIRECTION_HINT: Record<ReadingDirection, string> = {
  ltr: 'Occidental: el lomo queda a la izquierda de la portada y las impares van a la derecha.',
  rtl: 'Árabe, hebreo, manga: el lomo queda a la derecha de la portada y se hojea hacia la izquierda.',
};

const TRIM_OPTIONS: readonly SelectOption[] = [
  { value: TRIM_AUTO, label: 'Según el archivo' },
  ...TRIM_PRESETS.map((preset) => ({ value: preset.id, label: `${preset.label} · ${formatNumber(preset.widthMm)} × ${formatNumber(preset.heightMm)} mm` })),
  { value: TRIM_CUSTOM, label: 'Personalizado' },
];

const BINDING_ISSUES: ReadonlySet<IssueCode> = new Set(['saddle-stitch-too-thick', 'spine-too-thin', 'signature-remainder']);

function paperOptions(presets: readonly PaperPreset[], current: string | null, gsm: number, caliperMm: number): SelectOption[] {
  const options: SelectOption[] = presets.map((preset) => ({ value: preset.id, label: `${preset.label} · ${formatNumber(preset.caliperMm, 3)} mm` }));
  if (current === null) options.unshift({ value: PAPER_CUSTOM, label: `A medida · ${formatNumber(gsm, 0)} g · ${formatNumber(caliperMm, 3)} mm` });
  return options;
}

export function SetupForm() {
  const config = useProjectStore((state) => state.config);
  const updateConfig = useProjectStore((state) => state.updateConfig);
  const applyFix = useProjectStore((state) => state.applyFix);
  const derived = useDerived();
  const { hasPages, spine, trim, imposition } = derived;

  const [lastBleed, setLastBleed] = useState(config.bleedMm > 0 ? config.bleedMm : DEFAULT_BLEED_MM);
  const [lastMarks, setLastMarks] = useState(config.marksMm > 0 ? config.marksMm : DEFAULT_MARKS_MM);

  const spreads = config.inputMode === 'spreads';
  const printer = spreads && config.spreadKind === 'printer';
  const perfect = config.binding === 'perfect-bound';
  const coverPaper = hasCoverPaper(config);

  const interiorId = paperPresetId(INTERIOR_PAPERS, config.paper.interiorGsm, config.paper.interiorCaliperMm);
  const coverId = paperPresetId(COVER_PAPERS, config.paper.coverGsm, config.paper.coverCaliperMm);

  const capacity = capacityOf({ hasPages, supplied: derived.suppliedPageCount, declared: config.declaredPageCount, preview: PREVIEW_PAGE_COUNT });
  const pageCountMode: PageCountMode = config.declaredPageCount === null ? 'files' : 'declared';
  const autoBlankNumbers = derived.blankPageNumbers.filter((page) => derived.effectivePages[page - 1]?.origin !== 'manual-blank');
  const expected = hasPages ? null : expectedInput(config, capacity.wanted, imposition);

  const bindingIssues = derived.issues.filter((issue) => BINDING_ISSUES.has(issue.code));
  const trimValue = trimSelectValue(config.trim);
  const minSide = Math.min(trim.widthMm, trim.heightMm);
  const safeTooBig = 2 * config.safeMarginMm >= minSide;

  const onPageCountMode = (mode: PageCountMode): void => {
    if (mode === 'files') updateConfig({ declaredPageCount: null });
    else updateConfig({ declaredPageCount: hasPages ? Math.max(4, derived.suppliedPageCount) : derived.pageCount });
  };

  return (
    <div className={styles.form}>
      <FormSection title="Entrada" description="Cómo llegan las páginas en los archivos que vas a cargar.">
        <RadioCards<InputMode>
          aria-label="Tipo de archivo"
          options={INPUT_OPTIONS}
          value={config.inputMode}
          onChange={(inputMode) => updateConfig({ inputMode })}
          columns={2}
        />
        {spreads && (
          <div className={styles.branch}>
            <SegmentedControl<SpreadKind>
              label="Los pliegos son…"
              options={SPREAD_KIND_OPTIONS}
              value={config.spreadKind}
              onChange={(spreadKind) => updateConfig({ spreadKind })}
              hint={SPREAD_KIND_HINT[config.spreadKind]}
              block
            />
            {!printer && (
              <Switch
                label="La primera hoja es contraportada + portada"
                description="Cubierta envolvente: portada y contraportada llegan juntas en la primera hoja, abiertas por el lomo."
                checked={config.wraparoundCover}
                onChange={(wraparoundCover) => updateConfig({ wraparoundCover })}
              />
            )}
          </div>
        )}
        {expected && (
          <p className={styles.readout}>
            <span className={styles.readoutLabel}>{plural(expected.units, 'Se espera', 'Se esperan')}</span>
            <strong key={expected.label} className={styles.readoutValue}>
              {expected.label}
            </strong>
            <span key={expected.sample} className={cx(styles.readoutNote, styles.tick)}>
              {expected.detail}: <span className={styles.sequence}>{expected.sample}</span>
            </span>
          </p>
        )}
      </FormSection>

      <FormSection divided title="Encuadernación">
        <RadioCards<BindingType>
          aria-label="Tipo de encuadernación"
          options={BINDING_OPTIONS}
          value={config.binding}
          onChange={(binding) => updateConfig({ binding })}
          columns={2}
        />
        {perfect && (
          <div className={styles.pair}>
            <Select
              label="Páginas por cuadernillo"
              options={SIGNATURE_OPTIONS}
              value={String(config.signaturePages)}
              onValueChange={(value) => updateConfig({ signaturePages: Number(value) })}
            />
            <Switch label="Cubierta aparte de 4 páginas" checked={config.separateCover} onChange={(separateCover) => updateConfig({ separateCover })} rootClassName={styles.pairSwitch} />
          </div>
        )}
        <div className={cx(styles.pair, styles.pairTop)}>
          <Select
            label="Papel de tripa"
            options={paperOptions(INTERIOR_PAPERS, interiorId, config.paper.interiorGsm, config.paper.interiorCaliperMm)}
            value={interiorId ?? PAPER_CUSTOM}
            onValueChange={(id) => {
              const preset = INTERIOR_PAPERS.find((candidate) => candidate.id === id);
              if (preset) updateConfig({ paper: { ...config.paper, interiorGsm: preset.gsm, interiorCaliperMm: preset.caliperMm } });
            }}
          />
          <Select
            label="Papel de cubierta"
            options={paperOptions(COVER_PAPERS, coverId, config.paper.coverGsm, config.paper.coverCaliperMm)}
            value={coverId ?? PAPER_CUSTOM}
            disabled={!coverPaper}
            hint={coverPaper ? undefined : 'Sin cubierta aparte, todo va en papel de tripa.'}
            onValueChange={(id) => {
              const preset = COVER_PAPERS.find((candidate) => candidate.id === id);
              if (preset) updateConfig({ paper: { ...config.paper, coverGsm: preset.gsm, coverCaliperMm: preset.caliperMm } });
            }}
          />
        </div>
        <p className={styles.readout}>
          <span className={styles.readoutLabel}>Lomo estimado</span>
          <strong key={formatSpine(spine.widthMm)} className={styles.readoutValue}>
            {formatSpine(spine.widthMm)} mm
          </strong>
          <span className={styles.readoutNote}>
            {spine.interiorLeaves} {plural(spine.interiorLeaves, 'hoja', 'hojas')} de tripa
            {spine.coverLeaves > 0 ? ` + ${String(spine.coverLeaves)} de cubierta` : ''}
            {spine.creepMm > 0 ? ` · el pliego central sobresale ${formatNumber(spine.creepMm, 2)} mm` : ''}
          </span>
        </p>
        {bindingIssues.map((issue) => (
          <Callout
            key={issue.id}
            tone={issue.severity}
            title={issue.title}
            action={
              issue.fix ? (
                <Button size="sm" onClick={() => issue.fix && applyFix(issue.fix)}>
                  {issue.fix.label}
                </Button>
              ) : undefined
            }
          >
            {issue.detail}
          </Callout>
        ))}
      </FormSection>

      <FormSection
        divided
        title="Páginas"
        aside={
          <span className={styles.aside}>
            <strong key={derived.pageCount} className={styles.tick}>{derived.pageCount}</strong> págs. ·{' '}
            <strong key={`s${String(imposition.sheets.length)}`} className={styles.tick}>{imposition.sheets.length}</strong> {plural(imposition.sheets.length, 'pliego', 'pliegos')}
          </span>
        }
      >
        <SegmentedControl<PageCountMode>
          aria-label="Total de páginas"
          options={PAGE_COUNT_OPTIONS}
          value={pageCountMode}
          onChange={onPageCountMode}
          hint={
            pageCountMode === 'files'
              ? hasPages
                ? `Los archivos aportan ${String(derived.suppliedPageCount)} ${plural(derived.suppliedPageCount, 'página', 'páginas')}.`
                : `Sin archivos todavía: la maqueta prevé ${String(PREVIEW_PAGE_COUNT)} páginas.`
              : undefined
          }
          block
        />
        {pageCountMode === 'declared' && (
          <NumberField
            label="Total de páginas"
            unit="págs."
            min={4}
            max={1000}
            value={config.declaredPageCount}
            onChange={(value) => updateConfig({ declaredPageCount: value ?? 4 })}
            hint={
              hasPages
                ? `Los archivos aportan ${String(derived.suppliedPageCount)}. Si declaras más, el hueco se completa con cortesías y el pre-vuelo lo avisa.`
                : 'Incluye portada, contraportada y sus interiores.'
            }
            boxClassName={styles.countBox}
          />
        )}
        {capacity.missing > 0 && !printer && (
          <Callout
            tone={config.autoPadBlanks ? 'info' : 'warning'}
            title={`${String(capacity.wanted)} no cierra pliego: ${plural(capacity.missing, 'falta 1 página', `faltan ${String(capacity.missing)} páginas`)}`}
          >
            <p>{courtesyNote({ capacity, autoPadBlanks: config.autoPadBlanks, blankNumbers: autoBlankNumbers })}</p>
            <div className={styles.fix}>
              <Switch label="Completar con páginas de cortesía" checked={config.autoPadBlanks} onChange={(autoPadBlanks) => updateConfig({ autoPadBlanks })} />
              <Select<BlankPlacement>
                label="Dónde van"
                inline
                size="sm"
                options={PLACEMENT_OPTIONS}
                value={config.blankPlacement}
                disabled={!config.autoPadBlanks}
                onValueChange={(blankPlacement) => updateConfig({ blankPlacement })}
                fieldClassName={styles.placement}
              />
            </div>
          </Callout>
        )}
        {capacity.missing > 0 && printer && !hasPages && (
          <Callout
            tone="warning"
            title={`${String(capacity.wanted)} no cierra pliego: ${plural(capacity.missing, 'falta 1 página', `faltan ${String(capacity.missing)} páginas`)}`}
            action={
              <Button size="sm" onClick={() => updateConfig({ declaredPageCount: capacity.padded })}>
                Declarar {capacity.padded}
              </Button>
            }
          >
            Cada pliego de imprenta trae sus 4 páginas ya impuestas, así que el total va de 4 en 4. La maqueta prevé {capacity.padded / 4} pliegos.
          </Callout>
        )}
      </FormSection>

      <FormSection divided title="Lectura">
        <SegmentedControl<ReadingDirection>
          aria-label="Dirección de lectura"
          options={DIRECTION_OPTIONS}
          value={config.readingDirection}
          onChange={(readingDirection) => updateConfig({ readingDirection })}
          hint={DIRECTION_HINT[config.readingDirection]}
          block
        />
      </FormSection>

      <FormSection
        divided
        title="Formato y sangrado"
        aside={
          <span className={styles.aside}>
            <strong key={formatTrimNumbers(trim)} className={styles.tick}>{formatTrimNumbers(trim)}</strong> mm
          </span>
        }
      >
        <Select
          label="Formato"
          options={TRIM_OPTIONS}
          value={trimValue}
          onValueChange={(value) => updateConfig({ trim: trimFromSelect(value, trim) })}
          hint={
            trimValue === TRIM_AUTO
              ? hasPages
                ? `Deducido de los archivos: ${formatTrimNumbers(trim)} mm.`
                : `Sin archivos se supone ${formatTrimNumbers(trim)} mm; al cargar se toma el del archivo.`
              : 'Las páginas de otro tamaño se señalarán en el pre-vuelo.'
          }
        />
        {config.trim.mode === 'fixed' && config.trim.presetId === null && (
          <div className={styles.dims}>
            <NumberField
              label="Ancho"
              unit="mm"
              min={TRIM_LIMITS.min}
              max={TRIM_LIMITS.max}
              step={1}
              decimals={1}
              value={config.trim.widthMm}
              onChange={(value) => value !== null && updateConfig({ trim: { mode: 'fixed', presetId: null, widthMm: value, heightMm: trim.heightMm } })}
            />
            <IconButton
              label="Intercambiar ancho y alto"
              className={styles.swap}
              icon={<Icon icon={ArrowLeftRight} />}
              onClick={() => updateConfig({ trim: { mode: 'fixed', presetId: null, widthMm: trim.heightMm, heightMm: trim.widthMm } })}
            />
            <NumberField
              label="Alto"
              unit="mm"
              min={TRIM_LIMITS.min}
              max={TRIM_LIMITS.max}
              step={1}
              decimals={1}
              value={config.trim.heightMm}
              onChange={(value) => value !== null && updateConfig({ trim: { mode: 'fixed', presetId: null, widthMm: trim.widthMm, heightMm: value } })}
            />
          </div>
        )}

        <div className={styles.rows}>
          <div className={styles.toggleRow}>
            <Switch
              label="El archivo incluye sangrado"
              description="Imagen que rebasa el corte, por lado. Lo habitual: 3 mm."
              checked={config.bleedMm > 0}
              onChange={(on) => updateConfig({ bleedMm: on ? lastBleed : 0 })}
            />
            <NumberField
              label="Sangrado por lado"
              labelHidden
              unit="mm"
              min={0.5}
              max={20}
              step={0.5}
              decimals={1}
              value={config.bleedMm > 0 ? config.bleedMm : lastBleed}
              disabled={config.bleedMm === 0}
              onChange={(value) => {
                if (value === null) return;
                setLastBleed(value);
                updateConfig({ bleedMm: value });
              }}
              boxClassName={styles.mmBox}
            />
          </div>
          {config.bleedMm > 10 && <p className={styles.note}>Más de 10 mm de sangrado es poco habitual: comprueba la medida.</p>}

          <div className={styles.toggleRow}>
            <Switch
              label="El archivo incluye marcas de corte"
              description="Margen de marcas: distancia del borde del sangrado al borde del archivo."
              checked={config.marksMm > 0}
              onChange={(on) => updateConfig({ marksMm: on ? lastMarks : 0 })}
            />
            <NumberField
              label="Margen de marcas"
              labelHidden
              unit="mm"
              min={1}
              max={40}
              step={0.5}
              decimals={1}
              value={config.marksMm > 0 ? config.marksMm : lastMarks}
              disabled={config.marksMm === 0}
              onChange={(value) => {
                if (value === null) return;
                setLastMarks(value);
                updateConfig({ marksMm: value });
              }}
              boxClassName={styles.mmBox}
            />
          </div>

          <NumberField
            label="Zona segura"
            inline
            unit="mm"
            min={0}
            max={50}
            step={0.5}
            decimals={1}
            value={config.safeMarginMm}
            onChange={(value) => value !== null && updateConfig({ safeMarginMm: value })}
            hint="Margen hacia dentro del corte donde no debe haber texto."
            error={safeTooBig ? `Con ${formatNumber(minSide)} mm de lado, la zona segura debe quedar por debajo de ${formatNumber(minSide / 2)} mm.` : undefined}
            boxClassName={styles.mmBox}
            fieldClassName={styles.safeField}
          />
        </div>

        <div className={styles.plate}>
          <PageBoxesDiagram trim={trim} bleedMm={config.bleedMm} marksMm={config.marksMm} safeMarginMm={config.safeMarginMm} />
        </div>
      </FormSection>
    </div>
  );
}
