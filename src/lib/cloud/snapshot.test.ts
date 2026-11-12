import { describe, expect, test } from 'bun:test';

import { buildPages, createManualBlank, DEFAULT_CONFIG } from '@/lib/imposition';
import type { FolioHit, MagazineConfig, Page, SourceAsset, SourceUnit } from '@/lib/types';

import { CloudError } from './errors';
import {
  createSnapshot,
  jsonbTextByteSize,
  normalizeTitle,
  parseSnapshot,
  planRestore,
  SNAPSHOT_MAX_BYTES,
  snapshotByteSize,
  TITLE_MAX_LENGTH,
} from './snapshot';
import type { CreateSnapshotInput, ProjectSnapshot, ProjectSummary } from './snapshot';

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);
const H = { a: hash('a'), b: hash('b'), c: hash('c'), d: hash('d'), e: hash('e') };

const SUMMARY: ProjectSummary = { pageCount: 8, sheetCount: 2, signatureCount: 1, verdict: 'warnings', errors: 0, warnings: 2 };

interface Loaded {
  assets: SourceAsset[];
  units: SourceUnit[];
  fingerprints: Map<string, string>;
}

interface FileSpec {
  name: string;
  sha: string;
  units: number;
  width?: number;
  kind?: 'pdf' | 'image';
  folios?: FolioHit[][];
}

function load(prefix: string, specs: FileSpec[], options: { skipFingerprint?: string[] } = {}): Loaded {
  const assets: SourceAsset[] = [];
  const units: SourceUnit[] = [];
  const fingerprints = new Map<string, string>();
  let order = 0;
  specs.forEach((spec, fileIndex) => {
    const id = `${prefix}-f${String(fileIndex)}`;
    assets.push({
      id,
      file: new File([spec.name], spec.name),
      name: spec.name,
      kind: spec.kind ?? 'pdf',
      sizeBytes: 1000 + fileIndex,
      unitCount: spec.units,
    });
    if (!options.skipFingerprint?.includes(spec.name)) fingerprints.set(id, spec.sha);
    for (let i = 0; i < spec.units; i += 1) {
      units.push({
        id: `${id}-u${String(i)}`,
        assetId: id,
        indexInAsset: i,
        order: order++,
        label: `${spec.name} · p. ${String(i + 1)}`,
        width: spec.width ?? 1000,
        height: 1414,
        widthMm: 210,
        heightMm: 297,
        filenameNumber: null,
        folios: spec.folios?.[i] ?? [],
      });
    }
  });
  return { assets, units, fingerprints };
}

function config(patch: Partial<MagazineConfig> = {}): MagazineConfig {
  return { ...DEFAULT_CONFIG, title: 'Canto nº 3', ...patch };
}

function snapshotOf(loaded: Loaded, pages: Page[], patch: Partial<CreateSnapshotInput> = {}): ProjectSnapshot {
  return createSnapshot({
    config: config(),
    assets: loaded.assets,
    units: loaded.units,
    pages,
    pagesEdited: false,
    fingerprints: loaded.fingerprints,
    derived: SUMMARY,
    ...patch,
  });
}

function describePages(pages: Page[] | null, units: SourceUnit[], assets: SourceAsset[]): string[] | null {
  if (!pages) return null;
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const nameOf = new Map(assets.map((asset) => [asset.id, asset.name]));
  return pages.map((page) => {
    if (page.origin !== 'file') return page.origin;
    const unit = page.unitId ? unitById.get(page.unitId) : undefined;
    return `${nameOf.get(unit?.assetId ?? '') ?? '?'}#${String(unit?.indexInAsset)}:${page.half}`;
  });
}

const REMOVE = Symbol('borrar');
type Path = (string | number)[];

const roundTrip = (snapshot: ProjectSnapshot): ProjectSnapshot | null => parseSnapshot(JSON.parse(JSON.stringify(snapshot)));

const TWO_FILES: FileSpec[] = [
  { name: 'tripa.pdf', sha: H.a, units: 6 },
  { name: 'cubierta.pdf', sha: H.b, units: 2 },
];

