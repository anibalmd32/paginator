import type {
  ImpositionResult,
  Issue,
  IssueCode,
  IssueFix,
  IssueSeverity,
  MagazineConfig,
  Page,
  SourceUnit,
  TrimSize,
} from '@/lib/types';

import {
  capitalize,
  formatMm,
  formatNumber,
  formatNumberList,
  formatSigned,
  formatSizeMm,
  pagesPhrase,
  plural,
  rangeKey,
  uniqueSorted,
} from './format';
import { estimatePageTrim, estimateSpine, expectedUnitSizeMm } from './geometry';
import type { PageTrimEstimate } from './geometry';
import { expectedSide, normalizeSignaturePages, paddedPageCount } from './imposition';
import { applyPadding, buildPages, classifyUnits, sortUnitsByOrder } from './segmentation';
import type { UnitKind } from './segmentation';

export interface ValidationInput {
  config: MagazineConfig;
  units: SourceUnit[];
  pages: Page[];
  effectivePages: Page[];
  imposition: ImpositionResult;
  trim: TrimSize;
}

const SIZE_TOLERANCE_MM = 1;
const RATIO_TOLERANCE = 0.015;
const FILE_SIZE_TOLERANCE_MM = 0.5;
const LOW_RESOLUTION_PPI = 150;
const FAIR_RESOLUTION_PPI = 250;
const MM_PER_INCH = 25.4;
const SADDLE_MAX_PAGES = 64;
const SADDLE_MAX_SPINE_MM = 6;
const CREEP_NOTICE_MM = 1;
const PERFECT_MIN_SPINE_MM = 3;
const ALMOST_ALL = 0.8;
const SQUARE_BAND = 0.02;

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };

const CODE_ORDER: readonly IssueCode[] = [
  'no-pages',
  'page-count-not-multiple-of-4',
  'declared-count-mismatch',
  'printer-sides-incomplete',
  'spread-side-mismatch',
  'folio-out-of-order',
  'duplicate-folio',
  'unexpected-double-in-pages',
  'unexpected-single-in-spreads',
  'orientation-mismatch',
  'file-size-vs-trim',
  'size-mismatch',
  'low-resolution',
  'saddle-stitch-too-thick',
  'spine-too-thin',
  'creep',
  'signature-remainder',
  'blank-pages-added',
];

interface PageEntry {
  number: number;
  page: Page;
  unit: SourceUnit | null;
  estimate: PageTrimEstimate | null;
}

type MeasurableEntry = PageEntry & { unit: SourceUnit; estimate: PageTrimEstimate };

interface Context {
  input: ValidationInput;
  config: MagazineConfig;
  entries: PageEntry[];
  units: SourceUnit[];
  kinds: Map<string, UnitKind>;
  inputOrdinalById: Map<string, number>;
  misfitUnitIds: Set<string>;
  printer: boolean;
  reader: boolean;
}

function buildContext(input: ValidationInput): Context {
  const { config } = input;
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const finalPages = input.effectivePages.length > 0 ? input.effectivePages : input.pages;
  const entries = finalPages.map((page, index): PageEntry => {
    const unit = page.unitId === null ? null : (unitById.get(page.unitId) ?? null);
    return { number: index + 1, page, unit, estimate: estimatePageTrim(page, unit, config) };
  });

  const units = sortUnitsByOrder(input.units);
  const kinds = classifyUnits(units, config.inputMode);
  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';
  const reader = config.inputMode === 'spreads' && !printer;
  const misfitKind: UnitKind | null = config.inputMode === 'pages' ? 'double' : printer ? 'single' : null;
  const misfitUnitIds = new Set(units.filter((unit) => kinds.get(unit.id) === misfitKind).map((unit) => unit.id));

  const inputOrdinalById = new Map<string, number>();
  input.pages.forEach((page, index) => {
    if (!inputOrdinalById.has(page.id)) inputOrdinalById.set(page.id, index + 1);
  });

  return { input, config, entries, units, kinds, inputOrdinalById, misfitUnitIds, printer, reader };
}

export function countSuppliedPages(pages: readonly Page[]): number {
  return pages.filter((page) => page.origin !== 'auto-blank').length;
}

interface IssueDraft {
  code: IssueCode;
  severity: IssueSeverity;
  title: string;
  detail: string;
  pageNumbers?: readonly number[];
  sheetIndexes?: readonly number[];
  idSuffix?: string | undefined;
  fix?: IssueFix | undefined;
}

