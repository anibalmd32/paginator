export const LEAF_SEGMENTS = 28;
export const LEAF_SAMPLES = LEAF_SEGMENTS + 1;

const MAX_START_ANGLE = 1.25;

export function sineIntegral(x: number): number {
  const x2 = x * x;
  return x * (1 - x2 / 18 + (x2 * x2) / 600 - (x2 * x2 * x2) / 35280 + (x2 * x2 * x2 * x2) / 3265920);
}

const SI_MAX = sineIntegral(MAX_START_ANGLE);

function inverseSineIntegral(y: number): number {
  let x = y;
  for (let i = 0; i < 4; i += 1) {
    const slope = x > 1e-6 ? Math.sin(x) / x : 1;
    x -= (sineIntegral(x) - y) / slope;
  }
  return x;
}

export interface RestShape {
  angle: number;
  lambda: number;
}

export function solveRestShape(climb: number, baseLambda: number, out: RestShape): RestShape {
  const magnitude = Math.abs(climb);
  if (magnitude < 1e-4) {
    out.angle = 0;
    out.lambda = baseLambda;
    return out;
  }
  const ratio = magnitude / baseLambda;
  if (ratio >= SI_MAX) {
    out.angle = Math.sign(climb) * MAX_START_ANGLE;
    out.lambda = magnitude / SI_MAX;
  } else {
    out.angle = Math.sign(climb) * inverseSineIntegral(ratio);
    out.lambda = baseLambda;
  }
  return out;
}

export interface CurveParams {
  ax: number;
  az: number;
  right: RestShape;
  left: RestShape;
  t: number;
  curl: number;
  gutter: number;
  gutterLambda: number;
}

export interface CurveSamples {
  x: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
}

export function createCurveSamples(): CurveSamples {
  return {
    x: new Float32Array(LEAF_SAMPLES),
    z: new Float32Array(LEAF_SAMPLES),
    tx: new Float32Array(LEAF_SAMPLES),
    tz: new Float32Array(LEAF_SAMPLES),
  };
}

export function sampleFraction(index: number): number {
  const u = index / LEAF_SEGMENTS;
  return u * u;
}

const SUBSTEPS = 3;

function tangentAngle(p: CurveParams, s: number, width: number): number {
  const right = p.right.angle * Math.exp(-s / p.right.lambda);
  const left = Math.PI - p.left.angle * Math.exp(-s / p.left.lambda);
  const u = s / width;
  const gutter = p.gutter * Math.exp(-s / p.gutterLambda) * (1 - 2 * p.t);
  return (1 - p.t) * right + p.t * left + gutter - p.curl * Math.sin(Math.PI * p.t) * u * u;
}

export function sampleCurve(p: CurveParams, width: number, out: CurveSamples): void {
  let x = p.ax;
  let z = p.az;
  let s = 0;
  const phi0 = tangentAngle(p, 0, width);
  out.x[0] = x;
  out.z[0] = z;
  out.tx[0] = Math.cos(phi0);
  out.tz[0] = Math.sin(phi0);

  for (let i = 1; i < LEAF_SAMPLES; i += 1) {
    const target = sampleFraction(i) * width;
    const step = (target - s) / SUBSTEPS;
    for (let k = 0; k < SUBSTEPS; k += 1) {
      const phi = tangentAngle(p, s + step * 0.5, width);
      x += Math.cos(phi) * step;
      z += Math.sin(phi) * step;
      s += step;
    }
    const phi = tangentAngle(p, s, width);
    out.x[i] = x;
    out.z[i] = z;
    out.tx[i] = Math.cos(phi);
    out.tz[i] = Math.sin(phi);
  }
}

export function createCurveParams(): CurveParams {
  return {
    ax: 0,
    az: 0,
    right: { angle: 0, lambda: 1 },
    left: { angle: 0, lambda: 1 },
    t: 0,
    curl: 0,
    gutter: 0,
    gutterLambda: 1,
  };
}
