import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules', 'pdfjs-dist');
const TARGET = join(ROOT, 'public', 'pdfjs');
const STAMP = join(TARGET, '.sello.json');

const FOLDERS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const;

interface Stamp {
  version: string;
  files: Record<string, number>;
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.filter((entry) => entry.isFile()).length;
  } catch {
    return -1;
  }
}

async function readStamp(): Promise<Stamp | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(STAMP, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { version, files } = parsed as Partial<Stamp>;
    if (typeof version !== 'string' || typeof files !== 'object' || files === null) return null;
    return { version, files };
  } catch {
    return null;
  }
}

async function pdfjsVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(join(SOURCE, 'package.json'), 'utf8'));
  const version = (manifest as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('No se pudo leer la versión de pdfjs-dist.');
  return version;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const version = await pdfjsVersion();

  if (!force) {
    const stamp = await readStamp();
    if (stamp?.version === version) {
      const counts = await Promise.all(FOLDERS.map((folder) => countFiles(join(TARGET, folder))));
      const upToDate = FOLDERS.every((folder, i) => {
        const expected = stamp.files[folder];
        return expected !== undefined && expected > 0 && counts[i] === expected;
      });
      if (upToDate) return;
    }
  }

  const started = performance.now();
  await mkdir(TARGET, { recursive: true });
  const files: Record<string, number> = {};
  for (const folder of FOLDERS) {
    const from = join(SOURCE, folder);
    const to = join(TARGET, folder);
    if ((await countFiles(from)) <= 0) {
      throw new Error(`Falta ${from}: ¿está instalado pdfjs-dist? Ejecuta "bun install".`);
    }
    await rm(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true });
    files[folder] = await countFiles(to);
  }
  const stamp: Stamp = { version, files };
  await writeFile(STAMP, `${JSON.stringify(stamp, null, 2)}\n`);

  const total = Object.values(files).reduce((sum, n) => sum + n, 0);
  const ms = Math.round(performance.now() - started);
  console.info(`pdf.js ${version}: ${total} recursos copiados a public/pdfjs/ (${ms} ms)`);
}

main().catch((error: unknown) => {
  console.error('No se pudieron copiar los recursos de pdf.js:', error);
  process.exit(1);
});