function makeIssue(ctx: Context, draft: IssueDraft): Issue {
  const pageNumbers = uniqueSorted(draft.pageNumbers ?? []);
  const { placements } = ctx.input.imposition;
  const fromPages = pageNumbers.flatMap((number) => {
    const placement = placements[number - 1];
    return placement ? [placement.sheetIndex] : [];
  });
  const idParts: string[] = [draft.code];
  if (pageNumbers.length > 0) idParts.push(rangeKey(pageNumbers));
  if (draft.idSuffix !== undefined) idParts.push(draft.idSuffix);

  const issue: Issue = {
    id: idParts.join(':'),
    code: draft.code,
    severity: draft.severity,
    title: draft.title,
    detail: draft.detail,
    pageNumbers,
    sheetIndexes: uniqueSorted([...fromPages, ...(draft.sheetIndexes ?? [])]),
  };
  if (draft.fix) issue.fix = draft.fix;
  return issue;
}

function numbersOf(entries: readonly PageEntry[]): number[] {
  return entries.map((entry) => entry.number);
}

function modeOf(values: readonly number[], prefer: (value: number) => number): { value: number; count: number } | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: number; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count || (count === best.count && prefer(value) < prefer(best.value))) {
      best = { value, count };
    }
  }
  return best;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

function checkPageCount(ctx: Context): Issue[] {
  const issues: Issue[] = [];
  const { config } = ctx;
  const supplied = countSuppliedPages(ctx.input.pages);
  const blanks = ctx.entries.filter(
    (entry) => entry.page.origin === 'auto-blank' && !ctx.inputOrdinalById.has(entry.page.id),
  );
  const blankNumbers = numbersOf(blanks);

  const unevenCount = !ctx.printer && supplied % 4 !== 0;

  if (unevenCount && !config.autoPadBlanks) {
    const target = paddedPageCount(supplied);
    const missing = target - supplied;
    issues.push(
      makeIssue(ctx, {
        code: 'page-count-not-multiple-of-4',
        severity: 'error',
        title: `${String(supplied)} ${plural(supplied, 'página no cierra', 'páginas no cierran')} pliego`,
        detail:
          `Cada pliego lleva 4 páginas y ${plural(missing, 'falta', 'faltan')} ${String(missing)} para llegar a ` +
          `${String(target)}. Añade o quita páginas hasta un múltiplo de 4, o activa las páginas de cortesía ` +
          'automáticas para completar el último pliego con blancas.',
        pageNumbers: blankNumbers,
        idSuffix: `total-${String(supplied)}`,
        fix: { kind: 'enable-auto-blanks', label: 'Completar con páginas de cortesía' },
      }),
    );
  } else if (blanks.length > 0) {
    const count = blanks.length;
    const where = config.blankPlacement === 'before-back-cover' && supplied >= 2 ? 'antes de la contraportada' : 'al final';
    issues.push(
      makeIssue(ctx, {
        code: 'blank-pages-added',
        severity: 'info',
        title: `${String(count)} ${plural(count, 'página de cortesía añadida', 'páginas de cortesía añadidas')}`,
        detail:
          `Se ${plural(count, 'ha añadido', 'han añadido')} ${String(count)} ${plural(count, 'blanca', 'blancas')} ${where} ` +
          `(${pagesPhrase(blankNumbers)}) para pasar de ${String(ctx.input.pages.length)} a ${String(ctx.entries.length)} páginas y cerrar pliego. ` +
          'Si prefieres contenido en ese hueco, añade páginas o inserta las blancas a mano donde convenga.',
        pageNumbers: blankNumbers,
      }),
    );
  }

  const declared = config.declaredPageCount;
  if (declared !== null && Number.isFinite(declared) && declared > 0 && declared !== supplied) {
    const diff = Math.abs(declared - supplied);
    const facts = `El trabajo declara ${String(declared)} páginas y los archivos aportan ${String(supplied)}. `;
    if (supplied < declared) {
      issues.push(
        makeIssue(ctx, {
          code: 'declared-count-mismatch',
          severity: 'error',
          title: `${plural(diff, 'Falta', 'Faltan')} ${String(diff)} ${plural(diff, 'página', 'páginas')} para las ${String(declared)} declaradas`,
          detail: `${facts}Sube las páginas que faltan o corrige el total declarado; mientras tanto el hueco se rellena con blancas.`,
          pageNumbers: blankNumbers,
          idSuffix: `${String(supplied)}-de-${String(declared)}`,
        }),
      );
    } else {
      const extra = ctx.entries.filter((entry) => (ctx.inputOrdinalById.get(entry.page.id) ?? 0) > declared);
      issues.push(
        makeIssue(ctx, {
          code: 'declared-count-mismatch',
          severity: 'warning',
          title: `${plural(diff, 'Sobra', 'Sobran')} ${String(diff)} ${plural(diff, 'página', 'páginas')} sobre las ${String(declared)} declaradas`,
          detail: `${facts}Retira las que sobren o actualiza el total declarado al número real de páginas.`,
          pageNumbers: numbersOf(extra),
          idSuffix: `${String(supplied)}-de-${String(declared)}`,
          fix: { kind: 'use-actual-page-count', label: `Usar ${String(supplied)} páginas` },
        }),
      );
    }
  }
  return issues;
}

