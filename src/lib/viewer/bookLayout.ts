import type { BindingType } from '@/lib/types';

import { solveRestShape } from './leafCurve';
import type { CurveParams } from './leafCurve';
import type { MagazineModel } from './types';

const THICKNESS_SCALE = 2;
const MIN_LEAF_THICKNESS = 0.12;

export interface BookSpec {
  leaves: number;
  width: number;
  height: number;
  dir: 1 | -1;
  binding: BindingType;
  cum: Float32Array;
  total: number;
  coverThickness: number;
  lambda: number;
  gutterAngle: number;
  gutterLambda: number;
}

export function createBookSpec(model: MagazineModel): BookSpec {
  const leaves = Math.max(2, Math.floor(model.pageCount / 2));
  const interior = Math.max(MIN_LEAF_THICKNESS, model.interiorCaliperMm * THICKNESS_SCALE);
  const cover = Math.max(MIN_LEAF_THICKNESS, model.coverCaliperMm * THICKNESS_SCALE);
  const cum = new Float32Array(leaves + 1);
  for (let k = 0; k < leaves; k += 1) {
    const isCover = model.coverLeavesPerSide === 1 && (k === 0 || k === leaves - 1);
    cum[k + 1] = (cum[k] ?? 0) + (isCover ? cover : interior);
  }
  const width = model.trim.widthMm;
  const perfect = model.binding === 'perfect-bound';
  return {
    leaves,
    width,
    height: model.trim.heightMm,
    dir: model.readingDirection === 'rtl' ? -1 : 1,
    binding: model.binding,
    cum,
    total: cum[leaves] ?? 0,
    coverThickness: model.coverLeavesPerSide === 1 ? cover : 0,
    lambda: width * (perfect ? 0.05 : 0.1),
    gutterAngle: perfect ? 0.34 : 0.1,
    gutterLambda: width * (perfect ? 0.07 : 0.09),
  };
}

export function depthOfLeaf(spec: BookSpec, k: number): number {
  return spec.cum[Math.min(spec.leaves, Math.max(0, k))] ?? 0;
}

export function surfaceParams(
  spec: BookSpec,
  c: number,
  t: number,
  f: number,
  curl: number,
  gutterScale: number,
  out: CurveParams,
): CurveParams {
  const T = spec.total;
  if (spec.binding === 'saddle-stitch') {
    out.ax = 0;
    out.az = T / 2;
  } else {
    const angle = Math.PI * f;
    const offset = T / 2 - c;
    out.ax = -offset * Math.sin(angle);
    out.az = (T / 2) * Math.abs(Math.cos(angle)) + offset * Math.cos(angle);
  }
  solveRestShape(T - c - out.az, spec.lambda, out.right);
  solveRestShape(c - out.az, spec.lambda, out.left);
  out.t = t;
  out.curl = curl;
  out.gutter = spec.gutterAngle * Math.min(1, Math.max(0, gutterScale));
  out.gutterLambda = spec.gutterLambda;
  return out;
}

export function spinePanel(spec: BookSpec, f: number, out: Float32Array): Float32Array {
  const T = spec.total;
  const angle = Math.PI * f;
  const centerZ = (T / 2) * Math.abs(Math.cos(angle));
  out[0] = -(T / 2) * Math.sin(angle);
  out[1] = centerZ + (T / 2) * Math.cos(angle);
  out[2] = (T / 2) * Math.sin(angle);
  out[3] = centerZ - (T / 2) * Math.cos(angle);
  return out;
}
