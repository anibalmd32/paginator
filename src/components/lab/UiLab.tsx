import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, Download, FileUp, Grid3x3, Layers, Maximize2, RotateCcw, Ruler, ScanEye, View } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Canto, type CantoHandle } from '@/components/canto/Canto';
import { samplePerfectBound, sampleSaddleStitch } from '@/components/canto/sampleImposition';
import { AppHeader, AppShell, PreflightChip, StepLayout, type StepTabItem } from '@/components/shell';
import {
  Button,
  ButtonGroup,
  Callout,
  Checkbox,
  EmptyState,
  FormSection,
  Icon,
  IconButton,
  Kbd,
  NumberField,
  Popover,
  ProgressBar,
  RadioCards,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  Tag,
  TextField,
  toast,
  Toolbar,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@/components/ui';
import { formatDecimal } from '@/components/ui/numberFormat';
import type { BindingType, ImpositionResult, InputMode, IssueSeverity, ReadingDirection, SpreadKind } from '@/lib/types';

import styles from './UiLab.module.css';

const DIAGRAM = { width: 72, height: 40, viewBox: '0 0 72 40', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true } as const;

const diagrams: Record<InputMode | BindingType, ReactNode> = {
  pages: (
    <svg {...DIAGRAM}>
      <rect x="14" y="6" width="20" height="28" rx="1" />
      <rect x="38" y="6" width="20" height="28" rx="1" />
      <path d="M18 12h12M18 16h9M42 12h12M42 16h9" />
    </svg>
  ),
  spreads: (
    <svg {...DIAGRAM}>
      <rect x="12" y="6" width="48" height="28" rx="1" />
      <path d="M36 6v28" strokeDasharray="2 2" />
      <path d="M16 12h14M16 16h10M40 12h14M40 16h10" />
    </svg>
  ),
  'saddle-stitch': (
    <svg {...DIAGRAM}>
      <path d="M36 6 14 12v22l22-6M36 6l22 6v22l-22-6" />
      <path d="M36 9 18 14M36 9l18 5" />
      <path d="M36 6v22" strokeWidth="2.5" />
    </svg>
  ),
  'perfect-bound': (
    <svg {...DIAGRAM}>
      <rect x="20" y="6" width="32" height="28" rx="1" />
      <path d="M20 6h6v28h-6" fill="currentColor" fillOpacity="0.25" />
      <path d="M30 6v28M34 6v28M38 6v28" strokeOpacity="0.6" />
    </svg>
  ),
};

const STEP_LABELS = ['Configuración', 'Carga', 'Pliegos', 'Visor 3D'] as const;

const TRIM_OPTIONS = [
  { value: 'a4', label: 'A4 · 210 × 297 mm' },
  { value: 'carta', label: 'Carta · 216 × 279 mm' },
  { value: 'revista', label: 'Revista · 230 × 300 mm' },
  { value: 'a5', label: 'A5 · 148 × 210 mm' },
  { value: 'libre', label: 'Formato libre' },
] as const;
type TrimId = (typeof TRIM_OPTIONS)[number]['value'];

const TRIM_MM: Record<TrimId, [number, number]> = { a4: [210, 297], carta: [216, 279], revista: [230, 300], a5: [148, 210], libre: [200, 260] };

type Sample = 'p8' | 'p32' | 'p96';

const SAMPLES: Record<Sample, { pageCount: number; binding: BindingType; signaturePages: number; separateCover: boolean }> = {
  p8: { pageCount: 8, binding: 'saddle-stitch', signaturePages: 16, separateCover: false },
  p32: { pageCount: 32, binding: 'saddle-stitch', signaturePages: 16, separateCover: false },
  p96: { pageCount: 96, binding: 'perfect-bound', signaturePages: 16, separateCover: true },
};

function spineMm(pageCount: number, caliper: number, binding: BindingType): number {
  const leaves = pageCount / 2;
  return binding === 'perfect-bound' ? leaves * caliper + 0.6 : leaves * caliper;
}

export function UiLab() {
  const [title, setTitle] = useState('Canto nº 12 · noviembre');
  const [step, setStep] = useState(1);

  const [inputMode, setInputMode] = useState<InputMode>('pages');
  const [spreadKind, setSpreadKind] = useState<SpreadKind>('reader');
  const [binding, setBinding] = useState<BindingType>('saddle-stitch');
  const [pageCount, setPageCount] = useState<number | null>(32);
  const [signaturePages, setSignaturePages] = useState('16');
  const [separateCover, setSeparateCover] = useState(true);
  const [autoPad, setAutoPad] = useState(true);
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [trim, setTrim] = useState<TrimId>('a4');
  const [bleed, setBleed] = useState<number | null>(3);
  const [safe, setSafe] = useState<number | null>(5);
  const [gsm, setGsm] = useState<number | null>(90);
  const [zoom, setZoom] = useState(100);
  const [showGuides, setShowGuides] = useState(true);

  const pages = pageCount ?? 4;
  const closes = pages % 4 === 0;
  const imposedPages = closes ? pages : pages + (4 - (pages % 4));
  const missing = imposedPages - pages;

  const imposition = useMemo(() => {
    const count = Math.max(4, autoPad ? imposedPages : pages - (pages % 4));
    return binding === 'saddle-stitch' ? sampleSaddleStitch(count, direction) : samplePerfectBound(count, Number(signaturePages), separateCover, direction);
  }, [autoPad, binding, direction, imposedPages, pages, separateCover, signaturePages]);

  const caliper = ((gsm ?? 90) / 90) * 0.1;
  const spine = spineMm(imposition.pageCount, caliper, binding);
  const interiorSignatures = imposition.signatures.filter((signature) => signature.role === 'interior').length;

  const flags = useMemo(() => {
    const map = new Map<number, IssueSeverity>();
    const count = imposition.sheets.length;
    if (count > 2) map.set(2, 'error');
    if (count > 5) map.set(5, 'warning');
    if (count > 9) map.set(9, 'info');
    if (count === 2) map.set(1, 'warning');
    return map;
  }, [imposition]);

  const [selectedSheet, setSelectedSheet] = useState<number | null>(2);
  const [hoverSheet, setHoverSheet] = useState<number | null>(null);
  const [position, setPosition] = useState(3);
  const leafCount = imposition.pageCount / 2;
  useEffect(() => {
    setPosition((current) => Math.min(current, leafCount));
    setSelectedSheet((current) => (current !== null && current < imposition.sheets.length ? current : 0));
  }, [imposition, leafCount]);

  const loadSample = (sample: Sample): void => {
    const preset = SAMPLES[sample];
    setPageCount(preset.pageCount);
    setBinding(preset.binding);
    setSignaturePages(String(preset.signaturePages));
    setSeparateCover(preset.separateCover);
    setPosition(Math.min(3, preset.pageCount / 2));
  };

  const steps: StepTabItem[] = STEP_LABELS.map((label, index) => ({
    id: index + 1,
    label,
    done: index + 1 < step,
    disabled: index === 3 && step < 3,
    ...(index === 3 && step < 3 ? { disabledReason: 'Primero comprueba los pliegos' } : {}),
  }));

  const errors = [...flags.values()].filter((severity) => severity === 'error').length + (closes ? 0 : 1);
  const warnings = [...flags.values()].filter((severity) => severity === 'warning').length;
  const infos = [...flags.values()].filter((severity) => severity === 'info').length;

  const header = (
    <AppHeader
      title={title}
      onTitleChange={setTitle}
      steps={steps}
      currentStep={step}
      onSelectStep={setStep}
      statusSlot={
        <Popover
          title="Pre-vuelo"
          trigger={(props) => <PreflightChip errors={errors} warnings={warnings} infos={infos} ok={errors === 0 && warnings === 0} {...props} />}
        >
          {(close) => (
            <div className={styles.preflight}>
              <ul className={styles.issueList}>
                {!closes && (
                  <li>
                    <StatusBadge tone="error" size="sm" />
                    <span>Faltan {missing} págs. para cerrar el último pliego</span>
                  </li>
                )}
                {[...flags.entries()].map(([sheet, severity]) => (
                  <li key={sheet}>
                    <StatusBadge tone={severity} size="sm" />
                    <span>
                      Pliego {sheet + 1}: {severity === 'error' ? 'folio 9 fuera de orden' : severity === 'warning' ? 'página a menor resolución (180 ppp)' : 'cortesía añadida'}
                    </span>
                  </li>
                ))}
              </ul>
              <ButtonGroup>
                <Button
                  size="sm"
                  variant="primary"
                  iconStart={<Icon icon={Download} size={14} />}
                  onClick={() => {
                    close();
                    toast({ title: 'Reporte descargado', description: 'prevuelo-canto-12.md' });
                  }}
                >
                  Descargar reporte
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStep(3)}>
                  Ver pliegos
                </Button>
              </ButtonGroup>
            </div>
          )}
        </Popover>
      }
    />
  );

  return (
    <AppShell header={header}>
      {step === 1 && (
        <StepLayout
          title="Configuración del trabajo"
          guide={[`${imposition.pageCount} páginas`, `${imposition.sheets.length} pliegos`, binding === 'perfect-bound' ? `${interiorSignatures} cuadernillos` : 'a caballo', `lomo ${formatDecimal(spine, 1)} mm`]}
          actions={
            <Button variant="ghost" size="sm" iconStart={<Icon icon={RotateCcw} size={14} />} onClick={() => loadSample('p32')}>
              Restablecer
            </Button>
          }
          footerNote={closes ? 'Los pliegos cierran exactos.' : `Faltan ${missing} págs. para cerrar el último pliego.`}
          primaryAction={
            <Button variant="primary" iconEnd={<Icon icon={ArrowRight} />} onClick={() => setStep(2)}>
              Continuar a carga
            </Button>
          }
          flush
        >
          <div className={styles.setup}>
            <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
              <FormSection title="Entrada" description="Cómo vienen los archivos que vas a cargar.">
                <RadioCards<InputMode>
                  aria-label="Modo de entrada"
                  value={inputMode}
                  onChange={setInputMode}
                  options={[
                    { value: 'pages', title: 'Páginas sueltas', description: 'Un archivo o imagen por página, en orden de lectura.', illustration: diagrams.pages },
                    { value: 'spreads', title: 'Pliegos dobles', description: 'Hojas apaisadas con dos páginas cada una.', illustration: diagrams.spreads },
                  ]}
                />
                {inputMode === 'spreads' && (
                  <SegmentedControl<SpreadKind>
                    label="Las hojas dobles son"
                    value={spreadKind}
                    onChange={setSpreadKind}
                    options={[
                      { value: 'reader', label: 'De lectura', hint: 'Págs. enfrentadas 2-3, 4-5…' },
                      { value: 'printer', label: 'Ya impuestas', hint: 'Caras de pliego de máquina' },
                    ]}
                  />
                )}
              </FormSection>

              <FormSection title="Encuadernación" divided>
                <RadioCards<BindingType>
                  aria-label="Encuadernación"
                  value={binding}
                  onChange={setBinding}
                  layout="row"
                  options={[
                    { value: 'saddle-stitch', title: 'Grapada a caballo', description: 'Un cuadernillo; pliegos encartados uno dentro de otro.', illustration: diagrams['saddle-stitch'] },
                    { value: 'perfect-bound', title: 'Lomo cuadrado', description: 'Cuadernillos apilados y encolados o cosidos.', illustration: diagrams['perfect-bound'] },
                  ]}
                />
                {binding === 'perfect-bound' && (
                  <div className={styles.row2}>
                    <Select
                      label="Páginas por cuadernillo"
                      value={signaturePages}
                      onValueChange={setSignaturePages}
                      options={['4', '8', '12', '16', '24', '32'].map((value) => ({ value, label: `${value} págs.` }))}
                    />
                    <Switch label="Cubierta aparte" description="Pliego de 4 págs. que envuelve la tripa" checked={separateCover} onChange={setSeparateCover} />
                  </div>
                )}
              </FormSection>

              <FormSection title="Páginas" divided aside={<span className="tabular">{imposition.pageCount} impuestas</span>}>
                <div className={styles.row2}>
                  <NumberField
                    label="Total declarado"
                    hint="Múltiplo de 4 para cerrar pliegos"
                    value={pageCount}
                    onChange={setPageCount}
                    min={4}
                    max={400}
                    step={1}
                    unit="págs."
                    error={pageCount !== null && !closes && !autoPad ? `${pageCount} no es múltiplo de 4: activa las cortesías o ajusta el total.` : undefined}
                  />
                  <Switch label="Completar con cortesías" description="Blancas hasta el múltiplo de 4" checked={autoPad} onChange={setAutoPad} />
                </div>
                {!closes && autoPad && (
                  <Callout tone="info" title={`Se añadirán ${missing} páginas de cortesía`}>
                    Irán antes de la contraportada para que el último pliego cierre.
                  </Callout>
                )}
              </FormSection>

              <FormSection title="Lectura" divided>
                <SegmentedControl<ReadingDirection>
                  label="Dirección"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: 'ltr', label: 'Izquierda → derecha', icon: <Icon icon={ArrowRight} size={14} /> },
                    { value: 'rtl', label: 'Derecha → izquierda', icon: <Icon icon={ArrowLeft} size={14} /> },
                  ]}
                />
              </FormSection>

              <FormSection title="Formato y sangrado" divided>
                <Select<TrimId> label="Formato final" value={trim} onValueChange={setTrim} options={TRIM_OPTIONS} />
                <div className={styles.row3}>
                  <NumberField label="Ancho" value={TRIM_MM[trim][0]} onChange={() => setTrim('libre')} unit="mm" min={50} max={600} />
                  <NumberField label="Alto" value={TRIM_MM[trim][1]} onChange={() => setTrim('libre')} unit="mm" min={50} max={600} />
                  <NumberField label="Gramaje tripa" value={gsm} onChange={setGsm} unit="g" min={40} max={350} step={5} />
                </div>
                <div className={styles.row3}>
                  <NumberField label="Sangrado" value={bleed} onChange={setBleed} unit="mm" min={0} max={10} step={0.5} hint="Por lado; 0 = a corte" />
                  <NumberField label="Zona segura" value={safe} onChange={setSafe} unit="mm" min={0} max={30} step={0.5} />
                  <TextField label="Referencia" placeholder="OT-2026-114" />
                </div>
                <Checkbox label="Mostrar guías de corte, sangrado y zona segura" checked={showGuides} onChange={setShowGuides} />
              </FormSection>
            </form>

            <section className={styles.maqueta} aria-labelledby="maqueta-titulo">
              <div className={styles.maquetaHead}>
                <h2 id="maqueta-titulo" className={styles.sectionTitle}>
                  Maqueta
                </h2>
                <SegmentedControl<Sample>
                  aria-label="Muestras"
                  size="sm"
                  value={imposition.pageCount === 8 ? 'p8' : imposition.pageCount === 96 ? 'p96' : 'p32'}
                  onChange={loadSample}
                  options={[
                    { value: 'p8', label: '8 págs.' },
                    { value: 'p32', label: '32 a caballo' },
                    { value: 'p96', label: '96 lomo cuadrado' },
                  ]}
                />
              </div>

              <dl className={styles.readings}>
                <div>
                  <dt>Páginas</dt>
                  <dd>{imposition.pageCount}</dd>
                </div>
                <div>
                  <dt>Pliegos</dt>
                  <dd>{imposition.sheets.length}</dd>
                </div>
                <div>
                  <dt>Cuadernillos</dt>
                  <dd>{interiorSignatures}</dd>
                </div>
                <div>
                  <dt>Lomo</dt>
                  <dd>
                    {formatDecimal(spine, 1)}
                    <span className={styles.unit}> mm</span>
                  </dd>
                </div>
              </dl>

              <div className={styles.cantoBlock}>
                <p className={styles.blockLabel}>El canto, hoja a hoja</p>
                <Canto
                  imposition={imposition}
                  unit="leaf"
                  orientation="horizontal"
                  flags={flags}
                  highlightedSheet={hoverSheet}
                  onHoverSheet={setHoverSheet}
                  selectedSheet={selectedSheet}
                  onSelectSheet={setSelectedSheet}
                />
              </div>

              <div className={styles.sheetGrid}>
                {imposition.sheets.slice(0, 6).map((sheet) => (
                  <button
                    key={sheet.index}
                    type="button"
                    className={styles.sheetCard}
                    data-highlighted={hoverSheet === sheet.index ? '' : undefined}
                    data-selected={selectedSheet === sheet.index ? '' : undefined}
                    onPointerEnter={() => setHoverSheet(sheet.index)}
                    onPointerLeave={() => setHoverSheet(null)}
                    onFocus={() => setHoverSheet(sheet.index)}
                    onBlur={() => setHoverSheet(null)}
                    onClick={() => setSelectedSheet(sheet.index)}
                    aria-pressed={selectedSheet === sheet.index}
                  >
                    <span className={styles.sheetNumber}>{sheet.number}</span>
                    <span className={styles.sheetFaces}>
                      <span>
                        <em>Cara</em> {sheet.front.left} | {sheet.front.right}
                      </span>
                      <span>
                        <em>Retiro</em> {sheet.back.left} | {sheet.back.right}
                      </span>
                    </span>
                    {sheet.role === 'cover' ? <Tag cover size="sm">Cubierta</Tag> : <Tag size="sm">Cuad. {sheet.signature + 1}</Tag>}
                  </button>
                ))}
              </div>
              {imposition.sheets.length > 6 && <p className={styles.more}>y {imposition.sheets.length - 6} pliegos más en el paso 3.</p>}

              <div className={styles.callouts}>
                <Callout
                  tone="error"
                  title="Folio fuera de orden en el pliego 3"
                  action={
                    <Button size="sm" onClick={() => setSelectedSheet(2)}>
                      Ir al pliego
                    </Button>
                  }
                >
                  La página 9 dice ser el folio 11. Revisa el orden de los archivos o renómbralos.
                </Callout>
                <Callout tone="warning" title="El lomo es justo para grapar">
                  Con {imposition.pageCount} págs. de {gsm ?? 90} g el lomo mide {formatDecimal(spine, 1)} mm; por encima de 5 mm conviene lomo cuadrado.
                </Callout>
                <Callout tone="success" title="Los pliegos cierran exactos" compact />
              </div>
            </section>
          </div>
        </StepLayout>
      )}

      {step === 2 && (
        <StepLayout
          title="Carga y segmentación"
          guide={['0 páginas', '0 archivos', `${TRIM_OPTIONS.find((option) => option.value === trim)?.label ?? ''}`]}
          backAction={
            <Button variant="ghost" iconStart={<Icon icon={ArrowLeft} />} onClick={() => setStep(1)}>
              Atrás
            </Button>
          }
          primaryAction={
            <Button variant="primary" iconEnd={<Icon icon={ArrowRight} />} onClick={() => setStep(3)}>
              Continuar a pliegos
            </Button>
          }
        >
          <div className={styles.upload}>
            <EmptyState
              icon={FileUp}
              title="Aún no hay páginas"
              description="Arrastra aquí el PDF o las imágenes (PNG, JPG, WebP) de la revista, o elígelos desde tu equipo."
              actions={
                <>
                  <Button variant="primary" iconStart={<Icon icon={FileUp} />}>
                    Elegir archivos
                  </Button>
                  <Button variant="secondary">Cargar revista de ejemplo</Button>
                </>
              }
              footnote="Los archivos no salen de tu navegador."
            />
            <div className={styles.loading} aria-busy="true">
              <ProgressBar label="Rasterizando páginas" value={0.375} valueText="12 de 32" />
              <ProgressBar label="Leyendo revista.pdf" value={null} size="sm" />
              <div className={styles.thumbs}>
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className={styles.thumb}>
                    <Skeleton shape="block" aspectRatio={210 / 297} />
                    <Skeleton width="60%" />
                  </div>
                ))}
              </div>
              <p className={styles.inline}>
                <Spinner size={14} /> Detectando folios en la capa de texto…
              </p>
            </div>
          </div>
        </StepLayout>
      )}

      {step === 3 && (
        <MatrixPreview
          imposition={imposition}
          flags={flags}
          selectedSheet={selectedSheet}
          onSelectSheet={setSelectedSheet}
          hoverSheet={hoverSheet}
          onHoverSheet={setHoverSheet}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <ViewerPreview
          imposition={imposition}
          flags={flags}
          position={position}
          onPosition={setPosition}
          zoom={zoom}
          onZoom={setZoom}
          showGuides={showGuides}
          onShowGuides={setShowGuides}
          selectedSheet={selectedSheet}
          onSelectSheet={setSelectedSheet}
        />
      )}
    </AppShell>
  );
}