interface FolioItem {
  entry: PageEntry;
  folio: number;
  ordinal: number;
  offset: number;
}

function checkFolios(ctx: Context): Issue[] {
  const issues: Issue[] = [];

  const withFolio: FolioItem[] = [];
  for (const entry of ctx.entries) {
    const folio = entry.page.detectedFolio;
    const ordinal = ctx.inputOrdinalById.get(entry.page.id);
    if (folio === null || !Number.isFinite(folio) || ordinal === undefined) continue;
    withFolio.push({ entry, folio, ordinal, offset: folio - ordinal });
  }

  const dominant = modeOf(
    withFolio.map((item) => item.offset),
    (offset) => Math.abs(offset),
  );
  if (dominant && dominant.count >= 2) {
    const groups: FolioItem[][] = [];
    for (const item of withFolio) {
      if (item.offset === dominant.value) continue;
      const group = groups[groups.length - 1];
      const previous = group?.[group.length - 1];
      if (group && previous && previous.offset === item.offset && previous.entry.number + 1 === item.entry.number) {
        group.push(item);
      } else {
        groups.push([item]);
      }
    }
    const offsetNote =
      dominant.value === 0
        ? 'El resto de folios coincide con su posición'
        : `El resto de folios lleva un desfase de ${formatSigned(dominant.value)} respecto a su posición`;
    for (const group of groups) {
      const first = group[0];
      const last = group[group.length - 1];
      if (!first || !last) continue;
      const single = group.length === 1;
      const title = single
        ? `La página ${String(first.entry.number)} lleva el folio ${String(first.folio)}`
        : `Las páginas ${String(first.entry.number)}–${String(last.entry.number)} llevan los folios ${String(first.folio)}–${String(last.folio)}`;
      const expected = single
        ? `el folio ${String(first.ordinal + dominant.value)}`
        : `los folios ${String(first.ordinal + dominant.value)}–${String(last.ordinal + dominant.value)}`;
      issues.push(
        makeIssue(ctx, {
          code: 'folio-out-of-order',
          severity: 'warning',
          title,
          detail:
            `${offsetNote}, así que en ${single ? 'esa posición' : 'esas posiciones'} se esperaba ${expected}. ` +
            'Comprueba si la página está fuera de sitio, si falta alguna antes o si el folio del archivo es incorrecto, y reordénala.',
          pageNumbers: group.map((item) => item.entry.number),
        }),
      );
    }
  }

  const byFolio = new Map<number, PageEntry[]>();
  for (const { entry, folio } of withFolio) {
    const list = byFolio.get(folio);
    if (list) list.push(entry);
    else byFolio.set(folio, [entry]);
  }
  for (const [folio, entries] of byFolio) {
    if (entries.length < 2) continue;
    issues.push(
      makeIssue(ctx, {
        code: 'duplicate-folio',
        severity: 'warning',
        title: `El folio ${String(folio)} aparece ${String(entries.length)} veces`,
        detail:
          `${capitalize(pagesPhrase(numbersOf(entries)))} llevan el mismo folio ${String(folio)}. ` +
          'Puede ser una página subida dos veces o un folio sin actualizar en la maqueta: revisa cuál sobra.',
        pageNumbers: numbersOf(entries),
        idSuffix: `folio-${String(folio)}`,
      }),
    );
  }
  return issues;
}

function entriesOfUnits(ctx: Context, unitIds: ReadonlySet<string>): PageEntry[] {
  return ctx.entries.filter((entry) => entry.unit !== null && unitIds.has(entry.unit.id));
}

