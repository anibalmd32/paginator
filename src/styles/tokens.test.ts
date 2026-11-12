import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { contrastRatio, deltaEOk, oklchToLinear, parseOklch, simulateCvd, type LinearRgb } from './colorMath';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

type Tokens = Map<string, string>;

function declarations(block: string): Tokens {
  const tokens: Tokens = new Map();
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

function block(start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`No encuentro el bloque ${start} en tokens.css`);
  return css.slice(from + start.length, to);
}

const DARK = "[data-theme='dark'] {";
const SYSTEM_DARK = ':root:not([data-theme]) {';

const light = declarations(css.slice(0, css.indexOf(DARK)));
const dark = declarations(block(DARK, '\n}'));
const systemDark = declarations(block(SYSTEM_DARK, '\n  }'));

function color(tokens: Tokens, name: string): LinearRgb {
  const raw = tokens.get(name) ?? light.get(name);
  const parsed = raw ? parseOklch(raw) : null;
  if (!parsed) throw new Error(`El token ${name} no es un OKLCH literal: ${raw ?? '(no existe)'}`);
  return oklchToLinear(parsed);
}

const themes = [
  ['claro', light],
  ['oscuro', dark],
] as const;

describe('estructura de temas', () => {
  test('el oscuro del sistema repite exactamente el oscuro elegido a mano', () => {
    expect([...systemDark.entries()]).toEqual([...dark.entries()]);
  });

  test('el oscuro redefine todos los colores del claro', () => {
    const colorTokens = [...light.entries()].filter(([, value]) => value.includes('oklch(')).map(([name]) => name);
    const sameInBothThemes = new Set(['--guide-trim', '--guide-bleed', '--guide-safe']);
    const missing = colorTokens.filter((name) => !dark.has(name) && !sameInBothThemes.has(name));
    expect(missing).toEqual([]);
  });

  test('la mesa del visor es gris neutro sin tinte en ambos temas', () => {
    for (const [, tokens] of themes) {
      for (const name of ['--stage', '--stage-rule', '--stage-ink', '--stage-ink-2']) {
        expect(parseOklch(tokens.get(name) ?? '')?.c).toBe(0);
      }
    }
  });
});

const PAIRS: readonly (readonly [string, string, number])[] = [
  ['--ink', '--paper', 4.5],
  ['--ink-2', '--paper', 4.5],
  ['--ink-3', '--paper', 4.5],
  ['--ink', '--paper-raised', 4.5],
  ['--ink-2', '--paper-raised', 4.5],
  ['--ink-3', '--paper-raised', 4.5],
  ['--ink', '--paper-sunken', 4.5],
  ['--ink-2', '--paper-sunken', 4.5],
  ['--ink-3', '--paper-sunken', 4.5],
  ['--ink', '--paper-hover', 4.5],
  ['--ink-2', '--paper-hover', 4.5],
  ['--ink', '--paper-active', 4.5],
  ['--ink', '--paper-float', 4.5],
  ['--ink-2', '--paper-float', 4.5],
  ['--petrol-ink', '--paper-float', 4.5],
  ['--petrol-ink', '--paper-hover', 4.5],
  ['--error-ink', '--paper-hover', 4.5],
  ['--warning-ink', '--paper-hover', 4.5],
  ['--success-ink', '--paper-hover', 4.5],
  ['--on-petrol', '--petrol', 4.5],
  ['--on-petrol', '--petrol-hover', 4.5],
  ['--on-petrol', '--petrol-active', 4.5],
  ['--petrol-ink', '--paper', 4.5],
  ['--petrol-ink', '--paper-raised', 4.5],
  ['--petrol-ink', '--paper-sunken', 4.5],
  ['--petrol-ink', '--petrol-soft', 4.5],
  ['--ink', '--petrol-soft', 4.5],
  ['--ink-2', '--petrol-soft', 4.5],
  ['--ink', '--petrol-soft-hover', 4.5],
  ['--on-bar', '--bar', 4.5],
  ['--on-bar-2', '--bar', 4.5],
  ['--on-bar-3', '--bar', 3],
  ['--on-bar', '--bar-tab', 4.5],
  ['--on-bar-2', '--bar-tab', 4.5],
  ['--on-bar', '--bar-tab-hover', 4.5],
  ['--on-bar', '--bar-field', 4.5],
  ['--on-bar-2', '--bar-field', 4.5],
  ['--focus-on-bar', '--bar', 3],
  ['--stage-ink', '--stage', 4.5],
  ['--stage-ink-2', '--stage', 4.5],
  ['--focus', '--stage', 3],
  ['--error-ink', '--paper', 4.5],
  ['--error-ink', '--paper-raised', 4.5],
  ['--error-ink', '--error-soft', 4.5],
  ['--error', '--paper', 3],
  ['--error', '--error-soft', 3],
  ['--ink', '--error-soft', 4.5],
  ['--ink-2', '--error-soft', 4.5],
  ['--on-error-solid', '--error-solid', 4.5],
  ['--on-error-solid', '--error-solid-hover', 4.5],
  ['--warning-ink', '--paper', 4.5],
  ['--warning-ink', '--paper-raised', 4.5],
  ['--warning-ink', '--warning-soft', 4.5],
  ['--warning', '--paper', 3],
  ['--warning', '--warning-soft', 3],
  ['--ink', '--warning-soft', 4.5],
  ['--ink-2', '--warning-soft', 4.5],
  ['--on-warning-solid', '--warning-solid', 4.5],
  ['--success-ink', '--paper', 4.5],
  ['--success-ink', '--paper-raised', 4.5],
  ['--success-ink', '--success-soft', 4.5],
  ['--success', '--paper', 3],
  ['--success', '--success-soft', 3],
  ['--ink', '--success-soft', 4.5],
  ['--ink-2', '--success-soft', 4.5],
  ['--on-success-solid', '--success-solid', 4.5],
  ['--info-ink', '--paper', 4.5],
  ['--info-ink', '--info-soft', 4.5],
  ['--info', '--paper', 3],
  ['--info', '--info-soft', 3],
  ['--ink', '--info-soft', 4.5],
  ['--ink-2', '--info-soft', 4.5],
  ['--focus', '--paper', 3],
  ['--focus', '--paper-raised', 3],
  ['--focus', '--paper-sunken', 3],
  ['--selection-ink', '--selection', 4.5],
  ['--caret', '--paper-raised', 3],
  ['--field-border', '--paper', 3],
  ['--field-border', '--paper-raised', 3],
  ['--field-border', '--paper-sunken', 3],
  ['--on-inverse', '--inverse', 4.5],
  ['--on-inverse-2', '--inverse', 4.5],
  ['--on-stock-1', '--stock-1', 4.5],
  ['--on-stock-2', '--stock-2', 4.5],
  ['--on-stock-3', '--stock-3', 4.5],
  ['--on-stock-4', '--stock-4', 4.5],
  ['--on-stock-5', '--stock-5', 4.5],
  ['--on-stock-6', '--stock-6', 4.5],
  ['--on-stock-7', '--stock-7', 4.5],
  ['--on-stock-8', '--stock-8', 4.5],
  ['--on-stock-cover', '--stock-cover', 4.5],
  ['--on-stock-neutral', '--stock-neutral', 4.5],
  ['--page-ink-muted', '--page-paper', 4.5],
];

