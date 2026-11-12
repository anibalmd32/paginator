import type { MagazineConfig, Page, PagePlacement, SourceAsset, SourceUnit, TrimSize } from '@/lib/types';

export type UnitShape = 'single' | 'double';

export interface NamedTrim {
  label: string;
  widthMm: number;
  heightMm: number;
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function decimal(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded + 0).replace('.', ',');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${String(Math.round(bytes))} B`;
  if (bytes < 1_000_000) return `${decimal(bytes / 1000, 0)} kB`;
  if (bytes < 1_000_000_000) return `${decimal(bytes / 1_000_000, bytes < 10_000_000 ? 1 : 0)} MB`;
  return `${decimal(bytes / 1_000_000_000, 1)} GB`;
}

export function formatTrim(trim: TrimSize, presets: readonly NamedTrim[]): string {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.6;
  for (const preset of presets) {
    if (near(preset.widthMm, trim.widthMm) && near(preset.heightMm, trim.heightMm)) {
      return `${preset.label} ${decimal(preset.widthMm)} × ${decimal(preset.heightMm)} mm`;
    }
    if (near(preset.widthMm, trim.heightMm) && near(preset.heightMm, trim.widthMm)) {
      return `${preset.label} ${decimal(preset.heightMm)} × ${decimal(preset.widthMm)} mm`;
    }
  }
  return `${decimal(trim.widthMm)} × ${decimal(trim.heightMm)} mm`;
}

export function slotLabel(placement: PagePlacement | undefined): string {
  if (!placement) return '';
  const face = placement.face === 'front' ? 'cara' : 'retiro';
  const side = placement.position === 'left' ? 'izq.' : 'der.';
  return `Pliego ${String(placement.sheetIndex + 1)} · ${face} · ${side}`;
}

export function expectationText(config: MagazineConfig): string {
  if (config.inputMode === 'pages') return 'Esperando páginas individuales';
  if (config.spreadKind === 'printer') return 'Esperando pliegos de imprenta ya impuestos';
  return config.wraparoundCover ? 'Esperando pliegos de lectura con cubierta envolvente' : 'Esperando pliegos dobles de lectura';
}

function imageKind(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WebP';
  return 'JPG';
}

export function assetMeta(asset: SourceAsset): string {
  const kind = asset.kind === 'pdf' ? 'PDF' : imageKind(asset.name);
  const units = asset.kind === 'pdf' ? `${String(asset.unitCount)} ${plural(asset.unitCount, 'pág.', 'págs.')}` : null;
  return [kind, units, formatBytes(asset.sizeBytes)].filter(Boolean).join(' · ');
}

export interface SegmentationSummary {
  headline: string;
  breakdown: string | null;
}

export function segmentationSummary(
  config: MagazineConfig,
  units: readonly SourceUnit[],
  kinds: ReadonlyMap<string, UnitShape>,
  fromFiles: number,
): SegmentationSummary {
  const total = units.length;
  if (total === 0) return { headline: 'Sin archivos', breakdown: null };
  const pagesText = `${String(fromFiles)} ${plural(fromFiles, 'página', 'páginas')}`;

  if (config.inputMode === 'pages') {
    const doubles = units.filter((unit) => kinds.get(unit.id) === 'double').length;
    return {
      headline: `${String(total)} ${plural(total, 'hoja', 'hojas')} → ${pagesText}`,
      breakdown:
        doubles > 0
          ? `${String(doubles)} ${plural(doubles, 'parece un pliego doble', 'parecen pliegos dobles')} y cuenta${doubles === 1 ? '' : 'n'} como una sola página`
          : 'Cada hoja es una página',
    };
  }

  if (config.spreadKind === 'printer') {
    const sheets = Math.ceil(total / 2);
    return {
      headline: `${String(total)} ${plural(total, 'cara de pliego', 'caras de pliego')} → ${pagesText}`,
      breakdown: `Imposición inversa de ${String(sheets)} ${plural(sheets, 'pliego', 'pliegos')}: cara y retiro de cada uno`,
    };
  }

  const ordered = [...units].sort((a, b) => a.order - b.order);
  const doubles = ordered.filter((unit) => kinds.get(unit.id) === 'double').length;
  const singles = total - doubles;
  const headline = `${String(doubles)} ${plural(doubles, 'hoja doble', 'hojas dobles')}${
    singles > 0 ? ` + ${String(singles)} ${plural(singles, 'suelta', 'sueltas')}` : ''
  } → ${pagesText}`;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const parts: string[] = [];
  let middleDoubles = doubles;
  let middleSingles = singles;
  const lastSingle = last !== undefined && last !== first && kinds.get(last.id) !== 'double';
  if (first && kinds.get(first.id) === 'double' && config.wraparoundCover) {
    parts.push('1 cubierta envolvente');
    middleDoubles -= 1;
  } else if (first && kinds.get(first.id) !== 'double') {
    parts.push('1 portada suelta');
    middleSingles -= 1;
  }
  if (lastSingle) middleSingles -= 1;
  if (middleDoubles > 0) parts.push(`${String(middleDoubles)} ${plural(middleDoubles, 'doble', 'dobles')}`);
  if (middleSingles > 0) parts.push(`${String(middleSingles)} ${plural(middleSingles, 'suelta intercalada', 'sueltas intercaladas')}`);
  if (lastSingle) parts.push('1 contraportada suelta');
  return { headline, breakdown: parts.length > 1 ? parts.join(' + ') : null };
}

export function storeIndexOf(pageNumber: number, effectivePages: readonly Page[], pages: readonly Page[]): number | null {
  const page = effectivePages[pageNumber - 1];
  if (!page || page.origin === 'auto-blank') return null;
  const index = pages.findIndex((candidate) => candidate.id === page.id);
  return index >= 0 ? index : null;
}

export function moveDestination(from: number, target: number, after: boolean): number {
  const insertAt = after ? target + 1 : target;
  return from < insertAt ? insertAt - 1 : insertAt;
}

export function guideFragments(pageCount: number, assetCount: number, trimText: string): string[] {
  return [
    `${String(pageCount)} ${plural(pageCount, 'página', 'páginas')}`,
    `${String(assetCount)} ${plural(assetCount, 'archivo', 'archivos')}`,
    trimText,
  ];
}

export const LOAD_ISSUE_CODES: ReadonlySet<string> = new Set([
  'page-count-not-multiple-of-4',
  'blank-pages-added',
  'declared-count-mismatch',
  'folio-out-of-order',
  'duplicate-folio',
  'size-mismatch',
  'orientation-mismatch',
  'spread-side-mismatch',
  'unexpected-single-in-spreads',
  'unexpected-double-in-pages',
  'printer-sides-incomplete',
  'file-size-vs-trim',
  'low-resolution',
]);

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function orderLoadIssues<T extends { severity: string; fix?: unknown }>(issues: readonly T[]): T[] {
  const rank = (issue: T): number => (SEVERITY_ORDER[issue.severity] ?? 3) * 2 + (issue.fix ? 0 : 1);
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => rank(a.issue) - rank(b.issue) || a.index - b.index)
    .map((entry) => entry.issue);
}

export const FOLIO_ISSUE_CODES: ReadonlySet<string> = new Set(['folio-out-of-order', 'duplicate-folio']);
