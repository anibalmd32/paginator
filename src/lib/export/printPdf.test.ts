import { describe, expect, test } from 'bun:test';
import { degrees, PDFDocument, PDFName } from 'pdf-lib';

import { computeImposition, DEFAULT_CONFIG } from '@/lib/imposition';
import type { MagazineConfig, Page, PageGeometry, SourceUnit } from '@/lib/types';

import { buildPrintPdf, marksMargin, normalizeRotation, placementFor, planPrintPages, slotClip, targetBox, visualToUserBox } from './printPdf';

const MM = 72 / 25.4;
const close = (a: number, b: number, digits = 3): void => expect(a).toBeCloseTo(b, digits);

const geometry: PageGeometry = {
  source: { x: 0, y: 0, w: 1, h: 1 },
  bleed: { x: 0, y: 0, w: 1, h: 1 },
  trim: { x: 0.1, y: 0.05, w: 0.8, h: 0.9 },
  safe: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 },
};

describe('recortes y destino', () => {
  test('en el pliego la página izquierda pierde el sangrado del lomo y la derecha también', () => {
    expect(slotClip(geometry, 'left')).toEqual({ x: 0, y: 0, w: 0.9, h: 1 });
    const right = slotClip(geometry, 'right');
    close(right.x, 0.1);
    close(right.w, 0.9);
    expect(slotClip(geometry, 'both')).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test('el corte del archivo cae exactamente sobre la caja de corte de destino', () => {
    const trimBox = { x: 10, y: 20, width: 200, height: 300 };
    const aspect = (200 / 0.8) / (300 / 0.9);
    const whole = targetBox({ x: 0, y: 0, w: 1, h: 1 }, geometry.trim, trimBox, aspect);
    expect(whole).not.toBeNull();
    close(whole?.x ?? 0, 10 - 25);
    close(whole?.width ?? 0, 250);
    close(whole?.y ?? 0, 20 - 300 * (0.05 / 0.9));
    close((whole?.y ?? 0) + (whole?.height ?? 0), 320 + 300 * (0.05 / 0.9));
    const exact = targetBox(geometry.trim, geometry.trim, trimBox, aspect);
    close(exact?.x ?? 0, 10);
    close(exact?.width ?? 0, 200);
    close(exact?.height ?? 0, 300);
  });

  test('si el archivo no tiene la proporción del corte, no se deforma: se encaja centrado', () => {
    const trimBox = { x: 0, y: 0, width: 100, height: 150 };
    const full = { x: 0, y: 0, w: 1, h: 1 };
    const landscape = targetBox(full, full, trimBox, 1.5);
    close(landscape?.width ?? 0, 100);
    close(landscape?.height ?? 0, 100 / 1.5);
    close(landscape?.y ?? 0, (150 - 100 / 1.5) / 2);
  });

  test('normaliza giros', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(0)).toBe(0);
  });
});

describe('coordenadas de la página de origen', () => {
  const view = { x: 10, y: 20, width: 100, height: 200 };
  const corner = { x: 0, y: 0, w: 0.5, h: 0.25 };

  test('sin giro la esquina visual superior izquierda es la superior izquierda de la caja', () => {
    expect(visualToUserBox(corner, view, 0)).toEqual({ left: 10, right: 60, top: 220, bottom: 170 });
  });

  test('girada 90°, lo que se ve arriba a la izquierda es la esquina inferior izquierda sin girar', () => {
    expect(visualToUserBox(corner, view, 90)).toEqual({ left: 10, right: 35, top: 120, bottom: 20 });
  });

  test('girada 180° y 270°', () => {
    expect(visualToUserBox(corner, view, 180)).toEqual({ left: 60, right: 110, top: 70, bottom: 20 });
    expect(visualToUserBox(corner, view, 270)).toEqual({ left: 85, right: 110, top: 220, bottom: 120 });
  });

  test('la colocación girada ocupa exactamente la caja de destino', () => {
    const target = { x: 5, y: 7, width: 40, height: 60 };
    for (const rotation of [0, 90, 180, 270] as const) {
      const form = rotation % 180 === 0 ? { w: 20, h: 30 } : { w: 30, h: 20 };
      const place = placementFor(target, form.w, form.h, rotation);
      const corners = [
        [0, 0],
        [form.w, 0],
        [0, form.h],
        [form.w, form.h],
      ].map(([a = 0, b = 0]) => {
        const sx = a * place.xScale;
        const sy = b * place.yScale;
        const r = (-rotation * Math.PI) / 180;
        return [place.x + sx * Math.cos(r) - sy * Math.sin(r), place.y + sx * Math.sin(r) + sy * Math.cos(r)] as const;
      });
      close(Math.min(...corners.map(([x]) => x)), target.x);
      close(Math.max(...corners.map(([x]) => x)), target.x + target.width);
      close(Math.min(...corners.map(([, y]) => y)), target.y);
      close(Math.max(...corners.map(([, y]) => y)), target.y + target.height);
    }
  });
});

const config: MagazineConfig = { ...DEFAULT_CONFIG, bleedMm: 3, marksMm: 0, trim: { mode: 'fixed', presetId: null, widthMm: 100, heightMm: 150 } };
const trim = { widthMm: 100, heightMm: 150 };