function checkInputMode(ctx: Context): Issue[] {
  const issues: Issue[] = [];
  const { config, units, kinds } = ctx;

  if (config.inputMode === 'pages') {
    const doubles = new Set(units.filter((unit) => kinds.get(unit.id) === 'double').map((unit) => unit.id));
    const pages = numbersOf(entriesOfUnits(ctx, doubles));
    if (pages.length > 0) {
      issues.push(
        makeIssue(ctx, {
          code: 'unexpected-double-in-pages',
          severity: 'warning',
          title: `${capitalize(pagesPhrase(pages))} ${plural(pages.length, 'parece un pliego doble', 'parecen pliegos dobles')}`,
          detail:
            `En modo páginas sueltas cada archivo cuenta como una página, pero ${plural(pages.length, 'esa hoja es', 'esas hojas son')} ` +
            `el doble de ${plural(pages.length, 'ancha', 'anchas')} que el resto. Si el archivo viene en pliegos, cambia la entrada a ` +
            'pliegos para partirlos por el lomo; si no, sustituye esas hojas por páginas sueltas.',
          pageNumbers: pages,
          fix: { kind: 'set-input-mode', value: 'spreads', label: 'Tratar como pliegos' },
        }),
      );
    }
    return issues;
  }

  const singles = units.filter((unit, index) => {
    if (kinds.get(unit.id) !== 'single') return false;
    return ctx.printer || (index !== 0 && index !== units.length - 1);
  });
  const singlePages = numbersOf(entriesOfUnits(ctx, new Set(singles.map((unit) => unit.id))));
  if (singlePages.length > 0) {
    const many = singlePages.length;
    issues.push(
      makeIssue(ctx, {
        code: 'unexpected-single-in-spreads',
        severity: ctx.printer ? 'warning' : 'info',
        title: ctx.printer
          ? `${String(singles.length)} ${plural(singles.length, 'cara de pliego parece una página suelta', 'caras de pliego parecen páginas sueltas')}`
          : `${capitalize(pagesPhrase(singlePages))} ${plural(many, 'llega suelta', 'llegan sueltas')} entre los pliegos`,
        detail: ctx.printer
          ? 'En pliegos de imprenta cada archivo es una cara con dos páginas y se parte por la mitad, pero ' +
            `${pagesPhrase(singlePages)} ${plural(many, 'sale', 'salen')} de hojas con proporción de página suelta, así que ` +
            `${plural(many, 'quedará cortada', 'quedarán cortadas')} por el centro. Sustituye esas hojas por la cara de pliego completa.`
          : `${plural(many, 'Es una página suelta', 'Son páginas sueltas')} en mitad de los pliegos de lectura. Es correcto si se trata de ` +
            'un encarte o de una página que se entrega aparte; si no, desplaza la paridad de todo lo que viene detrás: ' +
            'comprueba que no falte su pareja.',
        pageNumbers: singlePages,
      }),
    );
  }

  if (ctx.reader) issues.push(...checkSpreadSides(ctx));
  if (ctx.printer) issues.push(...checkPrinterSides(ctx));
  return issues;
}

function misplacedHalves(pages: readonly Page[], config: MagazineConfig): { misplaced: number[]; halves: number } {
  const misplaced: number[] = [];
  let halves = 0;
  pages.forEach((page, index) => {
    if (page.half === 'full' || page.unitId === null) return;
    halves += 1;
    if (expectedSide(index + 1, config.readingDirection) !== page.half) misplaced.push(index + 1);
  });
  return { misplaced, halves };
}

function checkSpreadSides(ctx: Context): Issue[] {
  const { config } = ctx;
  const { misplaced, halves } = misplacedHalves(
    ctx.entries.map((entry) => entry.page),
    config,
  );
  if (misplaced.length === 0) return [];

  let fix: IssueFix | undefined;
  if (misplaced.length / halves >= ALMOST_ALL) {
    const alternative: MagazineConfig = { ...config, wraparoundCover: !config.wraparoundCover };
    const rebuilt = applyPadding(buildPages(ctx.units, alternative), alternative);
    if (misplacedHalves(rebuilt, alternative).misplaced.length < misplaced.length) {
      fix = {
        kind: 'set-wraparound-cover',
        value: alternative.wraparoundCover,
        label: alternative.wraparoundCover
          ? 'La primera hoja es contraportada + portada'
          : 'Portada y contraportada llegan sueltas',
      };
    }
  }

  const oddSide = expectedSide(1, config.readingDirection) === 'right' ? 'derecha' : 'izquierda';
  const cause = fix
    ? config.wraparoundCover
      ? 'Afecta a casi todas: seguramente la primera hoja no es una cubierta envolvente.'
      : 'Afecta a casi todas: seguramente la primera hoja es la cubierta envolvente (contraportada + portada).'
    : 'Suele deberse a una página suelta de más o de menos antes de ese punto, o a un pliego fuera de orden.';
  const many = misplaced.length;
  return [
    makeIssue(ctx, {
      code: 'spread-side-mismatch',
      severity: 'error',
      title: `${String(many)} ${plural(many, 'página cae', 'páginas caen')} al lado contrario del lomo`,
      detail:
        `${capitalize(pagesPhrase(misplaced))} ${plural(many, 'viene', 'vienen')} de una mitad de pliego que no corresponde a su ` +
        `posición (las impares van a la ${oddSide}): al imponer, las páginas enfrentadas dejarían de coincidir con el archivo. ${cause}`,
      pageNumbers: misplaced,
      fix,
    }),
  ];
}

