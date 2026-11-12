export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function parseOklch(text: string): Oklch | null {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i.exec(text.trim());
  if (!match) return null;
  const [, lightness = '0', chroma = '0', hue = '0', alpha] = match;
  const scale = (raw: string): number => (raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw));
  return { l: scale(lightness), c: Number.parseFloat(chroma), h: Number.parseFloat(hue), alpha: alpha ? scale(alpha) : 1 };
}

export function oklchToLinear({ l, c, h }: Pick<Oklch, 'l' | 'c' | 'h'>): LinearRgb {
  const hueRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hueRad);
  const b = c * Math.sin(hueRad);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const lCone = lRoot ** 3;
  const mCone = mRoot ** 3;
  const sCone = sRoot ** 3;
  return {
    r: clamp01(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone),
    g: clamp01(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone),
    b: clamp01(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone),
  };
}

export function linearToOklab({ r, g, b }: LinearRgb): { l: number; a: number; b: number } {
  const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

export function relativeLuminance({ r, g, b }: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: LinearRgb, second: LinearRgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type ColorVisionDeficiency = 'protanopia' | 'deuteranopia';

const CVD_MATRICES: Record<ColorVisionDeficiency, readonly [number, number, number, number, number, number, number, number, number]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
};

export function simulateCvd(color: LinearRgb, kind: ColorVisionDeficiency): LinearRgb {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = CVD_MATRICES[kind];
  return {
    r: clamp01(m00 * color.r + m01 * color.g + m02 * color.b),
    g: clamp01(m10 * color.r + m11 * color.g + m12 * color.b),
    b: clamp01(m20 * color.r + m21 * color.g + m22 * color.b),
  };
}

export function deltaEOk(first: LinearRgb, second: LinearRgb): number {
  const a = linearToOklab(first);
  const b = linearToOklab(second);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function toHex({ r, g, b }: LinearRgb): string {
  const encode = (channel: number): string => {
    const gamma = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(clamp01(gamma) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${encode(r)}${encode(g)}${encode(b)}`;
}
