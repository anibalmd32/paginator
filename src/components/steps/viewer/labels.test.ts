import { describe, expect, test } from 'bun:test';

import { computeImposition } from '@/lib/imposition';

import { liveReadingText, liveSheetText, openingOf, openingShortText, parsePageInput, placementText, sheetSideText } from './labels';

const saddle = computeImposition(24, { binding: 'saddle-stitch', signaturePages: 16, separateCover: false, readingDirection: 'ltr' });

describe('palabras guía', () => {
  test('portada, pliegos interiores y contraportada', () => {
    expect(openingShortText(openingOf(saddle, 0))).toBe('Portada');
    expect(openingShortText(openingOf(saddle, 6))).toBe('Págs. 12 – 13');
    expect(openingShortText(openingOf(saddle, 12))).toBe('Contraportada');
  });

  test('recorta posiciones fuera del ejemplar', () => {
    expect(openingOf(saddle, -3).kind).toBe('cover');
    expect(openingOf(saddle, 99).kind).toBe('back');
  });

  test('anuncios para lector de pantalla', () => {
    expect(liveReadingText(openingOf(saddle, 6))).toBe('Páginas 12 y 13');
    expect(liveSheetText(saddle, 0, 'front')).toBe(`Pliego 1 de 6, cara: páginas ${saddle.sheets[0]?.front.left} y ${saddle.sheets[0]?.front.right}`);
  });
});

describe('casilla de imprenta', () => {
  test('grapada de 24: la portada y la contraportada comparten el pliego exterior', () => {
    expect(placementText(saddle, 1)).toMatch(/^Pliego 1 · (cara|retiro) · (izq\.|der\.)$/);
    const first = saddle.placements[0];
    const last = saddle.placements[23];
    expect(first?.sheetIndex).toBe(last?.sheetIndex);
    expect(sheetSideText(saddle, 0, 'front')).toBe(`${saddle.sheets[0]?.front.left} | ${saddle.sheets[0]?.front.right}`);
  });

  test('página inexistente', () => {
    expect(placementText(saddle, 25)).toBeNull();
  });
});

describe('ir a página', () => {
  test('acepta números sueltos o con texto alrededor', () => {
    expect(parsePageInput('12', 24)).toBe(12);
    expect(parsePageInput('pág. 7', 24)).toBe(7);
    expect(parsePageInput('12-13', 24)).toBe(12);
  });

  test('rechaza vacío y fuera de rango', () => {
    expect(parsePageInput('', 24)).toBeNull();
    expect(parsePageInput('0', 24)).toBeNull();
    expect(parsePageInput('25', 24)).toBeNull();
  });
});