function checkPrinterSides(ctx: Context): Issue[] {
  const sides = ctx.units.length;
  if (sides === 0) return [];
  const declared = ctx.config.declaredPageCount;
  const needed = Math.max(
    paddedPageCount(sides * 2) / 2,
    declared !== null && Number.isFinite(declared) ? paddedPageCount(declared) / 2 : 0,
  );
  if (sides >= needed) return [];

  const missing = needed - sides;
  const blanks = numbersOf(ctx.entries.filter((entry) => entry.page.origin === 'auto-blank'));
  return [
    makeIssue(ctx, {
      code: 'printer-sides-incomplete',
      severity: 'error',
      title: `${plural(missing, 'Falta', 'Faltan')} ${String(missing)} ${plural(missing, 'cara', 'caras')} de pliego`,
      detail:
        `Hay ${String(sides)} ${plural(sides, 'cara', 'caras')} y hacen falta ${String(needed)} para cerrar ` +
        `${String(needed / 2)} ${plural(needed / 2, 'pliego', 'pliegos')} (cara y retiro de cada uno). ` +
        `Las páginas sin cara quedan en blanco${blanks.length > 0 ? ` (${formatNumberList(blanks)})` : ''}. ` +
        'Sube las caras que faltan en el orden pliego 1 cara, pliego 1 retiro, pliego 2 cara…',
      pageNumbers: blanks,
      idSuffix: `${String(sides)}-de-${String(needed)}`,
    }),
  ];
}

type Orientation = 'vertical' | 'apaisada';

function orientationOf(estimate: PageTrimEstimate): Orientation | null {
  const ratio = estimate.widthMm / estimate.heightMm;
  if (ratio > 1 + SQUARE_BAND) return 'apaisada';
  if (ratio < 1 - SQUARE_BAND) return 'vertical';
  return null;
}

function fileSizeOf(unit: SourceUnit): TrimSize | null {
  const { widthMm, heightMm } = unit;
  if (widthMm === null || heightMm === null) return null;
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) return null;
  return { widthMm, heightMm };
}

function unitKindOf(entry: PageEntry): UnitKind {
  return entry.page.half === 'full' ? 'single' : 'double';
}

function checkOrientation(ctx: Context, candidates: readonly MeasurableEntry[], explained: Set<number>): Issue[] {
  const vertical: number[] = [];
  const landscape: number[] = [];
  for (const entry of candidates) {
    const orientation = orientationOf(entry.estimate);
    if (orientation === 'vertical') vertical.push(entry.number);
    else if (orientation === 'apaisada') landscape.push(entry.number);
  }
  if (vertical.length === 0 || landscape.length === 0 || vertical.length === landscape.length) return [];

  const minorityIsVertical = vertical.length < landscape.length;
  const pages = minorityIsVertical ? vertical : landscape;
  pages.forEach((number) => explained.add(number));
  return [
    makeIssue(ctx, {
      code: 'orientation-mismatch',
      severity: 'warning',
      title: `${capitalize(pagesPhrase(pages))} ${plural(pages.length, 'está', 'están')} en ${minorityIsVertical ? 'vertical' : 'apaisado'}`,
      detail:
        `El resto de páginas son ${minorityIsVertical ? 'apaisadas' : 'verticales'}. Una página girada se imprimiría recortada o ` +
        'con blancos: gírala en el archivo de origen o sustitúyela por la versión correcta.',
      pageNumbers: pages,
    }),
  ];
}