function fixturePages(count: number, assetId = 'a'): { pages: Page[]; units: Map<string, SourceUnit> } {
  const pages: Page[] = [];
  const units = new Map<string, SourceUnit>();
  for (let index = 0; index < count; index += 1) {
    const id = `${assetId}/${String(index)}`;
    units.set(id, {
      id,
      assetId,
      indexInAsset: index,
      order: index,
      label: `p${String(index + 1)}`,
      width: 300,
      height: 440,
      widthMm: 106,
      heightMm: 156,
      filenameNumber: null,
      folios: [],
    });
    pages.push({ id: `${id}:full`, origin: 'file', unitId: id, half: 'full', detectedFolio: null });
  }
  return { pages, units };
}

describe('plan de hojas', () => {
  test('pliegos: una hoja por cara, en orden de imprenta, con el lomo en el centro', () => {
    const { pages, units } = fixturePages(8);
    const imposition = computeImposition(8, config);
    const plans = planPrintPages({ layout: 'sheets', title: 'Prueba', config, trim, imposition, pages, units });
    expect(plans).toHaveLength(4);
    const margin = marksMargin(3);
    expect(plans[0]?.width).toBeCloseTo(200 + 2 * margin);
    expect(plans[0]?.spineX).toBeCloseTo(margin + 100);
    expect(plans[0]?.slots.map((slot) => slot.pageNumber)).toEqual([8, 1]);
    expect(plans[1]?.slots.map((slot) => slot.pageNumber)).toEqual([2, 7]);
    expect(plans[0]?.slug).toContain('Pliego 1 de 2 · cara · págs. 8 | 1');
    const [left, right] = plans[0]?.slots ?? [];
    close((left?.target.x ?? 0) + (left?.target.width ?? 0), margin + 100);
    close(right?.target.x ?? 0, margin + 100);
    close(left?.target.x ?? 0, margin - 3);
  });

  test('las blancas no dibujan nada', () => {
    const { pages, units } = fixturePages(6);
    const blank: Page = { id: 'blank:auto:1', origin: 'auto-blank', unitId: null, half: 'full', detectedFolio: null };
    const imposition = computeImposition(8, config);
    const plans = planPrintPages({ layout: 'reading', title: 'x', config, trim, imposition, pages: [...pages, blank, blank], units });
    expect(plans).toHaveLength(8);
    expect(plans[7]?.slots).toEqual([]);
    expect(plans[0]?.width).toBeCloseTo(106);
  });
});

async function sourcePdf(count: number, rotateEvery = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) {
    const rotated = rotateEvery > 0 && index % rotateEvery === 1;
    const page = doc.addPage(rotated ? [156 * MM + 40, 106 * MM + 40] : [106 * MM + 40, 156 * MM + 40]);
    page.setCropBox(20, 20, rotated ? 156 * MM : 106 * MM, rotated ? 106 * MM : 156 * MM);
    if (rotated) page.setRotation(degrees(90));
    page.drawText(`Pagina ${String(index + 1)}`, { x: 60, y: 60, size: 24 });
  }
  return doc.save();
}

describe('PDF montado', () => {
  test('pliegos con marcas, cajas de corte y sangrado, y páginas giradas incluidas', async () => {
    const { pages, units } = fixturePages(8);
    const file = new Blob([(await sourcePdf(8, 3)) as BlobPart], { type: 'application/pdf' });
    const progress: number[] = [];
    const bytes = await buildPrintPdf({
      layout: 'sheets',
      title: 'Canto nº 12',
      config,
      trim,
      imposition: computeImposition(8, config),
      pages,
      units,
      sources: new Map([['a', { kind: 'pdf', file }]]),
      onProgress: (done) => progress.push(done),
    });
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(4);
    const margin = marksMargin(3);
    const first = out.getPage(0);
    close(first.getWidth() / MM, 200 + 2 * margin, 2);
    const trimBox = first.getTrimBox();
    close(trimBox.x / MM, margin, 2);
    close(trimBox.width / MM, 200, 2);
    close(first.getBleedBox().width / MM, 206, 2);
    expect(first.node.Resources()?.lookup(PDFName.of('XObject'))).toBeDefined();
    expect(progress.at(-1)).toBe(12);
    expect(out.getTitle()).toBe('Canto nº 12');
  });

  test('en orden de lectura, una hoja por página al tamaño de corte más sangrado', async () => {
    const { pages, units } = fixturePages(8);
    const file = new Blob([(await sourcePdf(8)) as BlobPart], { type: 'application/pdf' });
    const bytes = await buildPrintPdf({
      layout: 'reading',
      title: 'x',
      config,
      trim,
      imposition: computeImposition(8, config),
      pages,
      units,
      sources: new Map([['a', { kind: 'pdf', file }]]),
    });
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(8);
    close(out.getPage(0).getWidth() / MM, 106, 2);
    close(out.getPage(0).getTrimBox().x / MM, 3, 2);
  });

  test('si falta el archivo de origen lo dice', async () => {
    const { pages, units } = fixturePages(4);
    const run = buildPrintPdf({ layout: 'reading', title: 'x', config, trim, imposition: computeImposition(4, config), pages, units, sources: new Map() });
    expect(run).rejects.toThrow('Falta el archivo');
  });
});
