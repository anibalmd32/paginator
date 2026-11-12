import { describe, expect, test } from 'bun:test';

import { extractFolioHits, MAX_FOLIO_HITS, parseFolioText } from './folios';
import type { FolioTextItem, FolioViewport } from './folios';

const W = 595.28;
const H = 841.89;

const UPRIGHT: FolioViewport = { width: W, height: H, transform: [1, 0, 0, -1, 0, H] };
const ROTATED_90: FolioViewport = { width: H, height: W, transform: [0, 1, 1, 0, 0, 0] };

function item(str: string, x: number, y: number, size = 9, width = size * 0.55 * str.length): FolioTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size };
}

describe('parseFolioText', () => {
  test('números de 1 a 4 cifras', () => {
    expect(parseFolioText('7')).toBe(7);
    expect(parseFolioText('012')).toBe(12);
    expect(parseFolioText(' 1234 ')).toBe(1234);
  });

  test('admite adornos mínimos', () => {
    expect(parseFolioText('— 12 —')).toBe(12);
    expect(parseFolioText('12 |')).toBe(12);
    expect(parseFolioText('· 3 ·')).toBe(3);
    expect(parseFolioText('[48]')).toBe(48);
  });

  test('rechaza lo que no es un folio', () => {
    expect(parseFolioText('pág. 12')).toBeNull();
    expect(parseFolioText('12 de 16')).toBeNull();
    expect(parseFolioText('2024-05')).toBeNull();
    expect(parseFolioText('12345')).toBeNull();
    expect(parseFolioText('0')).toBeNull();
    expect(parseFolioText('')).toBeNull();
    expect(parseFolioText('————12')).toBeNull();
  });
});

describe('extractFolioHits', () => {
  test('folio al pie, esquina exterior derecha', () => {
    const hits = extractFolioHits([item('5', W - 40, 30)], UPRIGHT);
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit?.value).toBe(5);
    expect(hit?.x).toBeGreaterThan(0.9);
    expect(hit?.y).toBeGreaterThan(0.94);
    expect(hit?.y).toBeLessThan(1);
  });

  test('folio en cabeza, a la izquierda', () => {
    const [hit] = extractFolioHits([item('12', 30, H - 40)], UPRIGHT);
    expect(hit?.value).toBe(12);
    expect(hit?.x).toBeLessThan(0.1);
    expect(hit?.y).toBeLessThan(0.06);
  });

  test('ignora números en el cuerpo de la página', () => {
    expect(extractFolioHits([item('5', W / 2, H / 2)], UPRIGHT)).toEqual([]);
    expect(extractFolioHits([item('5', W / 2, H * 0.2)], UPRIGHT)).toEqual([]);
  });

  test('ignora números grandes (titulares, el número enorme de los fixtures)', () => {
    expect(extractFolioHits([item('5', 100, 40, 60)], UPRIGHT)).toEqual([]);
  });

  test('ignora texto que no es solo un número, marcadores y fragmentos vacíos', () => {
    const items = [item('Revista de prueba', 40, 30), item('pág. 3', 300, 30), { type: 'beginMarkedContent' }, item(' ', 10, 30)];
    expect(extractFolioHits(items, UPRIGHT)).toEqual([]);
  });

  test('sin texto devuelve lista vacía', () => {
    expect(extractFolioHits([], UPRIGHT)).toEqual([]);
  });

  test('pliego doble: un folio por mitad, con su posición', () => {
    const spread: FolioViewport = { width: 2 * W, height: H, transform: [1, 0, 0, -1, 0, H] };
    const hits = extractFolioHits([item('2', 30, 30), item('3', 2 * W - 40, 30)], spread);
    expect(hits.map((hit) => hit.value).sort()).toEqual([2, 3]);
    const left = hits.find((hit) => hit.value === 2);
    const right = hits.find((hit) => hit.value === 3);
    expect(left?.x).toBeLessThan(0.5);
    expect(right?.x).toBeGreaterThan(0.5);
  });

  test('el pie va antes que la cabeza', () => {
    const hits = extractFolioHits([item('2024', 300, H - 30), item('7', 300, 30)], UPRIGHT);
    expect(hits.map((hit) => hit.value)).toEqual([7, 2024]);
  });

  test('aplica la rotación de página a la posición', () => {
    const rotatedText: FolioTextItem = { str: '7', transform: [0, 9, -9, 0, W - 25, H - 35], width: 5, height: 9 };
    const [hit] = extractFolioHits([rotatedText], ROTATED_90);
    expect(hit?.value).toBe(7);
    expect(hit?.x).toBeGreaterThan(0.9);
    expect(hit?.y).toBeGreaterThan(0.9);
  });

  test('tiene en cuenta la escala del viewport (UserUnit)', () => {
    const scaled: FolioViewport = { width: 2 * W, height: 2 * H, transform: [2, 0, 0, -2, 0, 2 * H] };
    const [hit] = extractFolioHits([item('8', 20, 15, 4.5)], scaled);
    expect(hit?.value).toBe(8);
    expect(hit?.x).toBeLessThan(0.1);
    expect(hit?.y).toBeGreaterThan(0.95);
  });

  test('cuenta una sola vez el texto pintado dos veces', () => {
    const hits = extractFolioHits([item('9', 500, 30), item('9', 500.3, 30.2)], UPRIGHT);
    expect(hits).toHaveLength(1);
  });

  test('descarta texto fuera de la caja visible', () => {
    expect(extractFolioHits([item('4', W + 50, 30), item('4', 100, -40)], UPRIGHT)).toEqual([]);
  });

  test('guarda como mucho 6 y reserva sitio para las dos mitades', () => {
    const noise = Array.from({ length: 10 }, (_, i) => item(String(100 + i), 20 + i * 25, 20));
    const hits = extractFolioHits([...noise, item('3', W - 40, 60)], UPRIGHT);
    expect(hits).toHaveLength(MAX_FOLIO_HITS);
    expect(hits.some((hit) => hit.value === 3)).toBe(true);
  });
});
