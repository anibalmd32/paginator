import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { SourceAsset, SourceUnit } from '@/lib/types';

interface FakeFile {
  name: string;
  ratio: number;
  count?: number;
  content?: string;
}

const released: string[] = [];
let assetSerial = 0;
let gate: Promise<void> = Promise.resolve();

mock.module('@/lib/ingest', () => ({
  naturalCompare: (a: string, b: string) => a.localeCompare(b),
  releaseAsset: (id: string) => released.push(id),
  releaseAll: () => released.push('*'),
  rasterize: () => Promise.reject(new Error('sin raster en pruebas')),
  thumbnailUrl: () => Promise.reject(new Error('sin raster en pruebas')),
  ingestFiles: async (files: File[], options: { startOrder?: number } = {}) => {
    await gate;
    let order = options.startOrder ?? 0;
    const assets: SourceAsset[] = [];
    const units: SourceUnit[] = [];
    for (const file of files as unknown as FakeFile[]) {
      assetSerial += 1;
      const id = `a${String(assetSerial)}`;
      const count = file.count ?? 1;
      assets.push({ id, file: file as unknown as File, name: file.name, kind: count > 1 ? 'pdf' : 'image', sizeBytes: 1, unitCount: count });
      for (let index = 0; index < count; index += 1) {
        units.push({
          id: `${id}/${String(index)}`,
          assetId: id,
          indexInAsset: index,
          order: order++,
          label: count > 1 ? `${file.name} p${String(index + 1)}` : file.name,
          width: Math.round(1000 * file.ratio),
          height: 1000,
          widthMm: null,
          heightMm: null,
          filenameNumber: null,
          folios: [],
        });
      }
    }
    return { assets, units, rejected: [] };
  },
}));

let cloudOn = false;
let hashGate: Promise<void> = Promise.resolve();
const hashFailures = new Set<string>();

