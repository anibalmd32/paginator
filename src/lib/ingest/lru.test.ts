import { describe, expect, test } from 'bun:test';

import { ByteLru } from './lru';

function makeCache(budget: number): { cache: ByteLru<string, string>; evicted: string[] } {
  const evicted: string[] = [];
  const cache = new ByteLru<string, string>(budget, (value) => evicted.push(value));
  return { cache, evicted };
}

describe('ByteLru', () => {
  test('expulsa lo menos usado cuando se pasa del presupuesto', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A', 40);
    cache.set('b', 'B', 40);
    cache.set('c', 'C', 40);
    expect(evicted).toEqual(['A']);
    expect(cache.has('a')).toBe(false);
    expect(cache.bytes).toBe(80);
    expect(cache.size).toBe(2);
  });

  test('leer una entrada la protege de la expulsión', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A', 40);
    cache.set('b', 'B', 40);
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C', 40);
    expect(evicted).toEqual(['B']);
    expect(cache.values()).toEqual(['A', 'C']);
  });

  test('has no altera el orden de uso', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A', 40);
    cache.set('b', 'B', 40);
    expect(cache.has('a')).toBe(true);
    cache.set('c', 'C', 40);
    expect(evicted).toEqual(['A']);
  });

  test('rechaza sin tocar nada lo que no cabe por sí solo', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A', 60);
    expect(cache.set('enorme', 'X', 101)).toBe(false);
    expect(evicted).toEqual([]);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('enorme')).toBe(false);
  });

  test('reemplazar una clave expulsa el valor anterior', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A1', 30);
    cache.set('a', 'A2', 50);
    expect(evicted).toEqual(['A1']);
    expect(cache.bytes).toBe(50);
    expect(cache.get('a')).toBe('A2');
  });

  test('delete, deleteWhere y clear avisan de cada expulsión', () => {
    const { cache, evicted } = makeCache(1000);
    cache.set('u1@0', 'a', 10);
    cache.set('u1@1', 'b', 10);
    cache.set('u2@0', 'c', 10);
    expect(cache.delete('nada')).toBe(false);
    expect(cache.deleteWhere((_, key) => key.startsWith('u1@'))).toBe(2);
    expect(evicted).toEqual(['a', 'b']);
    expect(cache.bytes).toBe(10);
    cache.clear();
    expect(evicted).toEqual(['a', 'b', 'c']);
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });

  test('bajar el presupuesto expulsa lo que sobra', () => {
    const { cache, evicted } = makeCache(100);
    cache.set('a', 'A', 40);
    cache.set('b', 'B', 40);
    cache.budget = 50;
    expect(evicted).toEqual(['A']);
    expect(cache.budget).toBe(50);
  });
});