describe('contraste AA', () => {
  for (const [themeName, tokens] of themes) {
    test(`tema ${themeName}`, () => {
      const failures: string[] = [];
      for (const [foreground, background, minimum] of PAIRS) {
        const ratio = contrastRatio(color(tokens, foreground), color(tokens, background));
        if (ratio < minimum) failures.push(`${foreground} sobre ${background}: ${ratio.toFixed(2)} (mínimo ${minimum})`);
      }
      expect(failures).toEqual([]);
    });
  }
});

const STOCKS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `--stock-${n}`);
const STATES = ['--error-solid', '--warning-solid', '--success-solid', '--petrol'];
const VISIONS = ['normal', 'protanopia', 'deuteranopia'] as const;

function seenAs(base: LinearRgb, vision: (typeof VISIONS)[number]): LinearRgb {
  return vision === 'normal' ? base : simulateCvd(base, vision);
}

describe('serie de papeles de cuadernillo', () => {
  for (const [themeName, tokens] of themes) {
    for (const vision of VISIONS) {
      test(`tema ${themeName}, visión ${vision}: los ocho papeles se distinguen entre sí`, () => {
        const tooClose: string[] = [];
        for (let i = 0; i < STOCKS.length; i++) {
          for (let j = i + 1; j < STOCKS.length; j++) {
            const first = STOCKS[i] ?? '';
            const second = STOCKS[j] ?? '';
            const distance = deltaEOk(seenAs(color(tokens, first), vision), seenAs(color(tokens, second), vision));
            if (distance < 0.075) tooClose.push(`${first} / ${second}: ΔE ${distance.toFixed(3)}`);
          }
        }
        expect(tooClose).toEqual([]);
      });

      test(`tema ${themeName}, visión ${vision}: ningún papel se confunde con un color de estado`, () => {
        const minimum = vision === 'normal' ? 0.075 : 0.06;
        const tooClose: string[] = [];
        for (const stock of STOCKS) {
          for (const state of STATES) {
            const distance = deltaEOk(seenAs(color(tokens, stock), vision), seenAs(color(tokens, state), vision));
            if (distance < minimum) tooClose.push(`${stock} / ${state}: ΔE ${distance.toFixed(3)}`);
          }
        }
        expect(tooClose).toEqual([]);
      });
    }
  }
});