describe('createSnapshot', () => {
  test('guarda metadatos, huellas, orden y resumen; nada de contenido de las páginas', () => {
    const loaded = load('x', TWO_FILES);
    const pages = buildPages(loaded.units, config());
    const snapshot = snapshotOf(loaded, pages);

    expect(snapshot.version).toBe(1);
    expect(snapshot.title).toBe('Canto nº 3');
    expect(snapshot.config.title).toBe('Canto nº 3');
    expect(snapshot.files).toEqual([
      { name: 'tripa.pdf', size: 1000, kind: 'pdf', unitCount: 6, sha256: H.a },
      { name: 'cubierta.pdf', size: 1001, kind: 'pdf', unitCount: 2, sha256: H.b },
    ]);
    expect(snapshot.pages).toHaveLength(8);
    expect(snapshot.pages[0]).toEqual({ kind: 'unit', file: 0, indexInAsset: 0, half: 'full' });
    expect(snapshot.pages[7]).toEqual({ kind: 'unit', file: 1, indexInAsset: 1, half: 'full' });
    expect(snapshot.summary).toEqual(SUMMARY);

    const json = JSON.stringify(snapshot);
    for (const leak of ['label', 'folios', 'unitId', 'x-f0', 'p. 1', 'detectedFolio', 'width']) expect(json).not.toContain(leak);
  });

  test('normaliza el título y lo copia a la configuración', () => {
    const loaded = load('x', TWO_FILES);
    const pages = buildPages(loaded.units, config());
    const spaced = snapshotOf(loaded, pages, { config: config({ title: '  Canto \n nº\t3  ' }) });
    expect(spaced.title).toBe('Canto nº 3');
    expect(spaced.config.title).toBe('Canto nº 3');
    const empty = snapshotOf(loaded, pages, { config: config({ title: '   ' }) });
    expect(empty.title).toBe(DEFAULT_CONFIG.title);
  });

  test('redondea y acota el resumen', () => {
    const loaded = load('x', TWO_FILES);
    const snapshot = snapshotOf(loaded, buildPages(loaded.units, config()), {
      derived: { pageCount: 8.4, sheetCount: -1, signatureCount: Number.NaN, verdict: 'ok', errors: 0, warnings: 1 },
    });
    expect(snapshot.summary).toEqual({ pageCount: 8, sheetCount: 0, signatureCount: 0, verdict: 'ok', errors: 0, warnings: 1 });
  });

  test('incluye archivos cargados aunque ya no aporten páginas (siguen siendo parte del trabajo)', () => {
    const loaded = load('x', TWO_FILES);
    const pages = buildPages(loaded.units, config()).filter((page) => !page.unitId?.startsWith('x-f1'));
    const snapshot = snapshotOf(loaded, pages, { pagesEdited: true });
    expect(snapshot.files).toHaveLength(2);
    expect(snapshot.pages).toHaveLength(6);
  });

  test('sin huella de algún archivo lanza CloudError con mensaje para la interfaz', () => {
    const loaded = load('x', TWO_FILES, { skipFingerprint: ['cubierta.pdf'] });
    const run = (): ProjectSnapshot => snapshotOf(loaded, buildPages(loaded.units, config()));
    expect(run).toThrow(CloudError);
    expect(run).toThrow(/reconociendo los archivos/);
  });

  test('una huella con forma imposible cuenta como ausente', () => {
    const loaded = load('x', TWO_FILES);
    loaded.fingerprints.set('x-f0', 'no-es-una-huella');
    expect(() => snapshotOf(loaded, buildPages(loaded.units, config()))).toThrow(CloudError);
  });

  test('una página que apunta a una unidad inexistente lanza', () => {
    const loaded = load('x', TWO_FILES);
    const pages: Page[] = [{ id: 'fantasma:full', origin: 'file', unitId: 'fantasma', half: 'full', detectedFolio: null }];
    expect(() => snapshotOf(loaded, pages)).toThrow(/no corresponden/);
  });

  test('una configuración con valores imposibles lanza', () => {
    const loaded = load('x', TWO_FILES);
    expect(() => snapshotOf(loaded, [], { config: config({ signaturePages: 6 }) })).toThrow(CloudError);
  });

  test('huellas en mayúsculas se guardan en minúsculas', () => {
    const loaded = load('x', [{ name: 'a.pdf', sha: H.a.toUpperCase(), units: 1 }]);
    expect(snapshotOf(loaded, buildPages(loaded.units, config())).files[0]?.sha256).toBe(H.a);
  });

  test('proyecto vacío: instantánea válida sin archivos ni páginas', () => {
    const snapshot = snapshotOf(load('x', []), []);
    expect(snapshot.files).toEqual([]);
    expect(snapshot.pages).toEqual([]);
    expect(roundTrip(snapshot)).toEqual(snapshot);
  });
});