function checkFileSize(ctx: Context, candidates: readonly MeasurableEntry[], explained: Set<number>): Issue[] {
  const { config } = ctx;
  const trim = ctx.input.trim;
  const groups = new Map<string, { kind: UnitKind; expected: TrimSize; actual: TrimSize; pages: number[] }>();
  for (const entry of candidates) {
    const actual = fileSizeOf(entry.unit);
    if (!actual || explained.has(entry.number)) continue;
    const kind = unitKindOf(entry);
    const expected = expectedUnitSizeMm(kind, config, trim);
    const fits =
      Math.abs(actual.widthMm - expected.widthMm) <= FILE_SIZE_TOLERANCE_MM &&
      Math.abs(actual.heightMm - expected.heightMm) <= FILE_SIZE_TOLERANCE_MM;
    if (fits) continue;
    const key = `${kind}:${formatSizeMm(actual)}`;
    const group = groups.get(key);
    if (group) group.pages.push(entry.number);
    else groups.set(key, { kind, expected, actual, pages: [entry.number] });
  }

  const margins: string[] = [];
  if (config.bleedMm > 0) margins.push(`${formatMm(config.bleedMm)} de sangrado`);
  if (config.marksMm > 0) margins.push(`${formatMm(config.marksMm)} de marcas`);
  const marginNote = margins.length > 0 ? ` más ${margins.join(' y ')} por lado` : ' a corte, sin sangrado ni marcas';

  const issues: Issue[] = [];
  for (const group of groups.values()) {
    group.pages.forEach((number) => explained.add(number));
    issues.push(
      makeIssue(ctx, {
        code: 'file-size-vs-trim',
        severity: 'warning',
        title: `El archivo mide ${formatSizeMm(group.actual)} y se esperaban ${formatSizeMm(group.expected)}`,
        detail:
          `Para un corte de ${formatSizeMm(trim)}${marginNote}, ${group.kind === 'double' ? 'cada pliego doble' : 'cada página'} ` +
          `debe medir ${formatSizeMm(group.expected)}; el archivo de ${pagesPhrase(group.pages)} mide ${formatSizeMm(group.actual)}. ` +
          'Ajusta el formato, el sangrado o las marcas en la configuración, o exporta de nuevo con las medidas correctas.',
        pageNumbers: group.pages,
      }),
    );
  }
  return issues;
}

function checkSizeConsistency(ctx: Context, candidates: readonly MeasurableEntry[], explained: Set<number>): Issue[] {
  const rest = candidates.filter((entry) => !explained.has(entry.number));
  const measured = rest.filter((entry) => entry.estimate.measured);
  const unmeasured = rest.filter((entry) => !entry.estimate.measured);
  const ratioOf = (entry: MeasurableEntry): number => entry.estimate.widthMm / entry.estimate.heightMm;

  const groups = new Map<string, number[]>();
  const add = (label: string, number: number): void => {
    const pages = groups.get(label);
    if (pages) pages.push(number);
    else groups.set(label, [number]);
  };

  let dominantLabel = '';
  if (measured.length > 0) {
    const dominant: TrimSize = {
      widthMm: median(measured.map((entry) => entry.estimate.widthMm)),
      heightMm: median(measured.map((entry) => entry.estimate.heightMm)),
    };
    dominantLabel = formatSizeMm(dominant);
    for (const entry of measured) {
      const { widthMm, heightMm } = entry.estimate;
      const same =
        Math.abs(widthMm - dominant.widthMm) <= SIZE_TOLERANCE_MM &&
        Math.abs(heightMm - dominant.heightMm) <= SIZE_TOLERANCE_MM;
      if (!same) add(formatSizeMm({ widthMm, heightMm }), entry.number);
    }
  }
  if (unmeasured.length > 0) {
    const dominantRatio = median((measured.length > 0 ? measured : unmeasured).map(ratioOf));
    if (dominantLabel === '') dominantLabel = `una proporción ancho/alto de ${formatNumber(dominantRatio, 3)}`;
    for (const entry of unmeasured) {
      const ratio = ratioOf(entry);
      if (!(dominantRatio > 0) || Math.abs(ratio / dominantRatio - 1) <= RATIO_TOLERANCE) continue;
      add(`una proporción ancho/alto de ${formatNumber(ratio, 3)}`, entry.number);
    }
  }

  const issues: Issue[] = [];
  for (const [label, pages] of groups) {
    issues.push(
      makeIssue(ctx, {
        code: 'size-mismatch',
        severity: 'warning',
        title: `${capitalize(pagesPhrase(pages))} ${plural(pages.length, 'tiene', 'tienen')} otro formato`,
        detail:
          `${plural(pages.length, 'Su página tiene', 'Sus páginas tienen')} ${label}, frente a ${dominantLabel} del resto. ` +
          `Al imponer se escalaría o recortaría: exporta ${plural(pages.length, 'esa página', 'esas páginas')} al mismo formato que las demás.`,
        pageNumbers: pages,
      }),
    );
  }
  return issues;
}