interface MatrixPreviewProps {
  imposition: ImpositionResult;
  flags: ReadonlyMap<number, IssueSeverity>;
  selectedSheet: number | null;
  onSelectSheet: (sheet: number) => void;
  hoverSheet: number | null;
  onHoverSheet: (sheet: number | null) => void;
  onBack: () => void;
  onNext: () => void;
}

function MatrixPreview({ imposition, flags, selectedSheet, onSelectSheet, hoverSheet, onHoverSheet, onBack, onNext }: MatrixPreviewProps) {
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [view, setView] = useState<'matriz' | 'lista'>('matriz');
  const sheet = imposition.sheets[selectedSheet ?? 0];
  const interior = imposition.signatures.filter((signature) => signature.role === 'interior').length;
  return (
    <StepLayout
      title="Pliegos"
      guide={[`${imposition.pageCount} páginas`, `${imposition.sheets.length} pliegos`, interior === 1 ? 'a caballo' : `${interior} cuadernillos`, sheet ? `pliego ${sheet.number} · ${face === 'front' ? 'cara' : 'retiro'}` : null]}
      actions={
        <Button variant="secondary" size="sm" iconStart={<Icon icon={Download} size={14} />} onClick={() => toast({ title: 'Reporte descargado', description: 'prevuelo-canto-12.md' })}>
          Descargar pre-vuelo
        </Button>
      }
      backAction={
        <Button variant="ghost" iconStart={<Icon icon={ArrowLeft} />} onClick={onBack}>
          Atrás
        </Button>
      }
      primaryAction={
        <Button variant="primary" iconEnd={<Icon icon={ArrowRight} />} onClick={onNext}>
          Abrir el visor 3D
        </Button>
      }
      flush
    >
      <div className={styles.matrix}>
        <aside className={styles.rail} aria-label="Índice de pliegos">
          <Canto
            imposition={imposition}
            unit="sheet"
            orientation="vertical"
            flags={flags}
            selectedSheet={selectedSheet}
            onSelectSheet={onSelectSheet}
            highlightedSheet={hoverSheet}
            onHoverSheet={onHoverSheet}
          />
        </aside>
        <div className={styles.matrixMain}>
          <Toolbar aria-label="Vista de pliegos">
            <Tabs<'matriz' | 'lista'>
              aria-label="Vista"
              size="sm"
              value={view}
              onChange={setView}
              items={[
                { value: 'matriz', label: 'Matriz', icon: <Icon icon={Grid3x3} size={14} /> },
                { value: 'lista', label: 'Lista de páginas', icon: <Icon icon={Layers} size={14} />, badge: <StatusBadge tone="error" size="sm">1</StatusBadge> },
              ]}
            />
            <ToolbarSeparator />
            <SegmentedControl<'front' | 'back'>
              aria-label="Cara del pliego"
              size="sm"
              value={face}
              onChange={setFace}
              options={[
                { value: 'front', label: 'Cara' },
                { value: 'back', label: 'Retiro' },
              ]}
            />
            <ToolbarSpacer />
            <IconButton size="sm" label="Pliego anterior" icon={<Icon icon={ChevronsLeft} size={14} />} onClick={() => onSelectSheet(Math.max(0, (selectedSheet ?? 0) - 1))} />
            <IconButton size="sm" label="Pliego siguiente" icon={<Icon icon={ChevronsRight} size={14} />} onClick={() => onSelectSheet(Math.min(imposition.sheets.length - 1, (selectedSheet ?? 0) + 1))} />
          </Toolbar>
          <div className={styles.horizontalCanto}>
            <p className={styles.blockLabel}>Orden de alzado</p>
            <Canto imposition={imposition} unit="sheet" orientation="horizontal" size="sm" flags={flags} selectedSheet={selectedSheet} onSelectSheet={onSelectSheet} highlightedSheet={hoverSheet} onHoverSheet={onHoverSheet} />
          </div>
          {sheet && (
            <div className={styles.sheetDetail}>
              <div className={styles.sheetSpread} data-face={face}>
                <span className={styles.page}>{face === 'front' ? sheet.front.left : sheet.back.left}</span>
                <span className={styles.spine} aria-hidden="true" />
                <span className={styles.page}>{face === 'front' ? sheet.front.right : sheet.back.right}</span>
              </div>
              <div className={styles.sheetInfo}>
                <p className={styles.bigNumber}>Pliego {sheet.number}</p>
                <p>
                  {sheet.role === 'cover' ? 'Cubierta' : `Cuadernillo ${sheet.signature + 1}`} · {sheet.indexInSignature + 1}.º de {sheet.sheetsInSignature} desde fuera
                </p>
                {flags.get(sheet.index) && <StatusBadge tone={flags.get(sheet.index) ?? 'info'} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </StepLayout>
  );
}

interface ViewerPreviewProps {
  imposition: ImpositionResult;
  flags: ReadonlyMap<number, IssueSeverity>;
  position: number;
  onPosition: (position: number) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  showGuides: boolean;
  onShowGuides: (show: boolean) => void;
  selectedSheet: number | null;
  onSelectSheet: (sheet: number) => void;
}

function ViewerPreview({ imposition, flags, position, onPosition, zoom, onZoom, showGuides, onShowGuides, selectedSheet, onSelectSheet }: ViewerPreviewProps) {
  const cantoRef = useRef<CantoHandle | null>(null);
  const [mode, setMode] = useState<'reading' | 'sheet'>('reading');
  const [playing, setPlaying] = useState(false);
  const leafCount = imposition.pageCount / 2;
  const opening = Math.round(position);
  const spread = imposition.spreads[opening];

  const flipThrough = (): void => {
    if (playing) return;
    setPlaying(true);
    const start = performance.now();
    const duration = 2400;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      cantoRef.current?.setPosition(t * leafCount);
      if (t < 1) requestAnimationFrame(tick);
      else {
        onPosition(leafCount);
        setPlaying(false);
      }
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className={styles.viewer}>
      <Toolbar aria-label="Herramientas del visor" className={styles.viewerBar}>
        <SegmentedControl<'reading' | 'sheet'>
          aria-label="Modo"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'reading', label: 'Lectura', icon: <Icon icon={View} size={14} /> },
            { value: 'sheet', label: 'Despiece', icon: <Icon icon={ScanEye} size={14} /> },
          ]}
        />
        <ToolbarSeparator />
        <Switch label="Guías" checked={showGuides} onChange={onShowGuides} />
        <ToolbarSpacer />
        <div className={styles.zoom}>
          <Slider aria-label="Zoom" value={zoom} onChange={onZoom} min={50} max={200} step={10} showValue formatValue={(value) => `${value} %`} />
        </div>
        <IconButton size="sm" label="Pantalla completa" icon={<Icon icon={Maximize2} size={14} />} tooltipExtra={<Kbd inverse>F</Kbd>} />
        <IconButton size="sm" label="Medir" icon={<Icon icon={Ruler} size={14} />} disabled />
      </Toolbar>

      <div className={styles.stage}>
        <div className={styles.stageSpread} dir={imposition.readingDirection}>
          <span className={styles.stagePage} data-empty={spread?.left === null ? '' : undefined}>
            {spread?.left ?? ''}
          </span>
          <span className={styles.stagePage} data-empty={spread?.right === null ? '' : undefined}>
            {spread?.right ?? ''}
          </span>
        </div>
        <p className={styles.stageNote}>
          Hojea con <Kbd>←</Kbd> <Kbd>→</Kbd>{' '}
          o arrastra el canto
        </p>
      </div>

      <div className={styles.viewerFoot}>
        <IconButton label="Anterior" icon={<Icon icon={ArrowLeft} />} onClick={() => onPosition(Math.max(0, opening - 1))} disabled={opening === 0} tooltipPlacement="top" />
        <div className={styles.viewerCanto}>
          <Canto
            ref={cantoRef}
            imposition={imposition}
            unit="leaf"
            orientation="horizontal"
            position={position}
            onSeek={(next, phase) => {
              if (phase === 'commit') onPosition(next);
            }}
            flags={flags}
            {...(mode === 'sheet' ? { highlightedSheet: selectedSheet, selectedSheet, onSelectSheet } : {})}
          />
        </div>
        <IconButton label="Siguiente" icon={<Icon icon={ArrowRight} />} onClick={() => onPosition(Math.min(leafCount, opening + 1))} disabled={opening === leafCount} tooltipPlacement="top" />
        <Button size="sm" variant="secondary" loading={playing} onClick={flipThrough}>
          Hojear
        </Button>
      </div>
    </div>
  );
}
