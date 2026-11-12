import { describe, expect, test } from 'bun:test';

import { digestBlob, fingerprintFile } from './fingerprint';
import { Sha256, sha256Hex } from './sha256';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

async function webCrypto(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytes(length: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

describe('Sha256', () => {
  test('vectores de FIPS 180-4', () => {
    expect(sha256Hex(encode(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  test('un millón de «a» por trozos irregulares', () => {
    const hash = new Sha256();
    const chunk = encode('a'.repeat(997));
    let left = 1_000_000;
    while (left > 0) {
      const take = Math.min(left, chunk.length);
      hash.update(chunk.subarray(0, take));
      left -= take;
    }
    expect(hash.digestHex()).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  test('coincide con WebCrypto en los bordes de bloque (55, 56, 63, 64, 65… bytes)', async () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096 + 7]) {
      const data = bytes(length, length);
      expect(sha256Hex(data)).toBe(await webCrypto(data));
    }
  });

  test('el resultado no depende de cómo se trocee la entrada', async () => {
    const data = bytes(10_000, 7);
    const expected = await webCrypto(data);
    for (const size of [1, 3, 63, 64, 65, 1000, 9999]) {
      const hash = new Sha256();
      for (let offset = 0; offset < data.length; offset += size) hash.update(data.subarray(offset, offset + size));
      expect(hash.digestHex()).toBe(expected);
    }
  });

  test('no admite usarse después de terminar', () => {
    const hash = new Sha256();
    hash.digestHex();
    expect(() => hash.update(encode('x'))).toThrow();
    expect(() => hash.digestHex()).toThrow();
  });
});

describe('fingerprintFile', () => {
  test('SHA-256 en hexadecimal del contenido, sin importar el nombre', async () => {
    const data = bytes(3000, 3);
    const a = new File([data], 'a.pdf');
    const b = new File([data], 'otro-nombre.pdf');
    const expected = await webCrypto(data);
    expect(await fingerprintFile(a)).toBe(expected);
    expect(await fingerprintFile(b)).toBe(expected);
    expect(await fingerprintFile(new File([bytes(3000, 4)], 'a.pdf'))).not.toBe(expected);
  });

  test('memoriza por objeto File', () => {
    const file = new File([bytes(10)], 'x.png');
    expect(fingerprintFile(file)).toBe(fingerprintFile(file));
  });

  test('sin WebCrypto (http en red local) usa el camino incremental y da lo mismo', async () => {
    const data = bytes(9 * 1024 * 1024 + 13, 9);
    const expected = await webCrypto(data);
    expect(await digestBlob(new File([data], 'grande.pdf'), null)).toBe(expected);
  });
});