function checkResolution(ctx: Context, candidates: readonly MeasurableEntry[]): Issue[] {
  const trim = ctx.input.trim;
  const low: number[] = [];
  const fair: number[] = [];
  let lowest = Number.POSITIVE_INFINITY;
  let lowestFair = Number.POSITIVE_INFINITY;
  for (const entry of candidates) {
    const { unit } = entry;
    if (fileSizeOf(unit) || !(unit.width > 0) || !(unit.height > 0)) continue;
    const expected = expectedUnitSizeMm(unitKindOf(entry), ctx.config, trim);
    if (!(expected.widthMm > 0) || !(expected.heightMm > 0)) continue;
    const ppi = Math.min(unit.width / expected.widthMm, unit.height / expected.heightMm) * MM_PER_INCH;
    if (ppi < LOW_RESOLUTION_PPI) {
      low.push(entry.number);
      lowest = Math.min(lowest, ppi);
    } else if (ppi < FAIR_RESOLUTION_PPI) {
      fair.push(entry.number);
      lowestFair = Math.min(lowestFair, ppi);
    }
  }

  const issues: Issue[] = [];
  if (low.length > 0) {
    issues.push(
      makeIssue(ctx, {
        code: 'low-resolution',
        severity: 'warning',
        title: `Resolución baja en ${pagesPhrase(low)}`,
        detail:
          `Al tamaño de impresión (${formatSizeMm(trim)}) ${plural(low.length, 'se queda', 'se quedan')} en ${formatNumber(lowest, 0)} ppp` +
          `${plural(low.length, '', ' la peor')}, por debajo de los ${String(LOW_RESOLUTION_PPI)} ppp en los que el píxel empieza a verse. ` +
          'Pide el original a 300 ppp.',
        pageNumbers: low,
      }),
    );
  }
  if (fair.length > 0) {
    issues.push(
      makeIssue(ctx, {
        code: 'low-resolution',
        severity: 'info',
        title: `Resolución justa en ${pagesPhrase(fair)}`,
        detail:
          `Al tamaño de impresión (${formatSizeMm(trim)}) ${plural(fair.length, 'se queda', 'se quedan')} en ${formatNumber(lowestFair, 0)} ppp` +
          `${plural(fair.length, '', ' la peor')}. Es imprimible, pero por debajo de ${String(FAIR_RESOLUTION_PPI)} ppp el texto fino y ` +
          'las líneas pierden nitidez; lo ideal son 300 ppp.',
        pageNumbers: fair,
      }),
    );
  }
  return issues;
}

function checkFormat(ctx: Context): Issue[] {
  const candidates = ctx.entries.filter(
    (entry): entry is MeasurableEntry =>
      entry.unit !== null && entry.estimate !== null && !ctx.misfitUnitIds.has(entry.unit.id),
  );
  const fixedTrim = ctx.config.trim.mode === 'fixed';
  const explained = new Set<number>();

  const issues = checkOrientation(ctx, candidates, explained);
  if (fixedTrim) issues.push(...checkFileSize(ctx, candidates, explained));
  issues.push(...checkSizeConsistency(ctx, candidates, explained));
  if (fixedTrim) issues.push(...checkResolution(ctx, candidates));
  return issues;
}