function fakeHash(text: string): string {
  let h = 0x811c9dc5;
  let out = '';
  for (let round = 0; out.length < 64; round += 1) {
    for (const char of `${text}#${String(round)}`) h = Math.imul(h ^ char.charCodeAt(0), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

mock.module('@/lib/store/fingerprints', () => ({
  fingerprintsEnabled: () => cloudOn,
  hashFile: async (file: File) => {
    await hashGate;
    const fake = file as unknown as FakeFile;
    if (hashFailures.has(fake.name)) throw new Error('archivo ilegible');
    return fakeHash(fake.content ?? fake.name);
  },
}));

const { useProjectStore } = await import('./project');
const { DEFAULT_CONFIG } = await import('@/lib/imposition');

const files = (...specs: Array<[string, number]>): File[] => specs.map(([name, ratio]) => ({ name, ratio }) as unknown as File);
const store = () => useProjectStore.getState();
const pageIds = () => store().pages.map((page) => page.id);

beforeEach(() => {
  gate = Promise.resolve();
  hashGate = Promise.resolve();
  hashFailures.clear();
  cloudOn = false;
  released.length = 0;
  store().clearFiles();
  useProjectStore.setState({ config: { ...DEFAULT_CONFIG }, step: 2, isDemo: false, cloudProjectId: null, cloudProjectVersion: null, pendingRestore: null });
});

describe('segundo lote con el orden editado a mano', () => {
  test('pliegos de lectura con cubierta envolvente: el lote nuevo no se trata como si trajera la cubierta', async () => {
    store().updateConfig({ inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: true });
    await store().addFiles(files(['cubierta', 2], ['p2-3', 2]));
    store().insertBlank(1);
    expect(store().pagesEdited).toBe(true);

    await store().addFiles(files(['p4-5', 2]));
    const ids = pageIds();
    const added = store().assets.at(-1)?.id ?? '';
    expect(ids.slice(-2)).toEqual([`${added}/0:left`, `${added}/0:right`]);
  });

  test('una página suelta en modo pliegos se clasifica con el conjunto, no sola (no se parte por el lomo)', async () => {
    store().updateConfig({ inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: false });
    await store().addFiles(files(['portada', 0.7], ['p2-3', 2]));
    store().insertBlank(0);

    await store().addFiles(files(['contraportada', 0.7]));
    const added = store().assets.at(-1)?.id ?? '';
    expect(pageIds().slice(-1)).toEqual([`${added}/0:full`]);
  });
});

describe('vaciar mientras se analiza un lote', () => {
  test('lo que termina de analizarse tras vaciar no reaparece y se libera', async () => {
    let open: () => void = () => undefined;
    gate = new Promise((resolve) => {
      open = resolve;
    });
    const loading = store().addFiles(files(['p1', 0.7], ['p2', 0.7]));
    await Promise.resolve();
    expect(store().ingest.busy).toBe(true);

    store().clearFiles();
    open();
    await loading;

    expect(store().assets).toEqual([]);
    expect(store().pages).toEqual([]);
    expect(store().ingest.busy).toBe(false);
    expect(released).toContain('a' + String(assetSerial));
  });
});

describe('quitar el último archivo', () => {
  test('con blancas insertadas a mano no deja un ejemplar de blancas sin archivos', () => {
    return (async () => {
      await store().addFiles(files(['p1', 2]));
      store().updateConfig({ inputMode: 'spreads', spreadKind: 'reader' });
      store().insertBlank(1);
      const [asset] = store().assets;
      if (!asset) throw new Error('sin archivo');
      store().removeAsset(asset.id);
      expect(store().assets).toEqual([]);
      expect(store().pages).toEqual([]);
      expect(store().pagesEdited).toBe(false);
    })();
  });
});

describe('marca de revista de ejemplo', () => {
  test('un lote propio que termina después de cargar el ejemplo quita la marca de ejemplo', async () => {
    let open: () => void = () => undefined;
    gate = new Promise((resolve) => {
      open = resolve;
    });
    const loading = store().addFiles(files(['cliente', 0.7]));
    useProjectStore.setState({ isDemo: true });
    open();
    await loading;
    expect(store().assets.length).toBe(1);
    expect(store().isDemo).toBe(false);
  });
});

const { currentSnapshot, fingerprintProgress } = await import('./cloud');
const { currentWorkEpoch } = await import('./project');

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const PROJECT_ID = '0b7c4b1e-2f0a-4d8e-9c55-6a1f3e2d4c10';

function pageLabels(): string[] {
  const { pages, units } = store();
  const labelOf = new Map(units.map((unit) => [unit.id, unit.label]));
  return pages.map((page) => (page.unitId === null ? page.origin : `${labelOf.get(page.unitId) ?? '?'}:${page.half}`));
}

const MAGAZINE: FakeFile[] = [
  { name: 'cubierta.pdf', ratio: 0.7, count: 2 },
  { name: 'tripa.pdf', ratio: 0.7, count: 4 },
  { name: 'contra.jpg', ratio: 0.7 },
];
const fake = (list: FakeFile[]): File[] => list as unknown as File[];

async function savedMagazine() {
  cloudOn = true;
  await store().addFiles(fake(MAGAZINE));
  await flush();
  store().movePage(6, 1);
  store().insertBlank(3);
  return { snapshot: currentSnapshot(store()), labels: pageLabels() };
}

describe('huellas de los archivos', () => {
  test('sin cuentas no se lee ningún archivo; con cuentas cada archivo cargado recibe su huella', async () => {
    await store().addFiles(files(['p1', 0.7]));
    await flush();
    expect(store().fingerprints.size).toBe(0);

    cloudOn = true;
    await store().addFiles(files(['p2', 0.7], ['p3', 0.7]));
    await flush();
    const [, second, third] = store().assets;
    expect(store().fingerprints.get(second?.id ?? '')).toBe(fakeHash('p2'));
    expect(store().fingerprints.get(third?.id ?? '')).toBe(fakeHash('p3'));
    expect(fingerprintProgress(store())).toEqual({ done: 2, total: 3, failed: 0 });
  });

  test('quitar un archivo (o vaciar) quita su huella; la que termina después de quitarlo no se guarda', async () => {
    cloudOn = true;
    let open: () => void = () => undefined;
    hashGate = new Promise((resolve) => {
      open = resolve;
    });
    await store().addFiles(files(['p1', 0.7], ['p2', 0.7]));
    const [first, second] = store().assets;
    store().removeAsset(first?.id ?? '');
    open();
    await flush();
    expect([...store().fingerprints.keys()]).toEqual([second?.id ?? '']);

    store().clearFiles();
    expect(store().fingerprints.size).toBe(0);
  });

  test('un archivo ilegible queda marcado y no se puede guardar hasta quitarlo', async () => {
    cloudOn = true;
    hashFailures.add('roto.pdf');
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      await store().addFiles(files(['bien.pdf', 0.7], ['roto.pdf', 0.7]));
      await flush();
    } finally {
      console.warn = warn;
    }
    expect(fingerprintProgress(store())).toEqual({ done: 1, total: 2, failed: 1 });
    expect(() => currentSnapshot(store())).toThrow(/reconociendo/);
    const broken = store().assets.find((asset) => asset.name === 'roto.pdf');
    store().removeAsset(broken?.id ?? '');
    expect(store().fingerprintErrors.size).toBe(0);
    expect(currentSnapshot(store()).files.map((file) => file.name)).toEqual(['bien.pdf']);
  });
});

describe('instantánea del proyecto abierto', () => {
  test('falla mientras falta alguna huella y recoge orden, blancas y resumen cuando están todas', async () => {
    cloudOn = true;
    let open: () => void = () => undefined;
    hashGate = new Promise((resolve) => {
      open = resolve;
    });
    await store().addFiles(files(['p1', 0.7], ['p2', 0.7], ['p3', 0.7]));
    expect(() => currentSnapshot(store())).toThrow(/reconociendo/);
    open();
    await flush();

    store().insertBlank(1);
    const snapshot = currentSnapshot(store());
    expect(snapshot.files.map((file) => file.name)).toEqual(['p1', 'p2', 'p3']);
    expect(snapshot.pages.map((page) => page.kind)).toEqual(['unit', 'manual-blank', 'unit', 'unit']);
    expect(snapshot.pagesEdited).toBe(true);
    expect(snapshot.summary.pageCount).toBe(4);
    expect(snapshot.summary.sheetCount).toBe(1);
  });
});

describe('abrir una revista guardada y restaurarla', () => {
  test('aplica título y configuración, recuerda el id y espera en el paso de carga', async () => {
    const { snapshot } = await savedMagazine();
    store().updateConfig({ title: 'Otra cosa', bleedMm: 0 });
    useProjectStore.setState({ step: 4 });

    store().openSavedProject(PROJECT_ID, { ...snapshot, title: 'Canto nº 3', config: { ...snapshot.config, title: 'Canto nº 3' } });
    expect(store().assets).toEqual([]);
    expect(store().step).toBe(2);
    expect(store().config.title).toBe('Canto nº 3');
    expect(store().config.bleedMm).toBe(snapshot.config.bleedMm);
    expect(store().cloudProjectId).toBe(PROJECT_ID);
    expect(store().pendingRestore?.status).toBe('waiting');
    expect(store().pendingRestore?.plan?.missing.map((file) => file.name)).toEqual(['cubierta.pdf', 'tripa.pdf', 'contra.jpg']);
  });

  test('con todos los archivos (en otro orden y en dos tandas) vuelve el orden guardado, blancas incluidas', async () => {
    const { snapshot, labels } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);

    await store().addFiles(fake([{ name: 'contra.jpg', ratio: 0.7 }, { name: 'cubierta.pdf', ratio: 0.7, count: 2 }]));
    await flush();
    const waiting = store().pendingRestore;
    expect(waiting?.status).toBe('waiting');
    expect(waiting?.plan?.missing.map((file) => file.name)).toEqual(['tripa.pdf']);
    expect(waiting?.plan?.extraAssetIds).toEqual([]);

    await store().addFiles(fake([{ name: 'tripa.pdf', ratio: 0.7, count: 4 }]));
    await flush();
    expect(store().pendingRestore?.status).toBe('restored');
    expect(pageLabels()).toEqual(labels);
    expect(store().pagesEdited).toBe(true);
    expect(store().assets.map((asset) => asset.name)).toEqual(['cubierta.pdf', 'tripa.pdf', 'contra.jpg']);
    expect(store().units.map((unit) => unit.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(store().cloudProjectId).toBe(PROJECT_ID);
  });

  test('reconoce por contenido aunque el archivo se llame distinto', async () => {
    const { snapshot, labels } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(
      fake([
        { name: 'cubierta-final.pdf', content: 'cubierta.pdf', ratio: 0.7, count: 2 },
        { name: 'tripa.pdf', ratio: 0.7, count: 4 },
        { name: 'contra (1).jpg', content: 'contra.jpg', ratio: 0.7 },
      ]),
    );
    await flush();
    expect(store().pendingRestore?.status).toBe('restored');
    expect(pageLabels()).toEqual(labels.map((label) => label.replace('cubierta.pdf', 'cubierta-final.pdf').replace('contra.jpg', 'contra (1).jpg')));
  });

  test('un archivo que no es de la revista se señala sin bloquear, y sus páginas quedan al final', async () => {
    const { snapshot, labels } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(files(['encarte.jpg', 0.7]));
    await flush();
    const extra = store().assets[0]?.id ?? '';
    expect(store().pendingRestore?.plan?.extraAssetIds).toEqual([extra]);
    expect(store().pages.length).toBe(1);

    await store().addFiles(fake(MAGAZINE));
    await flush();
    expect(store().pendingRestore?.status).toBe('restored');
    expect(pageLabels()).toEqual([...labels, 'encarte.jpg:full']);
    expect(store().assets.map((asset) => asset.name)).toEqual(['cubierta.pdf', 'tripa.pdf', 'contra.jpg', 'encarte.jpg']);
  });

  test('un orden sin tocar vuelve sin marcarse como editado aunque los archivos se carguen en otro orden', async () => {
    cloudOn = true;
    await store().addFiles(files(['a.jpg', 0.7], ['b.jpg', 0.7], ['c.jpg', 0.7]));
    await flush();
    const snapshot = currentSnapshot(store());
    expect(snapshot.pagesEdited).toBe(false);

    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(files(['c.jpg', 0.7], ['b.jpg', 0.7], ['a.jpg', 0.7]));
    await flush();
    expect(pageLabels()).toEqual(['a.jpg:full', 'b.jpg:full', 'c.jpg:full']);
    expect(store().pagesEdited).toBe(false);
  });

  test('pliegos de lectura: las mitades vuelven con la configuración guardada aunque se cambiara mientras tanto', async () => {
    cloudOn = true;
    store().updateConfig({ inputMode: 'spreads', spreadKind: 'reader', wraparoundCover: false });
    await store().addFiles(files(['portada', 0.7], ['p2-3', 2], ['contra', 0.7]));
    await flush();
    store().swapPages(1, 2);
    const snapshot = currentSnapshot(store());
    const labels = pageLabels();
    expect(labels).toEqual(['portada:full', 'p2-3:right', 'p2-3:left', 'contra:full']);

    store().openSavedProject(PROJECT_ID, snapshot);
    store().updateConfig({ inputMode: 'pages' });
    await store().addFiles(files(['portada', 0.7], ['p2-3', 2], ['contra', 0.7]));
    await flush();
    expect(store().config.inputMode).toBe('spreads');
    expect(pageLabels()).toEqual(labels);
  });

  test('vaciar mientras espera sigue esperando; tras restaurar, vaciar retira el aviso y suelta la revista guardada', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(files(['otro.jpg', 0.7]));
    await flush();
    store().clearFiles();
    expect(store().pendingRestore?.status).toBe('waiting');
    expect(store().pendingRestore?.plan).toBeNull();

    await store().addFiles(fake(MAGAZINE));
    await flush();
    expect(store().pendingRestore?.status).toBe('restored');
    store().clearFiles();
    expect(store().pendingRestore).toBeNull();
    expect(store().cloudProjectId).toBeNull();
    expect(store().cloudProjectVersion).toBeNull();
  });

  test('vaciar mientras espera conserva el vínculo y la versión (vaciar ahí es corregir lo cargado)', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot, '2026-11-12T10:05:00.123456+00:00');
    expect(store().cloudProjectVersion).toBe('2026-11-12T10:05:00.123456+00:00');
    await store().addFiles(files(['otro.jpg', 0.7]));
    await flush();
    store().clearFiles();
    expect(store().cloudProjectId).toBe(PROJECT_ID);
    expect(store().cloudProjectVersion).toBe('2026-11-12T10:05:00.123456+00:00');
  });

  test('tras guardar una revista nueva, cargar la de ejemplo la desvincula', async () => {
    cloudOn = true;
    await store().addFiles(files(['a.jpg', 0.7], ['b.jpg', 0.7]));
    await flush();
    store().setCloudProjectId(PROJECT_ID, 'v1');
    const epoch = currentWorkEpoch();
    store().clearFiles();
    expect(store().cloudProjectId).toBeNull();
    expect(currentWorkEpoch()).not.toBe(epoch);
  });

  test('quitar el último archivo de una revista restaurada la desvincula; quitar uno de varios no', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot, 'v1');
    await store().addFiles(fake(MAGAZINE));
    await flush();
    expect(store().pendingRestore?.status).toBe('restored');
    const epoch = currentWorkEpoch();
    const [first, ...rest] = store().assets;
    store().removeAsset(first?.id ?? '');
    expect(store().cloudProjectId).toBe(PROJECT_ID);
    expect(currentWorkEpoch()).toBe(epoch);
    for (const asset of rest) store().removeAsset(asset.id);
    expect(store().assets).toEqual([]);
    expect(store().cloudProjectId).toBeNull();
    expect(store().cloudProjectVersion).toBeNull();
    expect(store().pendingRestore).toBeNull();
    expect(currentWorkEpoch()).not.toBe(epoch);
  });

  test('quitar todos los archivos mientras espera los suyos no la desvincula', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(files(['otro.jpg', 0.7]));
    await flush();
    store().removeAsset(store().assets[0]?.id ?? '');
    expect(store().cloudProjectId).toBe(PROJECT_ID);
    expect(store().pendingRestore?.status).toBe('waiting');
  });

  test('descartar sin restaurar desvincula la revista guardada; descartar el aviso de restaurada no', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    store().dismissRestore();
    expect(store().pendingRestore).toBeNull();
    expect(store().cloudProjectId).toBeNull();

    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(fake(MAGAZINE));
    await flush();
    store().dismissRestore();
    expect(store().pendingRestore).toBeNull();
    expect(store().cloudProjectId).toBe(PROJECT_ID);
  });

  test('quitar un archivo reconocido lo vuelve a contar como pendiente', async () => {
    const { snapshot } = await savedMagazine();
    store().openSavedProject(PROJECT_ID, snapshot);
    await store().addFiles(fake([{ name: 'cubierta.pdf', ratio: 0.7, count: 2 }, { name: 'contra.jpg', ratio: 0.7 }]));
    await flush();
    expect(store().pendingRestore?.plan?.missing.map((file) => file.name)).toEqual(['tripa.pdf']);
    const cover = store().assets.find((asset) => asset.name === 'cubierta.pdf');
    store().removeAsset(cover?.id ?? '');
    expect(store().pendingRestore?.plan?.missing.map((file) => file.name)).toEqual(['cubierta.pdf', 'tripa.pdf']);
  });
});
