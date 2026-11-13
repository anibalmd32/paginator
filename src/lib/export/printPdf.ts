import { cmyk, degrees, PDFDocument, StandardFonts, type PDFEmbeddedPage, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

import { pageGeometry } from '@/lib/imposition';
import type { ImpositionResult, MagazineConfig, NormRect, Page, PageGeometry, SheetFace, SlotPosition, SourceKind, SourceUnit, TrimSize } from '@/lib/types';

export type PrintLayout = 'sheets' | 'reading';

export interface MmBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UserBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PrintSource {
  kind: SourceKind;
  file: Blob;
}

export interface CroppedImage {
  bytes: Uint8Array;
  format: 'png' | 'jpg';
}

export type ImageCropper = (file: Blob, clip: NormRect) => Promise<CroppedImage>;

export interface PrintPdfInput {
  layout: PrintLayout;
  title: string;
  config: MagazineConfig;
  trim: TrimSize;
  imposition: ImpositionResult;
  pages: readonly Page[];
  units: ReadonlyMap<string, SourceUnit>;
  sources: ReadonlyMap<string, PrintSource>;
  cropImage?: ImageCropper;
  onProgress?: (done: number, total: number) => void;
}

export interface SlotDraw {
  pageNumber: number;
  clip: NormRect;
  target: MmBox;
}

export interface SheetPlan {
  width: number;
  height: number;
  trimBox: MmBox;
  bleedBox: MmBox;
  slots: SlotDraw[];
  slug: string | null;
  spineX: number | null;
}

const PT_PER_MM = 72 / 25.4;
const MARK_LENGTH_MM = 5;
const MARK_CLEARANCE_MM = 3;
const SLUG_SIZE_PT = 6;
const MARK_WIDTH_PT = 0.25;
const REGISTRATION = cmyk(1, 1, 1, 1);
const EPSILON = 1e-6;

function pt(mm: number): number {
  return mm * PT_PER_MM;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeRotation(angle: number): Rotation {
  const turned = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return turned === 90 || turned === 180 || turned === 270 ? turned : 0;
}

export function slotClip(geometry: PageGeometry, side: SlotPosition | 'both'): NormRect {
  const trim = geometry.trim;
  const bleed = geometry.bleed;
  const x0 = side === 'right' ? trim.x : bleed.x;
  const x1 = side === 'left' ? trim.x + trim.w : bleed.x + bleed.w;
  const left = clamp01(Math.min(x0, x1));
  const right = clamp01(Math.max(x0, x1));
  const top = clamp01(bleed.y);
  const bottom = clamp01(bleed.y + bleed.h);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function targetBox(clip: NormRect, trimRect: NormRect, trimBox: MmBox, aspect: number): MmBox | null {
  if (trimRect.w <= EPSILON || trimRect.h <= EPSILON || !(aspect > 0)) return null;
  const scale = Math.min(trimBox.width / (trimRect.w * aspect), trimBox.height / trimRect.h);
  const scaleX = scale * aspect;
  const scaleY = scale;
  const offsetX = (trimBox.width - trimRect.w * scaleX) / 2;
  const offsetY = (trimBox.height - trimRect.h * scaleY) / 2;
  const width = clip.w * scaleX;
  const height = clip.h * scaleY;
  const left = trimBox.x + offsetX + (clip.x - trimRect.x) * scaleX;
  const top = trimBox.y + trimBox.height - offsetY - (clip.y - trimRect.y) * scaleY;
  return { x: left, y: top - height, width, height };
}

export function visualToUserBox(rect: NormRect, view: MmBox, rotation: Rotation): UserBox {
  const toUnrotated = (vx: number, vy: number): [number, number] => {
    switch (rotation) {
      case 90:
        return [vy, 1 - vx];
      case 180:
        return [1 - vx, 1 - vy];
      case 270:
        return [1 - vy, vx];
      default:
        return [vx, vy];
    }
  };
  const [u0, v0] = toUnrotated(rect.x, rect.y);
  const [u1, v1] = toUnrotated(rect.x + rect.w, rect.y + rect.h);
  const uMin = Math.min(u0, u1);
  const uMax = Math.max(u0, u1);
  const vMin = Math.min(v0, v1);
  const vMax = Math.max(v0, v1);
  return {
    left: view.x + uMin * view.width,
    right: view.x + uMax * view.width,
    top: view.y + view.height - vMin * view.height,
    bottom: view.y + view.height - vMax * view.height,
  };
}

export function placementFor(target: MmBox, formWidth: number, formHeight: number, rotation: Rotation): { x: number; y: number; xScale: number; yScale: number } {
  const quarter = rotation === 90 || rotation === 270;
  const xScale = (quarter ? target.height : target.width) / formWidth;
  const yScale = (quarter ? target.width : target.height) / formHeight;
  const w = formWidth * xScale;
  const h = formHeight * yScale;
  switch (rotation) {
    case 90:
      return { x: target.x, y: target.y + w, xScale, yScale };
    case 180:
      return { x: target.x + w, y: target.y + h, xScale, yScale };
    case 270:
      return { x: target.x + h, y: target.y, xScale, yScale };
    default:
      return { x: target.x, y: target.y, xScale, yScale };
  }
}

export function marksMargin(bleedMm: number): number {
  return Math.max(nonNegative(bleedMm), MARK_CLEARANCE_MM) + MARK_LENGTH_MM + 3;
}

function faceText(face: SheetFace): string {
  return face === 'front' ? 'cara' : 'retiro';
}

export function planPrintPages(input: Pick<PrintPdfInput, 'layout' | 'title' | 'config' | 'trim' | 'imposition' | 'pages' | 'units'>): SheetPlan[] {
  const { layout, config, trim, imposition, pages, units } = input;
  const bleed = nonNegative(config.bleedMm);
  const geometryOf = (pageNumber: number): { geometry: PageGeometry; aspect: number } | null => {
    const page = pages[pageNumber - 1];
    if (!page || page.unitId === null) return null;
    const unit = units.get(page.unitId);
    if (!unit) return null;
    const aspect = unit.width > 0 && unit.height > 0 ? unit.width / unit.height : 0;
    return { geometry: pageGeometry(page, unit, config, trim), aspect };
  };
  const slot = (pageNumber: number, side: SlotPosition | 'both', trimBox: MmBox): SlotDraw[] => {
    const found = geometryOf(pageNumber);
    if (!found) return [];
    const { geometry, aspect } = found;
    const clip = slotClip(geometry, side);
    const target = targetBox(clip, geometry.trim, trimBox, aspect);
    return target && clip.w > EPSILON && clip.h > EPSILON ? [{ pageNumber, clip, target }] : [];
  };

  if (layout === 'reading') {
    const width = trim.widthMm + 2 * bleed;
    const height = trim.heightMm + 2 * bleed;
    const trimBox: MmBox = { x: bleed, y: bleed, width: trim.widthMm, height: trim.heightMm };
    const bleedBox: MmBox = { x: 0, y: 0, width, height };
    return pages.map((_, index) => ({
      width,
      height,
      trimBox,
      bleedBox,
      slots: slot(index + 1, 'both', trimBox),
      slug: null,
      spineX: null,
    }));
  }

  const margin = marksMargin(bleed);
  const width = 2 * trim.widthMm + 2 * margin;
  const height = trim.heightMm + 2 * margin;
  const total = imposition.sheets.length;
  const plans: SheetPlan[] = [];
  for (const sheet of imposition.sheets) {
    for (const face of ['front', 'back'] as const) {
      const side = sheet[face];
      const leftTrim: MmBox = { x: margin, y: margin, width: trim.widthMm, height: trim.heightMm };
      const rightTrim: MmBox = { x: margin + trim.widthMm, y: margin, width: trim.widthMm, height: trim.heightMm };
      plans.push({
        width,
        height,
        trimBox: { x: margin, y: margin, width: 2 * trim.widthMm, height: trim.heightMm },
        bleedBox: { x: margin - bleed, y: margin - bleed, width: 2 * trim.widthMm + 2 * bleed, height: trim.heightMm + 2 * bleed },
        slots: [...slot(side.left, 'left', leftTrim), ...slot(side.right, 'right', rightTrim)],
        slug: `${input.title} · Pliego ${String(sheet.number)} de ${String(total)} · ${faceText(face)} · págs. ${String(side.left)} | ${String(side.right)}`,
        spineX: margin + trim.widthMm,
      });
    }
  }
  return plans;
}

function intersect(a: MmBox, b: MmBox): MmBox {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : a;
}

function boxOf(box: { x: number; y: number; width: number; height: number }): MmBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function printable(text: string): string {
  return text.replace(/[^ -~ -ÿ·–—‘’“”…€]/g, '?');
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

interface SourceJob {
  pageNumber: number;
  unit: SourceUnit;
  clip: NormRect;
}

async function embedPdfSlots(doc: PDFDocument, file: Blob, name: string, jobs: readonly SourceJob[]): Promise<Map<string, { page: PDFEmbeddedPage; rotation: Rotation }>> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { updateMetadata: false });
  } catch (error) {
    throw new Error(`No se pudo leer «${name}» para montar el PDF (${messageOf(error)}).`, { cause: error });
  }
  const sourcePages = source.getPages();
  const pagesToEmbed: PDFPage[] = [];
  const boxes: UserBox[] = [];
  const rotations: Rotation[] = [];
  const keys: string[] = [];
  for (const job of jobs) {
    const page = sourcePages[job.unit.indexInAsset];
    if (!page) throw new Error(`«${name}» ya no tiene la página ${String(job.unit.indexInAsset + 1)}.`);
    const view = intersect(boxOf(page.getCropBox()), boxOf(page.getMediaBox()));
    const rotation = normalizeRotation(page.getRotation().angle);
    pagesToEmbed.push(page);
    boxes.push(visualToUserBox(job.clip, view, rotation));
    rotations.push(rotation);
    keys.push(slotKey(job.pageNumber, job.clip));
  }
  const embedded = await doc.embedPages(pagesToEmbed, boxes);
  const result = new Map<string, { page: PDFEmbeddedPage; rotation: Rotation }>();
  embedded.forEach((page, index) => {
    const key = keys[index];
    const rotation = rotations[index];
    if (key !== undefined && rotation !== undefined) result.set(key, { page, rotation });
  });
  return result;
}

function slotKey(pageNumber: number, clip: NormRect): string {
  return `${String(pageNumber)}|${clip.x.toFixed(6)}|${clip.y.toFixed(6)}|${clip.w.toFixed(6)}|${clip.h.toFixed(6)}`;
}

function drawCropMarks(page: PDFPage, trimBox: MmBox, bleedMm: number, spineX: number | null): void {
  const gap = Math.max(nonNegative(bleedMm), MARK_CLEARANCE_MM);
  const x0 = trimBox.x;
  const x1 = trimBox.x + trimBox.width;
  const y0 = trimBox.y;
  const y1 = trimBox.y + trimBox.height;
  const line = (ax: number, ay: number, bx: number, by: number, dashed = false): void =>
    page.drawLine({
      start: { x: pt(ax), y: pt(ay) },
      end: { x: pt(bx), y: pt(by) },
      thickness: MARK_WIDTH_PT,
      color: REGISTRATION,
      ...(dashed ? { dashArray: [2, 1.5] } : {}),
    });
  for (const x of [x0, x1]) {
    line(x, y0 - gap, x, y0 - gap - MARK_LENGTH_MM);
    line(x, y1 + gap, x, y1 + gap + MARK_LENGTH_MM);
  }
  for (const y of [y0, y1]) {
    line(x0 - gap, y, x0 - gap - MARK_LENGTH_MM, y);
    line(x1 + gap, y, x1 + gap + MARK_LENGTH_MM, y);
  }
  if (spineX !== null) {
    line(spineX, y0 - gap, spineX, y0 - gap - MARK_LENGTH_MM, true);
    line(spineX, y1 + gap, spineX, y1 + gap + MARK_LENGTH_MM, true);
  }
}

function drawSlug(page: PDFPage, font: PDFFont, text: string, trimBox: MmBox): void {
  page.drawText(printable(text), {
    x: pt(trimBox.x + 8),
    y: pt(Math.max(1.5, trimBox.y / 2 - 3.5)),
    size: SLUG_SIZE_PT,
    font,
    color: cmyk(0, 0, 0, 1),
  });
}

export async function buildPrintPdf(input: PrintPdfInput): Promise<Uint8Array> {
  const plans = planPrintPages(input);
  const doc = await PDFDocument.create();
  doc.setTitle(input.title);
  doc.setCreator('Paginator');
  doc.setProducer('Paginator');

  const jobsByAsset = new Map<string, SourceJob[]>();
  const queued = new Set<string>();
  for (const plan of plans) {
    for (const slot of plan.slots) {
      const page = input.pages[slot.pageNumber - 1];
      const unit = page?.unitId ? input.units.get(page.unitId) : undefined;
      const key = slotKey(slot.pageNumber, slot.clip);
      if (!unit || queued.has(key)) continue;
      queued.add(key);
      const list = jobsByAsset.get(unit.assetId) ?? [];
      list.push({ pageNumber: slot.pageNumber, unit, clip: slot.clip });
      jobsByAsset.set(unit.assetId, list);
    }
  }

  const totalJobs = [...jobsByAsset.values()].reduce((sum, list) => sum + list.length, 0) + plans.length;
  let done = 0;
  const tick = (): void => {
    done += 1;
    input.onProgress?.(done, totalJobs);
  };

  const pdfSlots = new Map<string, { page: PDFEmbeddedPage; rotation: Rotation }>();
  const imageSlots = new Map<string, PDFImage>();
  for (const [assetId, jobs] of jobsByAsset) {
    const source = input.sources.get(assetId);
    const name = jobs[0]?.unit.label ?? assetId;
    if (!source) throw new Error(`Falta el archivo de «${name}»: vuelve a cargarlo antes de exportar.`);
    if (source.kind === 'pdf') {
      const embedded = await embedPdfSlots(doc, source.file, name, jobs);
      for (const [key, value] of embedded) pdfSlots.set(key, value);
      jobs.forEach(tick);
      continue;
    }
    const crop = input.cropImage;
    if (!crop) throw new Error('Este navegador no puede recortar imágenes para el PDF.');
    for (const job of jobs) {
      let image: PDFImage;
      try {
        const cropped = await crop(source.file, job.clip);
        image = cropped.format === 'png' ? await doc.embedPng(cropped.bytes) : await doc.embedJpg(cropped.bytes);
      } catch (error) {
        throw new Error(`No se pudo preparar «${name}» para el PDF (${messageOf(error)}).`, { cause: error });
      }
      imageSlots.set(slotKey(job.pageNumber, job.clip), image);
      tick();
    }
  }

  const font = input.layout === 'sheets' ? await doc.embedFont(StandardFonts.Helvetica) : null;
  for (const plan of plans) {
    const page = doc.addPage([pt(plan.width), pt(plan.height)]);
    page.setTrimBox(pt(plan.trimBox.x), pt(plan.trimBox.y), pt(plan.trimBox.width), pt(plan.trimBox.height));
    page.setBleedBox(pt(plan.bleedBox.x), pt(plan.bleedBox.y), pt(plan.bleedBox.width), pt(plan.bleedBox.height));
    for (const slot of plan.slots) {
      const key = slotKey(slot.pageNumber, slot.clip);
      const target: MmBox = { x: pt(slot.target.x), y: pt(slot.target.y), width: pt(slot.target.width), height: pt(slot.target.height) };
      const embedded = pdfSlots.get(key);
      if (embedded) {
        const place = placementFor(target, embedded.page.width, embedded.page.height, embedded.rotation);
        page.drawPage(embedded.page, { ...place, rotate: degrees(-embedded.rotation) });
        continue;
      }
      const image = imageSlots.get(key);
      if (image) page.drawImage(image, target);
    }
    if (input.layout === 'sheets') {
      drawCropMarks(page, plan.trimBox, input.config.bleedMm, plan.spineX);
      if (font && plan.slug) drawSlug(page, font, plan.slug, plan.trimBox);
    }
    tick();
  }

  return doc.save();
}
