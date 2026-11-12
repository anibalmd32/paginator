import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG } from '@/lib/imposition';

import type * as Cloud from './index';
import { MOCK_KEYS, MOCK_USER } from './mock';
import type { ProjectSnapshot } from './snapshot';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const ORIGIN = 'http://127.0.0.1:4321';
const local = new MemoryStorage();
const session = new MemoryStorage();
const navigations: string[] = [];
const ENV_KEYS = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'PUBLIC_PAGINATOR_CLOUD'] as const;
const savedEnv = new Map<string, string | undefined>();

let cloud: typeof Cloud;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function snapshot(title = 'Canto nº 3', pageCount = 8): ProjectSnapshot {
  return {
    version: 1,
    title,
    config: { ...DEFAULT_CONFIG, title },
    files: [{ name: 'canto.pdf', size: 1234, kind: 'pdf', unitCount: 2, sha256: 'a'.repeat(64) }],
    pages: [
      { kind: 'unit', file: 0, indexInAsset: 0, half: 'full' },
      { kind: 'manual-blank' },
      { kind: 'unit', file: 0, indexInAsset: 1, half: 'full' },
    ],
    pagesEdited: true,
    summary: { pageCount, sheetCount: pageCount / 4, signatureCount: 1, verdict: 'warnings', errors: 0, warnings: 1 },
  };
}

async function rejection(promise: Promise<unknown>): Promise<Cloud.CloudError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof cloud.CloudError) return error;
    throw error;
  }
  throw new Error('se esperaba un rechazo');
}

async function signIn(next = '/app'): Promise<void> {
  await cloud.signInWithGoogle({ next });
  const url = navigations.at(-1);
  if (!url) throw new Error('no hubo navegación');
  const result = await cloud.completeSignIn(new URL(url));
  expect(result.error).toBeNull();
}

beforeAll(async () => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  process.env['PUBLIC_SUPABASE_URL'] = '';
  process.env['PUBLIC_SUPABASE_ANON_KEY'] = '';
  process.env['PUBLIC_PAGINATOR_CLOUD'] = 'mock';
  Reflect.set(globalThis, 'window', {
    localStorage: local,
    location: { origin: ORIGIN, pathname: '/app', search: '?ejemplo=1', hash: '', assign: (url: string) => navigations.push(url) },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  Reflect.set(globalThis, 'sessionStorage', session);
  cloud = await import('./index');
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'sessionStorage');
  for (const [key, value] of savedEnv) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
});

beforeEach(() => {
  local.setItem(MOCK_KEYS.latency, '0');
  local.removeItem(MOCK_KEYS.fail);
  local.removeItem(MOCK_KEYS.auth);
});

describe('sin configurar', () => {
  test('modo desactivado: nada lanza fuera de lo previsto y todo explica que no está disponible', async () => {
    process.env['PUBLIC_PAGINATOR_CLOUD'] = '';
    try {
      expect(cloud.cloudMode()).toBe('disabled');
      expect((await rejection(cloud.listProjects())).code).toBe('not-configured');
      expect((await rejection(cloud.signInWithGoogle({ next: '/app' }))).code).toBe('not-configured');
      const result = await cloud.completeSignIn(new URL(`${ORIGIN}/auth/callback?next=%2Fapp&code=x`));
      expect(result).toEqual({ next: '/app', error: 'Las cuentas no están disponibles en esta instalación de Paginator.' });
      expect(navigations).toHaveLength(0);
    } finally {
      process.env['PUBLIC_PAGINATOR_CLOUD'] = 'mock';
    }
  });
});

