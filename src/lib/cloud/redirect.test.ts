import { describe, expect, test } from 'bun:test';

import { CALLBACK_PATH, callbackUrl, DEFAULT_NEXT, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  test.each([
    ['/app', '/app'],
    ['/app?proyecto=1b2c&x=1', '/app?proyecto=1b2c&x=1'],
    ['/revistas#lista', '/revistas#lista'],
    ['/', '/'],
    ['/a/../app', '/app'],
    ['/%2F%2Fotro.sitio', '/%2F%2Fotro.sitio'],
    ['/auth/callbackx', '/auth/callbackx'],
  ])('acepta la ruta interna %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  test.each([
    ['nada', null],
    ['indefinido', undefined],
    ['vacío', ''],
    ['URL absoluta', 'https://otro.sitio/app'],
    ['protocolo relativo', '//otro.sitio'],
    ['protocolo relativo con barra invertida', '/\\otro.sitio'],
    ['barras invertidas', '\\\\otro.sitio'],
    ['javascript:', 'javascript:alert(1)'],
    ['ruta relativa', 'app'],
    ['espacio inicial', ' /app'],
    ['tabulador escondido', '/\t/otro.sitio'],
    ['salto de línea', '/app\n'],
    ['punto que normaliza a //', '/.//otro.sitio'],
    ['subida que normaliza a //', '/x/..//otro.sitio'],
    ['la propia página de callback', CALLBACK_PATH],
    ['callback con barra final y parámetros', `${CALLBACK_PATH}/?next=/app`],
    ['larguísima', `/${'a'.repeat(3000)}`],
  ])('rechaza %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_NEXT);
  });

  test('respeta la ruta por defecto que se pida', () => {
    expect(safeNextPath('https://mal', '/app')).toBe('/app');
  });
});

describe('callbackUrl', () => {
  test('absoluta, con next codificado y saneado', () => {
    expect(callbackUrl('http://127.0.0.1:4321', '/app?proyecto=1')).toBe('http://127.0.0.1:4321/auth/callback?next=%2Fapp%3Fproyecto%3D1');
    expect(callbackUrl('https://paginator.example', 'https://mal')).toBe('https://paginator.example/auth/callback?next=%2Frevistas');
  });
});
