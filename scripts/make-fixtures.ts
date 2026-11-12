import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import {
  clip,
  degrees,
  endPath,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures');

const mm = (value: number): number => (value * 72) / 25.4;

const TRIM_W = mm(210);
const TRIM_H = mm(297);
const BLEED = mm(3);
const MARKS = mm(5);

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

type Side = 'left' | 'right';
type Color = [number, number, number];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sideOf(n: number): Side {
  return n % 2 === 0 ? 'left' : 'right';
}

function hsl(hueDeg: number, s: number, l: number): Color {
  const h = (((hueDeg % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const sector: Color =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [sector[0] + m, sector[1] + m, sector[2] + m];
}

function pageColor(n: number): Color {
  return hsl((n - 1) * 137.508 + 8, 0.6, 0.47);
}

function spineBandHeight(n: number): number {
  const spread = Math.floor(n / 2);
  return 0.2 + 0.5 * ((spread * 0.381966) % 1);
}

const INK: Color = [0.09, 0.09, 0.12];
const WHITE: Color = [1, 1, 1];

interface Fonts {
  bold: PDFFont;
  regular: PDFFont;
}

const toRgb = (c: Color): RGB => rgb(c[0], c[1], c[2]);

function paintPage(page: PDFPage, fonts: Fonts, trim: Box, n: number, total: number, bleed = 0): void {
  const side = sideOf(n);
  const spineX = side === 'left' ? trim.x + trim.w : trim.x;
  const inward = side === 'left' ? -1 : 1;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(trim.x - bleed, trim.y - bleed, trim.w + 2 * bleed, trim.h + 2 * bleed),
    clip(),
    endPath(),
  );

  page.drawRectangle({
    x: trim.x - bleed,
    y: trim.y - bleed,
    width: trim.w + 2 * bleed,
    height: trim.h + 2 * bleed,
    color: toRgb(pageColor(n)),
  });

  if (n > 1 && n < total) {
    const bandY = trim.y + trim.h * spineBandHeight(n);
    const bandH = trim.h * 0.045;
    const bandW = trim.w * 0.4 + bleed;
    const bandStart = spineX - inward * bleed;
    page.drawRectangle({
      x: inward > 0 ? bandStart : bandStart - bandW,
      y: bandY - bandH / 2,
      width: bandW,
      height: bandH,
      color: toRgb(INK),
    });
    page.drawCircle({ x: spineX, y: bandY, size: trim.w * 0.11, color: toRgb(WHITE) });
    page.drawCircle({ x: spineX, y: bandY, size: trim.w * 0.06, color: toRgb(INK) });
  }

  const label = String(n);
  const bigSize = Math.min(trim.h * 0.42, (trim.w * 0.8 * 1000) / fonts.bold.widthOfTextAtSize(label, 1000));
  const bigWidth = fonts.bold.widthOfTextAtSize(label, bigSize);
  page.drawText(label, {
    x: trim.x + (trim.w - bigWidth) / 2,
    y: trim.y + trim.h * 0.56 - bigSize * 0.36,
    size: bigSize,
    font: fonts.bold,
    color: toRgb(WHITE),
  });

  const sideLabel = side === 'left' ? 'IZQ' : 'DER';
  const sideSize = trim.h * 0.05;
  const sideWidth = fonts.bold.widthOfTextAtSize(sideLabel, sideSize);
  page.drawText(sideLabel, {
    x: side === 'left' ? trim.x + mm(12) : trim.x + trim.w - mm(12) - sideWidth,
    y: trim.y + trim.h - mm(24),
    size: sideSize,
    font: fonts.bold,
    color: toRgb(INK),
  });

  const header = `Paginator · fixture · pág. ${n} de ${total}`;
  const headerSize = 7;
  const headerWidth = fonts.regular.widthOfTextAtSize(header, headerSize);
  page.drawText(header, {
    x: side === 'left' ? trim.x + trim.w - mm(12) - headerWidth : trim.x + mm(12),
    y: trim.y + trim.h - mm(9),
    size: headerSize,
    font: fonts.regular,
    color: toRgb(INK),
  });

  const folioSize = 9;
  const folioWidth = fonts.regular.widthOfTextAtSize(label, folioSize);
  page.drawText(label, {
    x: side === 'left' ? trim.x + mm(10) : trim.x + trim.w - mm(10) - folioWidth,
    y: trim.y + mm(9),
    size: folioSize,
    font: fonts.regular,
    color: toRgb(INK),
  });

  page.pushOperators(popGraphicsState());
}

function paintCropMarks(page: PDFPage, trim: Box): void {
  const stroke = { thickness: 0.25, color: rgb(0, 0, 0) };
  for (const cx of [trim.x, trim.x + trim.w]) {
    for (const cy of [trim.y, trim.y + trim.h]) {
      const dx = cx === trim.x ? -1 : 1;
      const dy = cy === trim.y ? -1 : 1;
      page.drawLine({ start: { x: cx + dx * BLEED, y: cy }, end: { x: cx + dx * (BLEED + MARKS), y: cy }, ...stroke });
      page.drawLine({ start: { x: cx, y: cy + dy * BLEED }, end: { x: cx, y: cy + dy * (BLEED + MARKS) }, ...stroke });
    }
  }
}

async function newDocument(title: string): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(title);
  doc.setProducer('Paginator · scripts/make-fixtures.ts');
  doc.setCreator('Paginator');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const fonts: Fonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
  };
  return { doc, fonts };
}

async function savePdf(doc: PDFDocument, name: string): Promise<void> {
  await writeOut(name, await doc.save({ useObjectStreams: true }));
}

async function makeSinglePages(name: string, order: number[], total: number): Promise<void> {
  const { doc, fonts } = await newDocument(name);
  for (const n of order) {
    const page = doc.addPage([TRIM_W, TRIM_H]);
    paintPage(page, fonts, { x: 0, y: 0, w: TRIM_W, h: TRIM_H }, n, total);
  }
  await savePdf(doc, name);
}

async function makeBleedPages(name: string, total: number): Promise<void> {
  const { doc, fonts } = await newDocument(name);
  const margin = BLEED + MARKS;
  for (let n = 1; n <= total; n++) {
    const page = doc.addPage([TRIM_W + 2 * margin, TRIM_H + 2 * margin]);
    const trim: Box = { x: margin, y: margin, w: TRIM_W, h: TRIM_H };
    paintPage(page, fonts, trim, n, total, BLEED);
    paintCropMarks(page, trim);
    page.setTrimBox(trim.x, trim.y, trim.w, trim.h);
    page.setBleedBox(trim.x - BLEED, trim.y - BLEED, trim.w + 2 * BLEED, trim.h + 2 * BLEED);
  }
  await savePdf(doc, name);
}

type SheetSpec = number | [number, number];

async function makeSheets(name: string, sheets: SheetSpec[], total: number): Promise<void> {
  const { doc, fonts } = await newDocument(name);
  for (const sheet of sheets) {
    if (typeof sheet === 'number') {
      const page = doc.addPage([TRIM_W, TRIM_H]);
      paintPage(page, fonts, { x: 0, y: 0, w: TRIM_W, h: TRIM_H }, sheet, total);
    } else {
      const page = doc.addPage([TRIM_W * 2, TRIM_H]);
      paintPage(page, fonts, { x: 0, y: 0, w: TRIM_W, h: TRIM_H }, sheet[0], total);
      paintPage(page, fonts, { x: TRIM_W, y: 0, w: TRIM_W, h: TRIM_H }, sheet[1], total);
    }
  }
  await savePdf(doc, name);
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function readerSpreads(total: number): [number, number][] {
  const spreads: [number, number][] = [];
  for (let left = 2; left < total; left += 2) spreads.push([left, left + 1]);
  return spreads;
}

function saddleStitchSides(total: number): [number, number][] {
  const sides: [number, number][] = [];
  for (let k = 0; k < total / 4; k++) {
    sides.push([total - 2 * k, 2 * k + 1], [2 * k + 2, total - 2 * k - 1]);
  }
  return sides;
}

async function makeEdgeCases(): Promise<void> {
  const garbage = new TextEncoder().encode(
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      'este archivo se cortó a medias y no tiene tabla de referencias ni páginas\n',
  );
  await writeOut('casos-limite/danado.pdf', garbage);

  {
    const { doc, fonts } = await newDocument('protegido.pdf');
    const page = doc.addPage([TRIM_W, TRIM_H]);
    paintPage(page, fonts, { x: 0, y: 0, w: TRIM_W, h: TRIM_H }, 1, 4);
    const fakeHash = (seed: number): PDFHexString =>
      PDFHexString.of(
        Array.from({ length: 32 }, (_, i) => ((seed + i * 37) % 256).toString(16).padStart(2, '0')).join(''),
      );
    const encrypt = doc.context.obj({ Filter: 'Standard', V: 1, R: 2, O: fakeHash(11), U: fakeHash(101), P: -44 });
    doc.context.trailerInfo.Encrypt = doc.context.register(encrypt);
    const id = PDFHexString.of('5061676965e16e61746f722d666978747572652d3031');
    doc.context.trailerInfo.ID = doc.context.obj([id, id]);
    await writeOut('casos-limite/protegido.pdf', await doc.save({ useObjectStreams: false }));
  }

  {
    const { doc, fonts } = await newDocument('rotada-y-userunit.pdf');

    const rotated = doc.addPage([TRIM_W, TRIM_H]);
    rotated.setRotation(degrees(90));
    rotated.drawRectangle({ x: 0, y: 0, width: TRIM_W, height: TRIM_H, color: toRgb(pageColor(7)) });
    rotated.drawText('GIRADA', {
      x: TRIM_W * 0.62,
      y: TRIM_H * 0.22,
      size: 110,
      font: fonts.bold,
      color: toRgb(WHITE),
      rotate: degrees(90),
    });
    rotated.drawText('7', {
      x: TRIM_W - mm(9),
      y: TRIM_H - mm(10) - fonts.regular.widthOfTextAtSize('7', 9),
      size: 9,
      font: fonts.regular,
      color: toRgb(INK),
      rotate: degrees(90),
    });

    const scaled = doc.addPage([TRIM_W / 2, TRIM_H / 2]);
    scaled.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    scaled.drawRectangle({ x: 0, y: 0, width: TRIM_W / 2, height: TRIM_H / 2, color: toRgb(pageColor(8)) });
    scaled.drawText('x2', { x: TRIM_W * 0.12, y: TRIM_H * 0.2, size: 100, font: fonts.bold, color: toRgb(WHITE) });
    scaled.drawText('8', { x: mm(5), y: mm(4.5), size: 4.5, font: fonts.regular, color: toRgb(INK) });

    await savePdf(doc, 'casos-limite/rotada-y-userunit.pdf');
  }

  await writeOut(
    'casos-limite/notas.docx',
    new TextEncoder().encode('Esto no es una revista: son las notas de la reunión.\n'),
  );
}

class Raster {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 3);
  }

  fill(x: number, y: number, w: number, h: number, color: Color): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    for (let py = y0; py < y1; py++) {
      let offset = (py * this.width + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.data[offset++] = r;
        this.data[offset++] = g;
        this.data[offset++] = b;
      }
    }
  }
}

