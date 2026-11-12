import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONFIG } from '@/lib/imposition';

import { authErrorMessage } from './auth';
import { apiErrorCode, CloudError } from './errors';
import type { ProjectWrite } from './backend';
import type { ProjectSnapshot } from './snapshot';
import { createSupabaseBackend, exchangeErrorMessage, userFromSupabase } from './supabase';

const URL_BASE = 'https://abcd.supabase.co';
const KEY = 'sb_publishable_prueba';
const USER_ID = '7d1f3c2a-0b6e-4c55-9a8e-2f4b1c9d0e11';
const PROJECT_ID = '0b9e7a52-3f6c-4d1e-8a2b-5c4d3e2f1a00';

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: 'Ana Pérez', avatar_url: 'https://lh3.googleusercontent.com/a/x' },
  created_at: '2026-11-01T00:00:00Z',
};

const RECORD = {
  id: PROJECT_ID,
  title: 'Canto nº 3',
  page_count: 8,
  sheet_count: 2,
  verdict: 'ok',
  created_at: '2026-11-12T10:00:00+00:00',
  updated_at: '2026-11-12T10:05:00+00:00',
};

function memoryStorage(withSession: boolean): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const map = new Map<string, string>();
  if (withSession) {
    map.set(
      'sb-abcd-auth-token',
      JSON.stringify({
        access_token: 'token-de-prueba',
        refresh_token: 'refresco',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: USER,
      }),
    );
  }
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

interface Seen {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

function fakeFetch(reply: (request: Seen) => { status: number; body?: unknown }): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const text = await request.text();
    const entry: Seen = { method: request.method, url: new URL(request.url), headers: request.headers, body: text ? (JSON.parse(text) as unknown) : null };
    seen.push(entry);
    const { status, body } = reply(entry);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: impl as typeof fetch, seen };
}

function backend(reply: (request: Seen) => { status: number; body?: unknown }, withSession = true) {
  const fake = fakeFetch(reply);
  return { api: createSupabaseBackend({ url: URL_BASE, anonKey: KEY }, { fetch: fake.fetch, storage: memoryStorage(withSession) }), seen: fake.seen };
}

const SNAPSHOT: ProjectSnapshot = {
  version: 1,
  title: 'Canto nº 3',
  config: { ...DEFAULT_CONFIG, title: 'Canto nº 3' },
  files: [],
  pages: [],
  pagesEdited: false,
  summary: { pageCount: 8, sheetCount: 2, signatureCount: 1, verdict: 'ok', errors: 0, warnings: 0 },
};
const WRITE: ProjectWrite = { title: 'Canto nº 3', snapshot: SNAPSHOT, page_count: 8, sheet_count: 2, verdict: 'ok' };