describe('ida y vuelta', () => {
  test('páginas sueltas: JSON → parseSnapshot da lo mismo y la restauración reproduce el orden con ids nuevos', () => {
    const before = load('antes', TWO_FILES);
    const pages = buildPages(before.units, config());
    const snapshot = snapshotOf(before, pages);
    const parsed = roundTrip(snapshot);
    expect(parsed).toEqual(snapshot);
    if (!parsed) throw new Error('inalcanzable');

    const after = load('despues', TWO_FILES);
    const plan = planRestore(parsed, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', 'despues-f1']);
    expect(plan.missing).toEqual([]);
    expect(plan.extraAssetIds).toEqual([]);
    expect(plan.pages).toEqual(buildPages(after.units, config()));
  });

  test('pliegos de lectura con cubierta envolvente: conserva mitades y orden', () => {
    const cfg = config({ inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: true });
    const specs: FileSpec[] = [{ name: 'pliegos.pdf', sha: H.c, units: 4, width: 2000 }];
    const before = load('antes', specs);
    const pages = buildPages(before.units, cfg);
    const snapshot = snapshotOf(before, pages, { config: cfg });
    expect(snapshot.pages.map((page) => (page.kind === 'unit' ? page.half : page.kind))).toEqual([
      'right', 'left', 'right', 'left', 'right', 'left', 'right', 'left',
    ]);

    const after = load('despues', specs);
    const plan = planRestore(roundTrip(snapshot) ?? snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.pages).toEqual(buildPages(after.units, cfg));
    expect(describePages(plan.pages, after.units, after.assets)).toEqual(describePages(pages, before.units, before.assets));
  });

  test('pliegos de lectura de derecha a izquierda', () => {
    const cfg = config({ inputMode: 'spreads', spreadKind: 'reader', readingDirection: 'rtl' });
    const specs: FileSpec[] = [{ name: 'manga.pdf', sha: H.d, units: 3, width: 2000 }];
    const before = load('antes', specs);
    const snapshot = snapshotOf(before, buildPages(before.units, cfg), { config: cfg });
    const after = load('despues', specs);
    expect(planRestore(snapshot, after.assets, after.units, after.fingerprints).pages).toEqual(buildPages(after.units, cfg));
  });

  test('pliegos de imprenta con caras que faltan: las cortesías de hueco quedan en su sitio', () => {
    const cfg = config({ inputMode: 'spreads', spreadKind: 'printer' });
    const specs: FileSpec[] = [{ name: 'impuesto.pdf', sha: H.e, units: 3, width: 2000 }];
    const before = load('antes', specs);
    const pages = buildPages(before.units, cfg);
    expect(pages.some((page) => page.origin === 'auto-blank')).toBe(true);
    const snapshot = snapshotOf(before, pages, { config: cfg });
    expect(snapshot.pages.filter((page) => page.kind === 'auto-blank')).toHaveLength(2);

    const after = load('despues', specs);
    const plan = planRestore(roundTrip(snapshot) ?? snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.pages).toEqual(buildPages(after.units, cfg));
  });

  test('orden editado a mano y blancas manuales: se respetan; cada blanca tiene id propio', () => {
    const before = load('antes', TWO_FILES);
    const base = buildPages(before.units, config());
    const [first, second, ...rest] = base;
    if (!first || !second) throw new Error('inalcanzable');
    const edited = [second, createManualBlank(), first, ...rest.slice(0, 3), createManualBlank(), ...rest.slice(3)];
    const snapshot = snapshotOf(before, edited, { pagesEdited: true });
    expect(snapshot.pagesEdited).toBe(true);
    expect(snapshot.pages.filter((page) => page.kind === 'manual-blank')).toHaveLength(2);

    const after = load('despues', TWO_FILES);
    const plan = planRestore(roundTrip(snapshot) ?? snapshot, after.assets, after.units, after.fingerprints);
    expect(describePages(plan.pages, after.units, after.assets)).toEqual(describePages(edited, before.units, before.assets));
    const blanks = (plan.pages ?? []).filter((page) => page.origin === 'manual-blank');
    expect(blanks).toHaveLength(2);
    for (const blank of blanks) {
      expect(blank.id).toMatch(/^blank:manual:/);
      expect(blank).toMatchObject({ unitId: null, half: 'full', detectedFolio: null });
    }
    expect(new Set((plan.pages ?? []).map((page) => page.id)).size).toBe(plan.pages?.length ?? -1);
  });

  test('archivos cargados en otro orden: las páginas siguen el orden guardado', () => {
    const before = load('antes', TWO_FILES);
    const pages = buildPages(before.units, config());
    const snapshot = snapshotOf(before, pages);
    const after = load('despues', [...TWO_FILES].reverse());
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f1', 'despues-f0']);
    expect(describePages(plan.pages, after.units, after.assets)).toEqual(describePages(pages, before.units, before.assets));
  });

  test('el folio detectado se recalcula igual que en una carga normal', () => {
    const folios: FolioHit[][] = [[{ value: 1, x: 0.95, y: 0.97 }], [{ value: 2, x: 0.05, y: 0.97 }]];
    const specs: FileSpec[] = [{ name: 'foliado.pdf', sha: H.a, units: 2, folios }];
    const before = load('antes', specs);
    const snapshot = snapshotOf(before, buildPages(before.units, config()));
    const after = load('despues', specs);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.pages?.map((page) => page.detectedFolio)).toEqual([1, 2]);
  });

  test('restaurar dos veces da el mismo resultado salvo los ids de blancas manuales', () => {
    const before = load('antes', TWO_FILES);
    const snapshot = snapshotOf(before, [...buildPages(before.units, config()), createManualBlank()], { pagesEdited: true });
    const after = load('despues', TWO_FILES);
    const a = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    const b = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    const strip = (pages: Page[] | null): unknown => pages?.map((page) => (page.origin === 'manual-blank' ? 'blank' : page));
    expect(strip(a.pages)).toEqual(strip(b.pages));
  });
});

