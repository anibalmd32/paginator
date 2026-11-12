import { describe, expect, test } from 'bun:test';

import { ACCEPT_ATTR, classifyFile, isAcceptedFile, unsupportedReason } from './accept';

describe('classifyFile', () => {
  test('por tipo MIME', () => {
    expect(classifyFile({ name: 'sin-extension', type: 'application/pdf' })).toBe('pdf');
    expect(classifyFile({ name: 'sin-extension', type: 'image/png' })).toBe('image');
    expect(classifyFile({ name: 'sin-extension', type: 'image/jpeg' })).toBe('image');
    expect(classifyFile({ name: 'sin-extension', type: 'image/webp' })).toBe('image');
  });

  test('por extensión cuando el sistema no informa MIME', () => {
    expect(classifyFile({ name: 'Revista.PDF', type: '' })).toBe('pdf');
    expect(classifyFile({ name: 'pag_01.png', type: '' })).toBe('image');
    expect(classifyFile({ name: 'pag_01.JPG', type: '' })).toBe('image');
    expect(classifyFile({ name: 'pag_01.jpeg', type: '' })).toBe('image');
    expect(classifyFile({ name: 'pag_01.webp', type: '' })).toBe('image');
  });

  test('tolera parámetros y mayúsculas en el MIME', () => {
    expect(classifyFile({ name: 'x', type: 'Image/JPEG; charset=binary' })).toBe('image');
  });

  test('un MIME genérico no impide reconocer la extensión', () => {
    expect(classifyFile({ name: 'revista.pdf', type: 'application/octet-stream' })).toBe('pdf');
  });

  test('lo demás no se admite', () => {
    expect(classifyFile({ name: 'notas.docx', type: '' })).toBeNull();
    expect(classifyFile({ name: 'foto.tiff', type: 'image/tiff' })).toBeNull();
    expect(classifyFile({ name: 'sin-extension', type: '' })).toBeNull();
    expect(classifyFile({ name: '.pdf', type: '' })).toBeNull();
  });
});

describe('isAcceptedFile', () => {
  test('trabaja con File de verdad', () => {
    expect(isAcceptedFile(new File(['%PDF-'], 'revista.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isAcceptedFile(new File(['x'], 'pag_01.png'))).toBe(true);
    expect(isAcceptedFile(new File(['x'], 'notas.docx'))).toBe(false);
  });
});

describe('unsupportedReason', () => {
  test('dice qué archivo es y qué se admite', () => {
    expect(unsupportedReason('notas.docx')).toBe('“notas.docx” no es PDF ni imagen PNG/JPG/WebP');
  });

  test('sugiere exportar cuando es un formato de taller', () => {
    expect(unsupportedReason('cubierta.tif')).toContain('expórtalo como PDF, PNG o JPG');
    expect(unsupportedReason('maqueta.indd')).toContain('expórtalo');
  });
});

describe('ACCEPT_ATTR', () => {
  test('incluye PDF e imágenes por MIME y por extensión', () => {
    const parts = ACCEPT_ATTR.split(',');
    for (const expected of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', '.pdf', '.png', '.jpg', '.jpeg', '.webp']) {
      expect(parts).toContain(expected);
    }
  });
});
