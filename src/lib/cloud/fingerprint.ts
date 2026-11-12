import { Sha256 } from './sha256';

const CHUNK_BYTES = 4 * 1024 * 1024;

const cache = new WeakMap<Blob, Promise<string>>();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestBlob(blob: Blob, subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null): Promise<string> {
  if (subtle) {
    try {
      return toHex(await subtle.digest('SHA-256', await blob.arrayBuffer()));
    } catch {
    }
  }
  const hash = new Sha256();
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    hash.update(new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
  }
  return hash.digestHex();
}

export function fingerprintFile(file: File): Promise<string> {
  const cached = cache.get(file);
  if (cached) return cached;
  const pending = digestBlob(file);
  cache.set(file, pending);
  pending.catch(() => cache.delete(file));
  return pending;
}
