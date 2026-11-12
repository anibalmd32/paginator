import { describe, expect, test } from 'bun:test';

import { compareFileNames, filenameNumber, naturalCompare } from './natural-order';

describe('naturalCompare', () => {
  test('los tramos de cifras se comparan como números', () => {
    expect(naturalCompare('pag_2', 'pag_10')).toBeLessThan(0);
    expect(naturalCompare('pag_10', 'pag_2')).toBeGreaterThan(0);
    expect(['pag_10', 'pag_1', 'pag_2', 'pag_21', 'pag_3'].sort(naturalCompare)).toEqual([
      'pag_1',
      'pag_2',
      'pag_3',
      'pag_10',
      'pag_21',
    ]);
  });

  test('los ceros a la izquierda no cambian el valor', () => {
    expect(['p010', 'p9', 'p008'].sort(naturalCompare)).toEqual(['p008', 'p9', 'p010']);
  });

  test('no distingue mayúsculas ni acentos', () => {
    expect(['Página 3', 'pagina 2', 'PÁGINA 1'].sort(naturalCompare)).toEqual(['PÁGINA 1', 'pagina 2', 'Página 3']);
  });

  test('aguanta números que no caben en un number', () => {
    expect(naturalCompare('scan_20240101120000000001', 'scan_20240101120000000002')).toBeLessThan(0);
  });

  test('es un orden total: solo devuelve 0 para cadenas idénticas', () => {
    expect(naturalCompare('pag_2', 'pag_2')).toBe(0);
    expect(naturalCompare('pag_02', 'pag_2')).not.toBe(0);
    expect(naturalCompare('pag_02', 'pag_2')).toBe(-naturalCompare('pag_2', 'pag_02'));
    expect(naturalCompare('Pag', 'pag')).not.toBe(0);
  });

  test('ordenar es determinista sea cual sea el orden de entrada', () => {
    const names = ['b2', 'B10', 'a1', 'á1', 'A01', 'b1', 'a10', 'a2'];
    const sorted = [...names].sort(naturalCompare);
    expect([...names].reverse().sort(naturalCompare)).toEqual(sorted);
  });
});

describe('compareFileNames', () => {
  test('el nombre sin extensión manda sobre la extensión', () => {
    expect(['revista 2.pdf', 'revista.pdf'].sort(compareFileNames)).toEqual(['revista.pdf', 'revista 2.pdf']);
  });

  test('ordena un lote de páginas sueltas', () => {
    const names = ['pag_10.png', 'pag_2.png', 'pag_1.png', 'Pag_3.PNG'];
    expect(names.sort(compareFileNames)).toEqual(['pag_1.png', 'pag_2.png', 'Pag_3.PNG', 'pag_10.png']);
  });

  test('con rutas relativas agrupa por carpeta', () => {
    const names = ['tripa/pag_2.png', 'cubierta/pag_10.png', 'tripa/pag_1.png'];
    expect(names.sort(compareFileNames)).toEqual(['cubierta/pag_10.png', 'tripa/pag_1.png', 'tripa/pag_2.png']);
  });
});

describe('filenameNumber', () => {
  test('toma el último grupo de cifras del nombre sin extensión', () => {
    expect(filenameNumber('revista_v2_p012.jpg')).toBe(12);
    expect(filenameNumber('pag_003.png')).toBe(3);
    expect(filenameNumber('canto_pliego_02-03.jpg')).toBe(3);
    expect(filenameNumber('7.webp')).toBe(7);
  });

  test('sin cifras devuelve null', () => {
    expect(filenameNumber('portada.png')).toBeNull();
  });

  test('las cifras de la extensión no cuentan si la extensión es conocida', () => {
    expect(filenameNumber('portada.JPEG')).toBeNull();
  });

  test('una marca de tiempo que no cabe en un entero seguro no es un folio', () => {
    expect(filenameNumber('scan_20240101120000000001.png')).toBeNull();
  });
});
