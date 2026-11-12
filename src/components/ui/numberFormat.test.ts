import { describe, expect, test } from 'bun:test';

import { clampNumber, formatDecimal, parseDecimal, roundTo, stepDecimals, stepNumber } from './numberFormat';

describe('parseDecimal', () => {
  test('admite coma y punto decimal', () => {
    expect(parseDecimal('3,5')).toBe(3.5);
    expect(parseDecimal('3.5')).toBe(3.5);
    expect(parseDecimal(' 210 ')).toBe(210);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('-2,25')).toBe(-2.25);
  });

  test('lo incompleto o ajeno no es un número', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal(',')).toBeNull();
    expect(parseDecimal('3 mm')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });

  test('un decimal a medio escribir ya vale por su parte entera', () => {
    expect(parseDecimal('3,')).toBe(3);
  });
});

describe('formatDecimal', () => {
  test('usa coma y no rellena con ceros', () => {
    expect(formatDecimal(3)).toBe('3');
    expect(formatDecimal(0.9)).toBe('0,9');
    expect(formatDecimal(0.1 + 0.2)).toBe('0,3');
    expect(formatDecimal(3.14159, 2)).toBe('3,14');
    expect(formatDecimal(-0)).toBe('0');
  });
});

describe('pasos', () => {
  test('decimales del paso', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(1e-3)).toBe(3);
  });

  test('avanza sobre la rejilla del paso', () => {
    expect(stepNumber(3, 1, 0.5)).toBe(3.5);
    expect(stepNumber(3.2, 1, 0.5)).toBe(3.5);
    expect(stepNumber(3.2, -1, 0.5)).toBe(3);
    expect(stepNumber(0.1, 2, 0.1)).toBe(0.3);
    expect(stepNumber(16, 1, 4)).toBe(20);
    expect(stepNumber(18, 1, 4)).toBe(20);
    expect(stepNumber(18, -1, 4)).toBe(16);
  });

  test('respeta los límites y ancla la rejilla en el mínimo', () => {
    expect(stepNumber(98, 1, 4, { min: 4, max: 100 })).toBe(100);
    expect(stepNumber(4, -1, 4, { min: 4 })).toBe(4);
    expect(stepNumber(5, 1, 2, { min: 1 })).toBe(7);
    expect(clampNumber(12, { max: 10 })).toBe(10);
    expect(clampNumber(-1, { min: 0 })).toBe(0);
  });

  test('redondeo sin flecos binarios', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.5, 0)).toBe(3);
  });
});