describe('backend de Supabase (fetch falso)', () => {
  test('sesión sembrada → usuario con nombre y avatar de Google', async () => {
    const { api } = backend(() => ({ status: 500 }));
    expect(await api.getUser()).toEqual({
      id: USER_ID,
      email: 'ana@example.com',
      name: 'Ana Pérez',
      avatarUrl: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  test('listar: tabla projects, columnas sin instantánea, filtro por usuario, más recientes primero, con clave y token', async () => {
    const { api, seen } = backend(() => ({ status: 200, body: [RECORD] }));
    expect(await api.listProjects()).toEqual([RECORD] as never);
    const request = seen.find((item) => item.url.pathname === '/rest/v1/projects');
    expect(request?.method).toBe('GET');
    expect(request?.url.searchParams.get('select')?.replace(/\s/g, '')).toBe('id,title,page_count,sheet_count,verdict,created_at,updated_at');
    expect(request?.url.searchParams.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(request?.url.searchParams.get('order')).toBe('updated_at.desc');
    expect(request?.headers.get('apikey')).toBe(KEY);
    expect(request?.headers.get('authorization')).toBe('Bearer token-de-prueba');
  });

  test('abrir: pide la instantánea y filtra por id y usuario; sin filas → null', async () => {
    const { api, seen } = backend(() => ({ status: 200, body: [] }));
    expect(await api.getProject(PROJECT_ID)).toBeNull();
    const request = seen.at(-1);
    expect(request?.url.searchParams.get('select')).toContain('snapshot');
    expect(request?.url.searchParams.get('id')).toBe(`eq.${PROJECT_ID}`);
    expect(request?.url.searchParams.get('user_id')).toBe(`eq.${USER_ID}`);
  });

  test('crear: POST solo con columnas permitidas (sin user_id ni id) y devuelve la fila', async () => {
    const { api, seen } = backend(() => ({ status: 201, body: RECORD }));
    expect(await api.insertProject(WRITE)).toEqual(RECORD as never);
    const request = seen.at(-1);
    expect(request?.method).toBe('POST');
    expect(Object.keys(request?.body as object).sort()).toEqual(['page_count', 'sheet_count', 'snapshot', 'title', 'verdict']);
    expect(request?.headers.get('prefer')).toContain('return=representation');
  });

  test('actualizar y renombrar: PATCH filtrado; sin filas (ajena o borrada) → null', async () => {
    const { api, seen } = backend(() => ({ status: 200, body: [] }));
    expect(await api.updateProject(PROJECT_ID, WRITE)).toBeNull();
    expect(await api.renameProject(PROJECT_ID, 'Otro')).toBeNull();
    const rename = seen.at(-1);
    expect(rename?.method).toBe('PATCH');
    expect(rename?.body).toEqual({ title: 'Otro' });
    expect(rename?.url.searchParams.get('user_id')).toBe(`eq.${USER_ID}`);
  });

  test('crear con id elegido en el cliente: lo manda (y nada de user_id)', async () => {
    const { api, seen } = backend(() => ({ status: 201, body: RECORD }));
    await api.insertProject(WRITE, PROJECT_ID);
    const body = seen.at(-1)?.body as Record<string, unknown>;
    expect(body['id']).toBe(PROJECT_ID);
    expect(Object.keys(body)).not.toContain('user_id');
  });

  test('actualizar con versión esperada: filtra también por updated_at', async () => {
    const { api, seen } = backend(() => ({ status: 200, body: [] }));
    expect(await api.updateProject(PROJECT_ID, WRITE, RECORD.updated_at)).toBeNull();
    const request = seen.at(-1);
    expect(request?.method).toBe('PATCH');
    expect(request?.url.searchParams.get('updated_at')).toBe(`eq.${RECORD.updated_at}`);
    await api.updateProject(PROJECT_ID, WRITE);
    expect(seen.at(-1)?.url.searchParams.has('updated_at')).toBe(false);
  });

  test('cuota y clave duplicada llegan con su código', async () => {
    const full = backend(() => ({ status: 400, body: { code: 'P0001', message: 'paginator_projects_quota: máximo 200 revistas por cuenta', details: null, hint: null } }));
    await expect(full.api.insertProject(WRITE)).rejects.toMatchObject({ code: 'quota' });
    const other = backend(() => ({ status: 400, body: { code: 'P0001', message: 'otra excepción', details: null, hint: null } }));
    await expect(other.api.insertProject(WRITE)).rejects.toMatchObject({ code: 'unknown' });
    const taken = backend(() => ({ status: 409, body: { code: '23505', message: 'duplicate key value', details: null, hint: null } }));
    const error: unknown = await taken.api.insertProject(WRITE, PROJECT_ID).catch((failure: unknown) => failure);
    expect(error instanceof CloudError && apiErrorCode(error)).toBe('23505');
  });

  test('borrar: DELETE filtrado por id y usuario', async () => {
    const { api, seen } = backend(() => ({ status: 204 }));
    await api.deleteProject(PROJECT_ID);
    expect(seen.at(-1)?.method).toBe('DELETE');
    expect(seen.at(-1)?.url.searchParams.get('id')).toBe(`eq.${PROJECT_ID}`);
  });

  test('errores de PostgREST se traducen a CloudError', async () => {
    const expired = backend(() => ({ status: 401, body: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null } }));
    await expect(expired.api.listProjects()).rejects.toMatchObject({ code: 'not-signed-in' });
    const tooBig = backend(() => ({ status: 400, body: { code: '23514', message: 'violates check constraint', details: null, hint: null } }));
    await expect(tooBig.api.insertProject(WRITE)).rejects.toMatchObject({ code: 'unknown' });
  });

  test('red caída → network', async () => {
    const api = createSupabaseBackend(
      { url: URL_BASE, anonKey: KEY },
      { fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, storage: memoryStorage(true) },
    );
    await expect(api.insertProject(WRITE)).rejects.toMatchObject({ code: 'network' });
  });

  test('sin sesión no sale ninguna petición de datos', async () => {
    const { api, seen } = backend(() => ({ status: 200, body: [] }), false);
    expect(await api.getUser()).toBeNull();
    await expect(api.listProjects()).rejects.toMatchObject({ code: 'not-signed-in' });
    expect(seen.filter((item) => item.url.pathname.startsWith('/rest/'))).toHaveLength(0);
  });
});

describe('mensajes de acceso', () => {
  test('userFromSupabase usa name/picture si no hay full_name/avatar_url', () => {
    const user = userFromSupabase({ ...USER, email: undefined, user_metadata: { name: 'Bea', picture: 'https://x/p.png', email: 'bea@x.com' } } as never);
    expect(user).toEqual({ id: USER_ID, email: 'bea@x.com', name: 'Bea', avatarUrl: 'https://x/p.png' });
  });

  test('exchangeErrorMessage', () => {
    expect(exchangeErrorMessage({ message: 'PKCE code verifier not found in storage', status: 400, code: 'pkce_code_verifier_not_found' })).toMatch(/caducó/);
    expect(exchangeErrorMessage({ message: 'Failed to fetch', status: 0, code: undefined })).toMatch(/conexión/);
    expect(exchangeErrorMessage({ message: '???', status: 500, code: 'unexpected_failure' })).toMatch(/No se pudo/);
  });

  test('authErrorMessage', () => {
    expect(authErrorMessage('access_denied', '')).toMatch(/Cancelaste/);
    expect(authErrorMessage('server_error', 'Database error saving new user')).toMatch(/migración/);
    expect(authErrorMessage('server_error', 'algo')).toMatch(/No se pudo/);
  });
});
