import { describe, expect, test } from 'bun:test';

import { displayName, firstName, formatBytes, formatUpdatedAt, initials, projectHref } from './accountModel';

const user = (name: string | null, email: string | null = null) => ({ id: 'u', name, email, avatarUrl: null });

describe('nombre e iniciales', () => {
  test('usa el nombre de Google, si no la parte local del correo, si no «Tu cuenta»', () => {
    expect(displayName(user('Ana Ruiz Pardo'))).toBe('Ana Ruiz Pardo');
    expect(displayName(user('  ', 'maquetacion@estudio.es'))).toBe('maquetacion');
    expect(displayName(null)).toBe('Tu cuenta');
    expect(firstName(user('Ana Ruiz Pardo'))).toBe('Ana');
  });

  test('iniciales: primera y última palabra, acentos incluidos, sin signos', () => {
    expect(initials(user('Ana Ruiz Pardo'))).toBe('AP');
    expect(initials(user('Íñigo'))).toBe('Í');
    expect(initials(user('(estudio) Óscar'))).toBe('EÓ');
    expect(initials(user(null, null))).toBe('TC');
  });
});

describe('fechas de modificación', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  test('hoy y ayer con hora; este año con día y mes; antes con año', () => {
    expect(formatUpdatedAt(new Date(2026, 10, 12, 9, 5).toISOString(), now)).toBe('Hoy, 09:05');
    expect(formatUpdatedAt(new Date(2026, 10, 11, 23, 59).toISOString(), now)).toBe('Ayer, 23:59');
    expect(formatUpdatedAt(new Date(2026, 2, 3, 8, 0).toISOString(), now)).toMatch(/^3 mar, 08:00$/);
    expect(formatUpdatedAt(new Date(2025, 10, 3).toISOString(), now)).toMatch(/^3 nov 2025$/);
    expect(formatUpdatedAt('no es una fecha', now)).toBe('—');
  });
});

describe('tamaños y enlaces', () => {
  test('tamaños con coma decimal y una cifra por debajo de 10', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(3.25 * 1024 * 1024)).toBe('3,3 MB');
  });

  test('el enlace de una revista guardada abre la app con su id', () => {
    expect(projectHref('0b7c4b1e-2f0a-4d8e-9c55-6a1f3e2d4c10')).toBe('/app?proyecto=0b7c4b1e-2f0a-4d8e-9c55-6a1f3e2d4c10');
  });
});