function checkBinding(ctx: Context): Issue[] {
  const issues: Issue[] = [];
  const { config } = ctx;
  const { imposition } = ctx.input;
  const pageCount = imposition.pageCount;
  const spine = estimateSpine(pageCount, config);

  if (config.binding === 'saddle-stitch') {
    if (pageCount > SADDLE_MAX_PAGES || spine.widthMm > SADDLE_MAX_SPINE_MM) {
      const reason =
        pageCount > SADDLE_MAX_PAGES
          ? `${String(pageCount)} páginas superan las ${String(SADDLE_MAX_PAGES)} que admite una grapada con garantías`
          : `El lomo estimado (${formatMm(spine.widthMm)}) supera los ${formatMm(SADDLE_MAX_SPINE_MM)} que cierran bien con grapa`;
      issues.push(
        makeIssue(ctx, {
          code: 'saddle-stitch-too-thick',
          severity: 'warning',
          title: 'Demasiado gruesa para grapar a caballo',
          detail:
            `${reason}: el ejemplar no cierra plano, las grapas no agarran y el pliego central sobresale. ` +
            'Pasa a lomo cuadrado (fresado o cosido) o reduce páginas o gramaje.',
          fix: { kind: 'set-binding', value: 'perfect-bound', label: 'Cambiar a lomo cuadrado' },
        }),
      );
    }
    if (spine.creepMm >= CREEP_NOTICE_MM) {
      const central = imposition.sheets[imposition.sheets.length - 1];
      issues.push(
        makeIssue(ctx, {
          code: 'creep',
          severity: 'info',
          title: `El pliego central se desplaza ${formatMm(spine.creepMm)}`,
          detail:
            `Con ${String(imposition.sheets.length)} pliegos encartados, los interiores sobresalen por el corte delantero y la guillotina ` +
            `se lleva hasta ${formatMm(spine.creepMm)} del margen exterior de las páginas centrales. Revisa que folios y textos ` +
            'de esas páginas no queden pegados al corte, o pide a la imprenta que compense el desplazamiento.',
          sheetIndexes: central ? [central.index] : [],
        }),
      );
    }
    return issues;
  }

  if (spine.widthMm < PERFECT_MIN_SPINE_MM) {
    issues.push(
      makeIssue(ctx, {
        code: 'spine-too-thin',
        severity: 'warning',
        title: `Lomo de ${formatMm(spine.widthMm)}: muy fino para lomo cuadrado`,
        detail:
          `Con ${String(pageCount)} páginas el lomo estimado no llega a ${formatMm(PERFECT_MIN_SPINE_MM)}: la cola apenas agarra ` +
          'y no cabe rótulo. Para tan pocas páginas es mejor grapar a caballo, o subir el gramaje de la tripa.',
        fix: { kind: 'set-binding', value: 'saddle-stitch', label: 'Cambiar a grapada a caballo' },
      }),
    );
  }

  const size = normalizeSignaturePages(config.signaturePages);
  const interior = imposition.signatures.filter((signature) => signature.role === 'interior');
  const last = interior[interior.length - 1];
  if (last && last.pages < size) {
    issues.push(
      makeIssue(ctx, {
        code: 'signature-remainder',
        severity: 'info',
        title: `El último cuadernillo es de ${String(last.pages)} páginas`,
        detail:
          `La tripa se reparte en cuadernillos de ${String(size)} páginas y el último (cuadernillo ${String(interior.length)}) se queda en ` +
          `${String(last.pages)}. Es válido, pero un cuadernillo corto se manipula peor: consulta con la imprenta si prefiere ` +
          'colocarlo en otra posición o ajustar el número de páginas.',
        pageNumbers: last.pageNumbers,
      }),
    );
  }
  return issues;
}

function compareIssues(a: Issue, b: Issue): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  const byPage = (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0);
  if (byPage !== 0) return byPage;
  const byCode = CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code);
  if (byCode !== 0) return byCode;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const RULES: readonly (readonly [string, (ctx: Context) => Issue[]])[] = [
  ['recuento', checkPageCount],
  ['folios', checkFolios],
  ['modo de entrada', checkInputMode],
  ['formato', checkFormat],
  ['encuadernación', checkBinding],
];

export function validateProject(input: ValidationInput): Issue[] {
  let ctx: Context;
  try {
    ctx = buildContext(input);
  } catch (error) {
    console.warn('Pre-vuelo: no se pudo preparar la validación.', error);
    return [];
  }

  if (ctx.entries.length === 0) {
    return [
      makeIssue(ctx, {
        code: 'no-pages',
        severity: 'info',
        title: 'Aún no hay páginas',
        detail: 'Carga un PDF o las imágenes de la revista para comprobar la paginación y ver la imposición real.',
      }),
    ];
  }

  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const [name, rule] of RULES) {
    let found: Issue[];
    try {
      found = rule(ctx);
    } catch (error) {
      console.warn(`Pre-vuelo: la regla de ${name} falló y se omite.`, error);
      continue;
    }
    for (const issue of found) {
      let id = issue.id;
      for (let n = 2; seen.has(id); n += 1) id = `${issue.id}#${String(n)}`;
      seen.add(id);
      issues.push(id === issue.id ? issue : { ...issue, id });
    }
  }
  return issues.sort(compareIssues);
}