const DIGITS: Record<string, readonly string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

function drawBlockNumber(raster: Raster, text: string, centerX: number, centerY: number, cell: number, color: Color): void {
  const glyphW = 5 * cell;
  const gap = cell;
  const totalW = text.length * glyphW + (text.length - 1) * gap;
  let x = centerX - totalW / 2;
  const y = centerY - (7 * cell) / 2;
  for (const char of text) {
    const rows = DIGITS[char];
    if (rows) {
      rows.forEach((row, rowIndex) => {
        for (let col = 0; col < row.length; col++) {
          if (row[col] === '1') raster.fill(x + col * cell, y + rowIndex * cell, cell, cell, color);
        }
      });
    }
    x += glyphW + gap;
  }
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, body.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(body, 8);
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  return chunk;
}

function encodePng(raster: Raster): Uint8Array {
  const { width, height, data } = raster;
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 2;
  const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const parts = [
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function makePngPages(total: number): Promise<void> {
  for (let n = 1; n <= total; n++) {
    const width = 620;
    const height = n === 5 ? 760 : 877;
    const raster = new Raster(width, height);
    const side = sideOf(n);
    raster.fill(0, 0, width, height, pageColor(n));

    if (n > 1 && n < total) {
      const bandH = height * 0.045;
      const bandW = width * 0.4;
      const bandY = height * (1 - spineBandHeight(n)) - bandH / 2;
      raster.fill(side === 'left' ? width - bandW : 0, bandY, bandW, bandH, INK);
      const knob = width * 0.07;
      raster.fill(side === 'left' ? width - knob : 0, bandY + bandH / 2 - knob, knob, knob * 2, WHITE);
    }

    const stripe = 22;
    raster.fill(side === 'left' ? 0 : width - stripe, 0, stripe, height, INK);

    drawBlockNumber(raster, String(n), width / 2, height * 0.42, 52, WHITE);
    drawBlockNumber(raster, String(n), side === 'left' ? 70 : width - 70, height - 60, 5, INK);

    await writeOut(`paginas-png/pag_${String(n).padStart(2, '0')}.png`, encodePng(raster));
  }
}

const written: { name: string; bytes: number }[] = [];

async function writeOut(name: string, bytes: Uint8Array): Promise<void> {
  const path = join(OUT, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  written.push({ name, bytes: bytes.length });
}

async function main(): Promise<void> {
  const swapped = range(1, 16);
  swapped[4] = 9;
  swapped[8] = 5;

  await makeSinglePages('revista-16p.pdf', range(1, 16), 16);
  await makeBleedPages('revista-16p-sangrado.pdf', 16);
  await makeSinglePages('revista-14p.pdf', range(1, 14), 14);
  await makeSinglePages('revista-desordenada-16p.pdf', swapped, 16);
  await makeSheets('pliegos-lectura-16p.pdf', [1, ...readerSpreads(16), 16], 16);
  await makeSheets('pliegos-lectura-envolvente-16p.pdf', [[16, 1], ...readerSpreads(16)], 16);
  await makeSheets('pliegos-imprenta-16p.pdf', saddleStitchSides(16), 16);
  await makeSinglePages('revista-48p.pdf', range(1, 48), 48);
  await makePngPages(8);
  await makeEdgeCases();

  const total = written.reduce((sum, file) => sum + file.bytes, 0);
  for (const file of written) console.info(`${String(file.bytes).padStart(8)}  fixtures/${file.name}`);
  console.info(`${String(total).padStart(8)}  total (${written.length} archivos)`);
}

main().catch((error: unknown) => {
  console.error('No se pudieron generar los fixtures:', error);
  process.exit(1);
});