describe('sesión (simulada)', () => {
  test('modo simulado y estado inicial sin sesión', async () => {
    expect(cloud.cloudMode()).toBe('mock');
    cloud.useAuth.getState().init();
    cloud.useAuth.getState().init();
    await sleep(5);
    expect(cloud.useAuth.getState()).toMatchObject({ status: 'signed-out', user: null, error: null });
  });

  test('sin sesión, las revistas piden entrar', async () => {
    expect((await rejection(cloud.listProjects())).code).toBe('not-signed-in');
    expect((await rejection(cloud.saveProject({ snapshot: snapshot() }))).code).toBe('not-signed-in');
  });

  test('callback sin código ni sesión: error legible y next por defecto', async () => {
    expect(await cloud.completeSignIn(new URL(`${ORIGIN}/auth/callback`))).toEqual({
      next: '/revistas',
      error: 'No llegó la autorización de Google. Vuelve a intentarlo.',
    });
  });

  test('cancelar en Google vuelve con error y sin sesión', async () => {
    local.setItem(MOCK_KEYS.auth, 'deny');
    await cloud.signInWithGoogle({ next: '/app' });
    const result = await cloud.completeSignIn(new URL(navigations.at(-1) ?? ''));
    expect(result.next).toBe('/app');
    expect(result.error).toMatch(/Cancelaste/);
    expect(cloud.useAuth.getState().status).toBe('signed-out');
  });

  test('un código que no es el de este navegador no abre sesión', async () => {
    const result = await cloud.completeSignIn(new URL(`${ORIGIN}/auth/callback?next=%2Fapp&code=robado`));
    expect(result.error).toMatch(/caducó/);
    expect(cloud.useAuth.getState().status).toBe('signed-out');
  });

  test('next externo en el enlace del callback se ignora', async () => {
    const result = await cloud.completeSignIn(new URL(`${ORIGIN}/auth/callback?next=https%3A%2F%2Fotro.sitio`));
    expect(result.next).toBe('/revistas');
  });

  test('ida y vuelta: redirige al callback con next saneado y un código; el callback abre la sesión', async () => {
    await cloud.signInWithGoogle({ next: '/app?proyecto=abc' });
    const url = new URL(navigations.at(-1) ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}/auth/callback`);
    expect(url.searchParams.get('next')).toBe('/app?proyecto=abc');
    expect(url.searchParams.get('code')).toBeTruthy();

    expect(await cloud.completeSignIn(url)).toEqual({ next: '/app?proyecto=abc', error: null });
    expect(cloud.useAuth.getState()).toMatchObject({ status: 'signed-in', user: MOCK_USER, error: null });
    expect(await cloud.completeSignIn(url)).toEqual({ next: '/app?proyecto=abc', error: null });
  });

  test('signInWithGoogle: next externo → /revistas; sin next → la página actual', async () => {
    await cloud.signInWithGoogle({ next: '//otro.sitio/robar' });
    expect(new URL(navigations.at(-1) ?? '').searchParams.get('next')).toBe('/revistas');
    await cloud.signInWithGoogle();
    expect(new URL(navigations.at(-1) ?? '').searchParams.get('next')).toBe('/app?ejemplo=1');
  });
});

describe('Mis revistas (simulado)', () => {
  beforeAll(async () => {
    await signIn();
  });

  test('guardar, listar, abrir', async () => {
    const row = await cloud.saveProject({ snapshot: snapshot() });
    expect(cloud.isProjectId(row.id)).toBe(true);
    expect(row).toMatchObject({ title: 'Canto nº 3', pageCount: 8, sheetCount: 2, verdict: 'warnings' });
    expect(row.createdAt).toBe(row.updatedAt);

    expect((await cloud.listProjects()).map((item) => item.id)).toContain(row.id);
    const opened = await cloud.getProject(row.id);
    expect(opened.row).toEqual(row);
    expect(opened.snapshot).toEqual(snapshot());
  });

  test('actualizar la misma revista y orden por última modificación', async () => {
    const first = await cloud.saveProject({ snapshot: snapshot('Primera') });
    await sleep(5);
    const second = await cloud.saveProject({ snapshot: snapshot('Segunda') });
    await sleep(5);
    const updated = await cloud.saveProject({ id: first.id, snapshot: snapshot('Primera, corregida', 12) });
    expect(updated).toMatchObject({ id: first.id, title: 'Primera, corregida', pageCount: 12, createdAt: first.createdAt });
    expect(updated.updatedAt > first.updatedAt).toBe(true);

    const ids = (await cloud.listProjects()).map((item) => item.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
  });

  test('renombrar toca la fila y la instantánea que se abre lleva el título nuevo', async () => {
    const row = await cloud.saveProject({ snapshot: snapshot('Viejo') });
    const renamed = await cloud.renameProject(row.id, '  Nuevo   título ');
    expect(renamed.title).toBe('Nuevo título');
    const opened = await cloud.getProject(row.id);
    expect(opened.snapshot.title).toBe('Nuevo título');
    expect(opened.snapshot.config.title).toBe('Nuevo título');
    expect((await rejection(cloud.renameProject(row.id, '   '))).message).toMatch(/título/);
  });

  test('borrar; borrar otra vez no es un error', async () => {
    const row = await cloud.saveProject({ snapshot: snapshot('Para borrar') });
    await cloud.deleteProject(row.id);
    expect((await rejection(cloud.getProject(row.id))).code).toBe('not-found');
    await cloud.deleteProject(row.id);
    await cloud.deleteProject('no-es-un-id');
  });

  test('ids inexistentes o mal formados → not-found', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await rejection(cloud.getProject('../etc'))).code).toBe('not-found');
    expect((await rejection(cloud.getProject(ghost))).code).toBe('not-found');
    expect((await rejection(cloud.saveProject({ id: ghost, snapshot: snapshot() }))).code).toBe('not-found');
    expect((await rejection(cloud.saveProject({ id: 'x', snapshot: snapshot() }))).code).toBe('not-found');
    expect((await rejection(cloud.renameProject(ghost, 'x'))).code).toBe('not-found');
  });

  test('una instantánea no válida no se guarda', async () => {
    const bad = { ...snapshot(), pages: [{ kind: 'unit', file: 9, indexInAsset: 0, half: 'full' }] } as ProjectSnapshot;
    expect((await rejection(cloud.saveProject({ snapshot: bad }))).code).toBe('unknown');
  });

  test('una revista dañada en la base de datos no se abre y lo dice', async () => {
    const row = await cloud.saveProject({ snapshot: snapshot('Dañada') });
    const stored = JSON.parse(local.getItem(MOCK_KEYS.projects) ?? '[]') as { id: string; snapshot: unknown }[];
    for (const item of stored) if (item.id === row.id) item.snapshot = { version: 99 };
    local.setItem(MOCK_KEYS.projects, JSON.stringify(stored));
    const error = await rejection(cloud.getProject(row.id));
    expect(error.code).toBe('unknown');
    expect(error.message).toMatch(/dañada/);
  });

  test('las revistas de otra cuenta no se ven ni se tocan', async () => {
    const foreignId = '11111111-1111-4111-8111-111111111111';
    const stored = JSON.parse(local.getItem(MOCK_KEYS.projects) ?? '[]') as unknown[];
    stored.push({
      id: foreignId,
      user_id: '22222222-2222-4222-8222-222222222222',
      title: 'Ajena',
      snapshot: snapshot('Ajena'),
      page_count: 8,
      sheet_count: 2,
      verdict: 'ok',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    local.setItem(MOCK_KEYS.projects, JSON.stringify(stored));
    expect((await cloud.listProjects()).map((item) => item.id)).not.toContain(foreignId);
    expect((await rejection(cloud.getProject(foreignId))).code).toBe('not-found');
    expect((await rejection(cloud.renameProject(foreignId, 'Mía'))).code).toBe('not-found');
    await cloud.deleteProject(foreignId);
    expect(local.getItem(MOCK_KEYS.projects)).toContain(foreignId);
  });

  test('fallos forzados para QA (red, desconocido)', async () => {
    local.setItem(MOCK_KEYS.fail, 'network');
    const network = await rejection(cloud.listProjects());
    expect(network.code).toBe('network');
    expect(network.message).toMatch(/conexión/);
    local.setItem(MOCK_KEYS.fail, 'unknown');
    expect((await rejection(cloud.saveProject({ snapshot: snapshot() }))).code).toBe('unknown');
  });

  test('guardado pendiente a través del login: leer no consume; caduca sin perderse; dañado se distingue', () => {
    expect(cloud.readPendingSave()).toEqual({ kind: 'none' });
    expect(cloud.takePendingSave()).toBeNull();
    expect(cloud.stashPendingSave({ snapshot: snapshot('Pendiente'), projectId: null })).toBe(true);
    expect(cloud.hasPendingSave()).toBe(true);
    const first = cloud.readPendingSave();
    if (first.kind !== 'ready') throw new Error('se esperaba listo');
    expect(first.pending).toMatchObject({ snapshot: snapshot('Pendiente'), projectId: null });
    expect(cloud.isProjectId(first.pending.newId)).toBe(true);
    expect(cloud.readPendingSave()).toEqual(first);
    expect(cloud.takePendingSave()).toEqual(first.pending);
    expect(cloud.takePendingSave()).toBeNull();

    const t = 1_000_000;
    const projectId = '0b9e7a52-3f6c-4d1e-8a2b-5c4d3e2f1a00';
    cloud.stashPendingSave({ snapshot: snapshot(), projectId }, t);
    const late = cloud.readPendingSave(t + 2 * 60 * 60 * 1000);
    expect(late.kind).toBe('expired');
    expect(late.kind === 'expired' && late.pending.projectId).toBe(projectId);
    expect(cloud.takePendingSave(t + 2 * 60 * 60 * 1000)).toBeNull();

    session.setItem('paginator:cloud:pending-save:v1', JSON.stringify({ savedAt: t, projectId: null, snapshot: { version: 1 } }));
    expect(cloud.readPendingSave(t + 1)).toEqual({ kind: 'damaged' });
    session.setItem('paginator:cloud:pending-save:v1', '{roto');
    expect(cloud.readPendingSave(t + 1)).toEqual({ kind: 'damaged' });
    cloud.stashPendingSave({ snapshot: snapshot(), projectId: null });
    cloud.clearPendingSave();
    expect(cloud.hasPendingSave()).toBe(false);
  });

  test('guardado pendiente: si el almacenamiento de la pestaña falla, se dice', () => {
    const original = session.setItem.bind(session);
    session.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(cloud.stashPendingSave({ snapshot: snapshot(), projectId: null })).toBe(false);
      expect(cloud.hasPendingSave()).toBe(false);
    } finally {
      session.setItem = original;
    }
  });

  test('subir con un id elegido aquí: repetir la subida actualiza la misma revista en lugar de duplicarla', async () => {
    const id = cloud.newProjectId();
    const before = (await cloud.listProjects()).length;
    const first = await cloud.saveProject({ id, snapshot: snapshot('Tras el login'), createIfMissing: true });
    expect(first.id).toBe(id);
    const again = await cloud.saveProject({ id, snapshot: snapshot('Tras el login', 12), createIfMissing: true });
    expect(again).toMatchObject({ id, pageCount: 12 });
    expect((await cloud.listProjects()).length).toBe(before + 1);
    expect((await rejection(cloud.saveProject({ id: cloud.newProjectId(), snapshot: snapshot() }))).code).toBe('not-found');
  });

  test('dos pestañas con la misma revista: la que guarda sobre una versión vieja recibe «conflict» y no escribe', async () => {
    const opened = await cloud.saveProject({ snapshot: snapshot('Compartida') });
    await sleep(5);
    const fromA = await cloud.saveProject({ id: opened.id, snapshot: snapshot('Compartida', 12), expectedUpdatedAt: opened.updatedAt });
    expect(fromA.updatedAt > opened.updatedAt).toBe(true);
    const conflict = await rejection(cloud.saveProject({ id: opened.id, snapshot: snapshot('Compartida', 16), expectedUpdatedAt: opened.updatedAt }));
    expect(conflict.code).toBe('conflict');
    expect(conflict.message).toMatch(/otra ventana/);
    expect((await cloud.getProject(opened.id)).row.pageCount).toBe(12);
    await sleep(5);
    expect((await cloud.saveProject({ id: opened.id, snapshot: snapshot('Compartida', 16) })).pageCount).toBe(16);
    await cloud.deleteProject(opened.id);
    expect((await rejection(cloud.saveProject({ id: opened.id, snapshot: snapshot(), expectedUpdatedAt: fromA.updatedAt }))).code).toBe('not-found');
  });

  test('máximo de revistas por cuenta → quota con mensaje para la interfaz', async () => {
    const count = (await cloud.listProjects()).length;
    local.setItem(MOCK_KEYS.quota, String(count));
    try {
      const error = await rejection(cloud.saveProject({ snapshot: snapshot('Una más') }));
      expect(error.code).toBe('quota');
      expect(error.message).toMatch(/máximo/);
      const [first] = await cloud.listProjects();
      if (first) expect((await cloud.saveProject({ id: first.id, snapshot: snapshot('Existente') })).id).toBe(first.id);
    } finally {
      local.removeItem(MOCK_KEYS.quota);
    }
  });

  test('una instantánea que solo cabe en JSON compacto se rechaza antes de enviarla', async () => {
    const files = Array.from({ length: 2600 }, (_, index) => ({ name: `p${String(index).padStart(4, '0')}.jpg`, size: 1, kind: 'image' as const, unitCount: 1, sha256: 'a'.repeat(64) }));
    const big: ProjectSnapshot = { ...snapshot('Grande'), files, pages: files.map((_, file) => ({ kind: 'unit', file, indexInAsset: 0, half: 'full' })) };
    const compact = new TextEncoder().encode(JSON.stringify(big)).length;
    expect(compact).toBeLessThan(cloud.SNAPSHOT_MAX_BYTES);
    const error = await rejection(cloud.saveProject({ snapshot: big }));
    expect(error.message).toMatch(/demasiadas/);
  });

  test('cerrar sesión', async () => {
    await cloud.signOut();
    expect(cloud.useAuth.getState()).toMatchObject({ status: 'signed-out', user: null });
    expect((await rejection(cloud.listProjects())).code).toBe('not-signed-in');
  });
});
