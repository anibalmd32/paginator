import type { CloudBackend, CloudUser, ProjectRecord, ProjectWrite, StoredProject } from './backend';
import { CloudError, cloudErrorFromApi, PROJECTS_PER_USER_MAX, QUOTA_ERROR_MARK } from './errors';

export const MOCK_USER: CloudUser = {
  id: '7d1f3c2a-0b6e-4c55-9a8e-2f4b1c9d0e11',
  email: 'prueba@paginator.local',
  name: 'Cuenta de prueba',
  avatarUrl: null,
};

export const MOCK_KEYS = {
  session: 'paginator:mock:session',
  verifier: 'paginator:mock:verifier',
  projects: 'paginator:mock:projects',
  fail: 'paginator:mock:fail',
  auth: 'paginator:mock:auth',
  latency: 'paginator:mock:latency',
  quota: 'paginator:mock:quota',
} as const;

const DEFAULT_LATENCY_MS = 300;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MockEnv {
  storage: KeyValueStorage;
  navigate(url: string): void;
  latencyMs?: number | null;
  now?: () => Date;
  randomId?: () => string;
  onExternalChange?: (listener: () => void) => () => void;
}

interface MockProject extends StoredProject {
  user_id: string;
}

function randomUuid(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const hex = (n: number): string => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameUser(a: CloudUser | null, b: CloudUser | null): boolean {
  return a?.id === b?.id;
}

export function browserMockEnv(): MockEnv {
  return {
    storage: window.localStorage,
    navigate: (url) => window.location.assign(url),
    latencyMs: null,
    onExternalChange: (listener) => {
      const handler = (event: StorageEvent): void => {
        if (event.key === null || event.key === MOCK_KEYS.session) listener();
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

export function createMockBackend(env: MockEnv): CloudBackend {
  const now = env.now ?? (() => new Date());
  const newId = env.randomId ?? randomUuid;
  const listeners = new Set<(user: CloudUser | null) => void>();
  let lastUser: CloudUser | null = readSession();

  function readSession(): CloudUser | null {
    try {
      const raw = env.storage.getItem(MOCK_KEYS.session);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return isRecord(parsed) && parsed['id'] === MOCK_USER.id ? MOCK_USER : null;
    } catch {
      return null;
    }
  }

  function emit(): void {
    const user = readSession();
    if (sameUser(user, lastUser)) return;
    lastUser = user;
    for (const listener of listeners) listener(user);
  }

  env.onExternalChange?.(emit);

  function latency(): number {
    if (typeof env.latencyMs === 'number') return env.latencyMs;
    const raw = env.storage.getItem(MOCK_KEYS.latency);
    const stored = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
    return Number.isFinite(stored) && stored >= 0 ? Math.min(stored, 30000) : DEFAULT_LATENCY_MS;
  }

  async function wait(): Promise<void> {
    const ms = latency();
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function request(): Promise<string> {
    await wait();
    const fail = env.storage.getItem(MOCK_KEYS.fail);
    if (fail === 'network' || fail === 'unknown' || fail === 'not-signed-in') throw new CloudError(fail);
    const user = readSession();
    if (!user) throw new CloudError('not-signed-in');
    return user.id;
  }

  function readAll(): MockProject[] {
    try {
      const raw = env.storage.getItem(MOCK_KEYS.projects);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is MockProject => isRecord(item) && typeof item['id'] === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeAll(projects: MockProject[]): void {
    try {
      env.storage.setItem(MOCK_KEYS.projects, JSON.stringify(projects));
    } catch (error) {
      throw new CloudError('unknown', 'El almacenamiento local del navegador está lleno (modo simulado).', { cause: error });
    }
  }

  function quota(): number {
    const raw = env.storage.getItem(MOCK_KEYS.quota);
    const stored = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
    return Number.isInteger(stored) && stored >= 0 ? stored : PROJECTS_PER_USER_MAX;
  }

  function toRecord(project: MockProject): ProjectRecord {
    const { id, title, page_count, sheet_count, verdict, created_at, updated_at } = project;
    return { id, title, page_count, sheet_count, verdict, created_at, updated_at };
  }

  function stamp(): string {
    return now().toISOString();
  }

  return {
    mode: 'mock',

    getUser: () => Promise.resolve(readSession()),

    onUserChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    signInWithGoogle: (redirectTo) => {
      const url = new URL(redirectTo);
      if (env.storage.getItem(MOCK_KEYS.auth) === 'deny') {
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set('error_description', 'The user denied access (simulado)');
      } else {
        const code = newId();
        env.storage.setItem(MOCK_KEYS.verifier, code);
        url.searchParams.set('code', code);
      }
      env.navigate(url.href);
      return Promise.resolve();
    },

    exchangeCode: (code) => {
      const expected = env.storage.getItem(MOCK_KEYS.verifier);
      env.storage.removeItem(MOCK_KEYS.verifier);
      if (!expected || expected !== code) {
        if (readSession()) return Promise.resolve(null);
        return Promise.resolve('El enlace de acceso caducó o se abrió en otro navegador. Vuelve a intentarlo desde aquí.');
      }
      env.storage.setItem(MOCK_KEYS.session, JSON.stringify({ id: MOCK_USER.id, createdAt: stamp() }));
      emit();
      return Promise.resolve(null);
    },

    signOut: () => {
      env.storage.removeItem(MOCK_KEYS.session);
      emit();
      return Promise.resolve();
    },

    listProjects: async () => {
      const userId = await request();
      return readAll()
        .filter((project) => project.user_id === userId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(toRecord);
    },

    getProject: async (id) => {
      const userId = await request();
      const project = readAll().find((item) => item.id === id && item.user_id === userId);
      return project ? { ...toRecord(project), snapshot: project.snapshot } : null;
    },

    insertProject: async (write: ProjectWrite, id?: string) => {
      const userId = await request();
      const all = readAll();
      if (id !== undefined && all.some((item) => item.id === id)) {
        throw cloudErrorFromApi({ status: 409, code: '23505', message: 'duplicate key value violates unique constraint "projects_pkey"' });
      }
      if (all.filter((item) => item.user_id === userId).length >= quota()) {
        throw cloudErrorFromApi({ status: 400, code: 'P0001', message: `${QUOTA_ERROR_MARK}: máximo ${String(quota())}` });
      }
      const at = stamp();
      const project: MockProject = { id: id ?? newId(), user_id: userId, ...write, created_at: at, updated_at: at };
      writeAll([...all, project]);
      return toRecord(project);
    },

    updateProject: async (id, write, expectedUpdatedAt) => {
      const userId = await request();
      const all = readAll();
      const index = all.findIndex((item) => item.id === id && item.user_id === userId);
      const current = all[index];
      if (!current) return null;
      if (expectedUpdatedAt !== undefined && current.updated_at !== expectedUpdatedAt) return null;
      const updated: MockProject = { ...current, ...write, updated_at: stamp() };
      all[index] = updated;
      writeAll(all);
      return toRecord(updated);
    },

    renameProject: async (id, title) => {
      const userId = await request();
      const all = readAll();
      const index = all.findIndex((item) => item.id === id && item.user_id === userId);
      const current = all[index];
      if (!current) return null;
      const updated: MockProject = { ...current, title, updated_at: stamp() };
      all[index] = updated;
      writeAll(all);
      return toRecord(updated);
    },

    deleteProject: async (id) => {
      const userId = await request();
      writeAll(readAll().filter((item) => !(item.id === id && item.user_id === userId)));
    },
  };
}