describe('planRestore · reconocimiento por huella', () => {
  const snapshot = (() => {
    const loaded = load('antes', TWO_FILES);
    return snapshotOf(loaded, buildPages(loaded.units, config()));
  })();

  test('sin archivos cargados: falta todo y no hay páginas', () => {
    const plan = planRestore(snapshot, [], [], new Map());
    expect(plan).toEqual({ matches: [null, null], missing: snapshot.files, extraAssetIds: [], pages: null });
  });

  test('falta uno: se reconoce el otro, se lista el que falta y no hay páginas', () => {
    const after = load('despues', [TWO_FILES[0] as FileSpec]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', null]);
    expect(plan.missing.map((file) => file.name)).toEqual(['cubierta.pdf']);
    expect(plan.pages).toBeNull();
  });

  test('sobra uno: se avisa como extra sin bloquear la restauración', () => {
    const after = load('despues', [...TWO_FILES, { name: 'otro.pdf', sha: H.c, units: 1 }]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.missing).toEqual([]);
    expect(plan.extraAssetIds).toEqual(['despues-f2']);
    expect(plan.pages).toHaveLength(8);
  });

  test('archivos distintos con el mismo nombre no se reconocen (manda la huella)', () => {
    const after = load('despues', [
      { name: 'tripa.pdf', sha: H.c, units: 6 },
      { name: 'cubierta.pdf', sha: H.d, units: 2 },
    ]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual([null, null]);
    expect(plan.extraAssetIds).toEqual(['despues-f0', 'despues-f1']);
    expect(plan.pages).toBeNull();
  });

  test('archivo renombrado: misma huella, otro nombre → se reconoce', () => {
    const after = load('despues', [
      { name: 'tripa_definitiva.pdf', sha: H.a, units: 6 },
      { name: 'cubierta (1).pdf', sha: H.b, units: 2 },
    ]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', 'despues-f1']);
    expect(plan.pages).toHaveLength(8);
  });

  test('la misma copia cargada dos veces: una se reconoce y la otra sobra', () => {
    const after = load('despues', [...TWO_FILES, TWO_FILES[1] as FileSpec]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', 'despues-f1']);
    expect(plan.extraAssetIds).toEqual(['despues-f2']);
  });

  test('archivos aún sin huella no cuentan ni como reconocidos ni como sobrantes', () => {
    const after = load('despues', [...TWO_FILES, { name: 'pesado.pdf', sha: H.c, units: 1 }], {
      skipFingerprint: ['cubierta.pdf', 'pesado.pdf'],
    });
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', null]);
    expect(plan.extraAssetIds).toEqual([]);
    expect(plan.pages).toBeNull();
  });

  test('huellas con mayúsculas en el mapa se comparan sin distinguirlas', () => {
    const after = load('despues', TWO_FILES);
    for (const [id, sha] of after.fingerprints) after.fingerprints.set(id, sha.toUpperCase());
    expect(planRestore(snapshot, after.assets, after.units, after.fingerprints).missing).toEqual([]);
  });

  test('misma huella pero menos unidades de las guardadas: reconocido, pero sin páginas', () => {
    const after = load('despues', [{ ...(TWO_FILES[0] as FileSpec), units: 4 }, TWO_FILES[1] as FileSpec]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.missing).toEqual([]);
    expect(plan.pages).toBeNull();
  });
});

describe('planRestore · huellas iguales con nombres distintos', () => {
  const specs: FileSpec[] = [
    { name: 'anuncio-a.pdf', sha: H.a, units: 1 },
    { name: 'anuncio-b.pdf', sha: H.a, units: 1 },
    { name: 'tripa.pdf', sha: H.b, units: 2 },
  ];
  const before = load('antes', specs);
  const savedPages = buildPages(before.units, config());
  const snapshot = snapshotOf(before, savedPages);

  test('cargados en otro orden pero con su nombre: cada uno vuelve a su sitio', () => {
    const after = load('despues', [specs[1], specs[2], specs[0]] as FileSpec[]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f2', 'despues-f0', 'despues-f1']);
    expect(describePages(plan.pages, after.units, after.assets)).toEqual(describePages(savedPages, before.units, before.assets));
  });

  test('con nombres nuevos: se emparejan por orden de carga, uno a uno', () => {
    const after = load('despues', [
      { name: 'x.pdf', sha: H.a, units: 1 },
      { name: 'y.pdf', sha: H.a, units: 1 },
      { name: 'tripa.pdf', sha: H.b, units: 2 },
    ]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', 'despues-f1', 'despues-f2']);
    expect(plan.pages).toHaveLength(4);
  });

  test('solo una copia cargada: la otra falta', () => {
    const after = load('despues', [specs[0], specs[2]] as FileSpec[]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual(['despues-f0', null, 'despues-f1']);
    expect(plan.missing.map((file) => file.name)).toEqual(['anuncio-b.pdf']);
    expect(plan.pages).toBeNull();
  });

  test('la copia con el nombre de la segunda no le roba el sitio a la primera si solo hay una', () => {
    const after = load('despues', [specs[1], specs[2]] as FileSpec[]);
    const plan = planRestore(snapshot, after.assets, after.units, after.fingerprints);
    expect(plan.matches).toEqual([null, 'despues-f0', 'despues-f1']);
    expect(plan.missing.map((file) => file.name)).toEqual(['anuncio-a.pdf']);
  });
});

describe('parseSnapshot', () => {
  const valid = (() => {
    const loaded = load('x', TWO_FILES);
    return snapshotOf(loaded, [...buildPages(loaded.units, config()), createManualBlank()], { pagesEdited: true });
  })();

  const edit = (...changes: [Path, unknown][]): unknown => {
    const data: unknown = JSON.parse(JSON.stringify(valid));
    for (const [path, value] of changes) {
      let node = data;
      for (const key of path.slice(0, -1)) node = Reflect.get(node as object, key);
      const last = path[path.length - 1] ?? '';
      if (value === REMOVE) Reflect.deleteProperty(node as object, last);
      else Reflect.set(node as object, last, value);
    }
    return data;
  };

  test('acepta la instantánea válida, como objeto o como texto JSON', () => {
    expect(parseSnapshot(valid)).toEqual(valid);
    expect(parseSnapshot(JSON.stringify(valid))).toEqual(valid);
  });

  test('devuelve una copia limpia (no comparte referencias con la entrada)', () => {
    const parsed = parseSnapshot(valid);
    expect(parsed).not.toBe(valid);
    expect(parsed?.config).not.toBe(valid.config);
    expect(parsed?.files[0]).not.toBe(valid.files[0]);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['número', 42],
    ['lista', []],
    ['texto que no es JSON', '{roto'],
    ['texto JSON que no es objeto', '"hola"'],
  ])('rechaza %s', (_label, value) => {
    expect(parseSnapshot(value)).toBeNull();
  });

  test('rechaza versiones desconocidas o mal tipadas', () => {
    expect(parseSnapshot(edit([['version'], 2]))).toBeNull();
    expect(parseSnapshot(edit([['version'], '1']))).toBeNull();
    expect(parseSnapshot(edit([['version'], REMOVE]))).toBeNull();
  });

  test.each<[string, Path, unknown]>([
    ['título que no es texto', ['title'], 7],
    ['pagesEdited que no es booleano', ['pagesEdited'], 'sí'],
    ['sin configuración', ['config'], REMOVE],
    ['sin archivos', ['files'], REMOVE],
    ['archivos que no son lista', ['files'], {}],
    ['sin páginas', ['pages'], REMOVE],
    ['sin resumen', ['summary'], REMOVE],
    ['archivo sin nombre', ['files', 0, 'name'], ''],
    ['tamaño negativo', ['files', 0, 'size'], -1],
    ['tamaño decimal', ['files', 0, 'size'], 10.5],
    ['tipo de archivo desconocido', ['files', 0, 'kind'], 'tiff'],
    ['archivo sin unidades', ['files', 0, 'unitCount'], 0],
    ['huella corta', ['files', 0, 'sha256'], 'abc'],
    ['huella no hexadecimal', ['files', 0, 'sha256'], 'z'.repeat(64)],
    ['página de un archivo inexistente', ['pages', 0, 'file'], 2],
    ['página con índice de archivo negativo', ['pages', 0, 'file'], -1],
    ['unidad fuera del archivo', ['pages', 0, 'indexInAsset'], 6],
    ['mitad desconocida', ['pages', 0, 'half'], 'top'],
    ['tipo de página desconocido', ['pages', 0], { kind: 'cover' }],
    ['página que no es objeto', ['pages', 0], 'p1'],
    ['la misma página dos veces', ['pages', 1], { kind: 'unit', file: 0, indexInAsset: 0, half: 'full' }],
    ['veredicto desconocido', ['summary', 'verdict'], 'regular'],
    ['contador negativo en el resumen', ['summary', 'pageCount'], -4],
    ['encuadernación desconocida', ['config', 'binding'], 'espiral'],
    ['cuadernillo que no es múltiplo de 4', ['config', 'signaturePages'], 10],
    ['total declarado cero', ['config', 'declaredPageCount'], 0],
    ['sangrado negativo', ['config', 'bleedMm'], -3],
    ['sangrado no numérico', ['config', 'bleedMm'], '3'],
    ['formato fijo sin medidas', ['config', 'trim'], { mode: 'fixed', presetId: null, widthMm: 0, heightMm: 297 }],
    ['formato con modo desconocido', ['config', 'trim'], { mode: 'libre' }],
    ['papel con gramaje negativo', ['config', 'paper', 'interiorGsm'], -90],
    ['dirección de lectura desconocida', ['config', 'readingDirection'], 'ttb'],
  ])('rechaza datos corruptos: %s', (_label, path, value) => {
    expect(parseSnapshot(edit([path, value]))).toBeNull();
  });

  test('rechaza listas desmesuradas', () => {
    expect(parseSnapshot(edit([['pages'], Array.from({ length: 20001 }, () => ({ kind: 'manual-blank' }))]))).toBeNull();
  });

  test('normaliza: huella en minúsculas, título recortado y copiado a la configuración', () => {
    const parsed = parseSnapshot(
      edit([['files', 0, 'sha256'], H.a.toUpperCase()], [['title'], '  Otra   cosa '], [['config', 'title'], 'ignorado']),
    );
    expect(parsed?.files[0]?.sha256).toBe(H.a);
    expect(parsed?.title).toBe('Otra cosa');
    expect(parsed?.config.title).toBe('Otra cosa');
  });

  test('título vacío → título por defecto; título larguísimo → 200 caracteres', () => {
    expect(parseSnapshot(edit([['title'], '   ']))?.title).toBe(DEFAULT_CONFIG.title);
    expect(parseSnapshot(edit([['title'], 'ñ'.repeat(500)]))?.title).toHaveLength(TITLE_MAX_LENGTH);
  });

  test('campos de configuración ausentes toman el valor por defecto (instantáneas de versiones anteriores)', () => {
    const parsed = parseSnapshot(
      edit([['config', 'paper'], REMOVE], [['config', 'blankPlacement'], REMOVE], [['config', 'trim'], REMOVE]),
    );
    expect(parsed?.config.paper).toEqual(DEFAULT_CONFIG.paper);
    expect(parsed?.config.blankPlacement).toBe(DEFAULT_CONFIG.blankPlacement);
    expect(parsed?.config.trim).toEqual(DEFAULT_CONFIG.trim);
  });

  test('descarta campos desconocidos (no se cuelan en la base de datos ni en el store)', () => {
    const parsed = parseSnapshot(
      edit(
        [['extra'], 'x'],
        [['config', 'secreto'], 1],
        [['files', 0, 'contenido'], 'base64…'],
        [['pages', 0, 'miniatura'], 'data:image/png…'],
        [['summary', 'otro'], 3],
      ),
    );
    expect(parsed).not.toBeNull();
    const json = JSON.stringify(parsed);
    for (const leak of ['extra', 'secreto', 'contenido', 'miniatura', 'otro']) expect(json).not.toContain(leak);
  });

  test('acepta formato fijo y total declarado válidos', () => {
    const parsed = parseSnapshot(
      edit([['config', 'trim'], { mode: 'fixed', presetId: 'a4', widthMm: 210, heightMm: 297 }], [['config', 'declaredPageCount'], 24]),
    );
    expect(parsed?.config.trim).toEqual({ mode: 'fixed', presetId: 'a4', widthMm: 210, heightMm: 297 });
    expect(parsed?.config.declaredPageCount).toBe(24);
  });

  test('las blancas (manuales o de hueco) sí pueden repetirse', () => {
    const blanks = [{ kind: 'manual-blank' }, { kind: 'manual-blank' }, { kind: 'auto-blank' }, { kind: 'auto-blank' }];
    expect(parseSnapshot(edit([['pages'], blanks]))?.pages).toHaveLength(4);
  });
});

describe('normalizeTitle y tamaño', () => {
  test('normalizeTitle', () => {
    expect(normalizeTitle('  a  b ')).toBe('a b');
    expect(normalizeTitle('a\u0000b')).toBe('a b');
    expect(normalizeTitle(null)).toBe(DEFAULT_CONFIG.title);
    expect(normalizeTitle('', 'X')).toBe('X');
    const emoji = normalizeTitle('😀'.repeat(250));
    expect(Array.from(emoji)).toHaveLength(TITLE_MAX_LENGTH);
    expect(emoji).toBe('😀'.repeat(TITLE_MAX_LENGTH));
  });

  test('el tamaño se mide como lo mide Postgres (jsonb escrito como texto: espacio tras cada «:» y «,»)', () => {
    const postgres = '{"a": 1, "b": [1, 2], "c": {"d": "ñ"}, "e": [], "f": {}}';
    const value = { a: 1, b: [1, 2], c: { d: 'ñ' }, e: [], f: {}, g: undefined };
    expect(jsonbTextByteSize(value)).toBe(new TextEncoder().encode(postgres).length);
    expect(jsonbTextByteSize('x')).toBe(3);
    const loaded = load('x', [{ name: 'gorda.pdf', sha: H.a, units: 200 }]);
    const snapshot = snapshotOf(loaded, buildPages(loaded.units, config()));
    const compact = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    expect(snapshotByteSize(snapshot)).toBeGreaterThan(compact * 1.1);
  });

  test('una revista de 1000 páginas cabe holgadamente en el tope de 512 KB', () => {
    const loaded = load('x', [{ name: 'gorda.pdf', sha: H.a, units: 1000 }]);
    const snapshot = snapshotOf(loaded, buildPages(loaded.units, config()));
    expect(snapshotByteSize(snapshot)).toBeLessThan(SNAPSHOT_MAX_BYTES / 4);
  });
});
