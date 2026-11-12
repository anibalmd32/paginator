import { DEFAULT_ENGINE_THEME } from '@/lib/viewer';
import type { EngineTheme } from '@/lib/viewer';

let probe: CanvasRenderingContext2D | null = null;

function toRgb(cssColor: string): string | null {
  if (!cssColor) return null;
  if (!probe) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#010203';
  probe.fillStyle = cssColor;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  if (r === 1 && g === 2 && b === 3) return null;
  return `rgb(${r}, ${g}, ${b})`;
}

export function readEngineTheme(element: Element = document.documentElement): EngineTheme {
  const style = getComputedStyle(element);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  const color = (name: string, fallback: string): string => toRgb(token(name)) ?? fallback;
  const shadow = Number.parseFloat(token('--viewer-shadow-opacity'));
  return {
    paper: color('--viewer-paper', DEFAULT_ENGINE_THEME.paper),
    paperEdge: color('--viewer-paper-edge', DEFAULT_ENGINE_THEME.paperEdge),
    shadow: Number.isFinite(shadow) ? shadow : DEFAULT_ENGINE_THEME.shadow,
    guideTrim: color('--guide-trim', DEFAULT_ENGINE_THEME.guideTrim),
    guideBleed: color('--guide-bleed', DEFAULT_ENGINE_THEME.guideBleed),
    guideSafe: color('--guide-safe', DEFAULT_ENGINE_THEME.guideSafe),
  };
}
