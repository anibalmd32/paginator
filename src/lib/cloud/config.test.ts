import { describe, expect, test } from 'bun:test';

import { normalizeSupabaseUrl, resolveCloudMode, supabaseSettingsFrom } from './config';
import { CloudError, cloudErrorFromApi, toCloudError } from './errors';

describe('resolveCloudMode', () => {
  const url = 'https://abcd.supabase.co';
  const key = 'sb_publishable_xyz';

  test('sin nada: desactivado', () => {
    expect(resolveCloudMode({})).toBe('disabled');
    expect(resolveCloudMode({ supabaseUrl: '', supabaseAnonKey: '', cloudFlag: '' })).toBe('disabled');
  });

  test('URL y clave: Supabase (aunque también pidan el simulado)', () => {
    expect(resolveCloudMode({ supabaseUrl: url, supabaseAnonKey: key })).toBe('supabase');
    expect(resolveCloudMode({ supabaseUrl: url, supabaseAnonKey: key, cloudFlag: 'mock' })).toBe('supabase');
  });

  test('simulado solo si se pide expresamente', () => {
    expect(resolveCloudMode({ cloudFlag: 'mock' })).toBe('mock');
    expect(resolveCloudMode({ cloudFlag: ' MOCK ' })).toBe('mock');
    expect(resolveCloudMode({ cloudFlag: 'true' })).toBe('disabled');
    expect(resolveCloudMode({ cloudFlag: '1' })).toBe('disabled');
  });

  test('una sola variable o una URL inválida no activan Supabase', () => {
    expect(resolveCloudMode({ supabaseUrl: url })).toBe('disabled');
    expect(resolveCloudMode({ supabaseAnonKey: key })).toBe('disabled');
    expect(resolveCloudMode({ supabaseUrl: 'abcd.supabase.co', supabaseAnonKey: key })).toBe('disabled');
    expect(resolveCloudMode({ supabaseUrl: 'ftp://abcd.supabase.co', supabaseAnonKey: key, cloudFlag: 'mock' })).toBe('mock');
  });

  test('normaliza la URL al origen y recorta espacios', () => {
    expect(normalizeSupabaseUrl(' https://abcd.supabase.co/rest/v1/ ')).toBe('https://abcd.supabase.co');
    expect(normalizeSupabaseUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(normalizeSupabaseUrl('https://user:pass@abcd.supabase.co')).toBeNull();
    expect(supabaseSettingsFrom({ supabaseUrl: url, supabaseAnonKey: ` ${key}\n` })).toEqual({ url, anonKey: key });
  });
});

describe('cloudErrorFromApi', () => {
  test.each([
    [{ status: 0, message: 'FetchError: Failed to fetch' }, 'network'],
    [{ status: 0, message: 'TypeError: Load failed' }, 'network'],
    [{ status: 401, code: 'PGRST301', message: 'JWT expired' }, 'not-signed-in'],
    [{ status: 401, code: 'PGRST303', message: 'JWT claim' }, 'not-signed-in'],
    [{ status: 406, code: 'PGRST116', message: 'no rows' }, 'not-found'],
    [{ status: 400, code: '22P02', message: 'invalid input syntax for type uuid' }, 'not-found'],
    [{ status: 400, code: '23514', message: 'violates check constraint' }, 'unknown'],
    [{ status: 403, code: '42501', message: 'permission denied' }, 'unknown'],
    [{ status: 500, code: 'XX000', message: 'boom' }, 'unknown'],
  ] as const)('%o → %s', (failure, code) => {
    const error = cloudErrorFromApi(failure);
    expect(error).toBeInstanceOf(CloudError);
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/JWT|PGRST|constraint|uuid/);
  });

  test('el check de tamaño se explica', () => {
    expect(cloudErrorFromApi({ status: 400, code: '23514' }).message).toMatch(/tamaño/);
  });
});

describe('toCloudError', () => {
  test('deja pasar los CloudError, convierte TypeError en red y lo demás en desconocido', () => {
    const own = new CloudError('not-found');
    expect(toCloudError(own)).toBe(own);
    expect(toCloudError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toCloudError(new Error('x')).code).toBe('unknown');
    expect(toCloudError('cadena').code).toBe('unknown');
  });

  test('mensajes por defecto en español', () => {
    expect(new CloudError('not-configured').message).toMatch(/no están disponibles/);
    expect(new CloudError('not-signed-in').name).toBe('CloudError');
  });
});
