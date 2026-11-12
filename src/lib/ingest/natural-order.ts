const TEXT_COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

const KNOWN_EXTENSION = /\.(?:pdf|png|jpe?g|jpe|jfif|webp)$/i;

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDigitRuns(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, '');
  const y = b.replace(/^0+(?=\d)/, '');
  if (x.length !== y.length) return x.length - y.length;
  return codePointCompare(x, y);
}

export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0;
  const partsA = a.split(/(\d+)/);
  const partsB = b.split(/(\d+)/);
  const shared = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < shared; i++) {
    const x = partsA[i] ?? '';
    const y = partsB[i] ?? '';
    const diff = i % 2 === 1 ? compareDigitRuns(x, y) : TEXT_COLLATOR.compare(x, y);
    if (diff !== 0) return diff;
  }
  if (partsA.length !== partsB.length) return partsA.length - partsB.length;
  return codePointCompare(a, b);
}

function splitPath(path: string): { dir: string; stem: string; ext: string } {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { dir, stem: base, ext: '' };
  return { dir, stem: base.slice(0, dot), ext: base.slice(dot + 1) };
}

export function compareFileNames(a: string, b: string): number {
  const pa = splitPath(a);
  const pb = splitPath(b);
  return (
    naturalCompare(pa.dir, pb.dir) ||
    naturalCompare(pa.stem, pb.stem) ||
    naturalCompare(pa.ext, pb.ext) ||
    codePointCompare(a, b)
  );
}

export function filenameNumber(name: string): number | null {
  const stem = name.replace(KNOWN_EXTENSION, '');
  const groups = stem.match(/\d+/g);
  const last = groups?.[groups.length - 1];
  if (last === undefined) return null;
  const value = Number(last);
  return Number.isSafeInteger(value) ? value : null;
}
