import * as THREE from 'three';

import { LEAF_SAMPLES, sampleFraction } from './leafCurve';
import type { CurveSamples } from './leafCurve';
import { createEdgeMaterial, createPageMaterial } from './materials';
import type { EdgeUniforms, PageUniforms, SharedPageUniforms } from './materials';

export type LeafFace = 'recto' | 'verso';

const S = LEAF_SAMPLES;

export class PageSurface {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly uniforms: PageUniforms;
  pageNumber = 0;

  private readonly positions = new Float32Array(S * 2 * 3);
  private readonly normals = new Float32Array(S * 2 * 3);
  private readonly uvs = new Float32Array(S * 2 * 2);
  private readonly geometry = new THREE.BufferGeometry();
  private face: LeafFace = 'recto';
  private configuredKey = '';

  constructor(shared: SharedPageUniforms) {
    const material = createPageMaterial(shared);
    this.uniforms = material.uniforms;

    const arc = new Float32Array(S * 2);
    for (let i = 0; i < S; i += 1) {
      arc[i] = sampleFraction(i);
      arc[S + i] = sampleFraction(i);
    }
    const position = new THREE.BufferAttribute(this.positions, 3);
    const normal = new THREE.BufferAttribute(this.normals, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    normal.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', position);
    this.geometry.setAttribute('normal', normal);
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setAttribute('aS', new THREE.BufferAttribute(arc, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint16Array((S - 1) * 6), 1));

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  configure(face: LeafFace, dir: 1 | -1): void {
    const key = `${face}:${dir}`;
    if (key === this.configuredKey) return;
    this.configuredKey = key;
    this.face = face;

    const spineOnImageLeft = (face === 'recto') !== (dir < 0);
    for (let i = 0; i < S; i += 1) {
      const u = spineOnImageLeft ? sampleFraction(i) : 1 - sampleFraction(i);
      this.uvs[i * 2] = u;
      this.uvs[i * 2 + 1] = 1;
      this.uvs[(S + i) * 2] = u;
      this.uvs[(S + i) * 2 + 1] = 0;
    }
    this.geometry.getAttribute('uv').needsUpdate = true;

    const index = this.geometry.getIndex();
    if (!index) return;
    const array = index.array as Uint16Array;
    const counterClockwise = spineOnImageLeft;
    for (let i = 0; i < S - 1; i += 1) {
      const a = i;
      const b = i + 1;
      const c = S + i + 1;
      const d = S + i;
      const o = i * 6;
      if (counterClockwise) {
        array[o] = a; array[o + 1] = b; array[o + 2] = c;
        array[o + 3] = a; array[o + 4] = c; array[o + 5] = d;
      } else {
        array[o] = a; array[o + 1] = c; array[o + 2] = b;
        array[o + 3] = a; array[o + 4] = d; array[o + 5] = c;
      }
    }
    index.needsUpdate = true;
  }

  update(samples: CurveSamples, dir: 1 | -1, height: number): void {
    const half = height / 2;
    const sign = this.face === 'recto' ? 1 : -1;
    const { positions, normals } = this;
    for (let i = 0; i < S; i += 1) {
      const x = dir * (samples.x[i] ?? 0);
      const z = samples.z[i] ?? 0;
      const nx = sign * dir * -(samples.tz[i] ?? 0);
      const nz = sign * (samples.tx[i] ?? 1);
      const lo = i * 3;
      const hi = (S + i) * 3;
      positions[lo] = x; positions[lo + 1] = -half; positions[lo + 2] = z;
      positions[hi] = x; positions[hi + 1] = half; positions[hi + 2] = z;
      normals[lo] = nx; normals[lo + 1] = 0; normals[lo + 2] = nz;
      normals[hi] = nx; normals[hi + 1] = 0; normals[hi + 2] = nz;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('normal').needsUpdate = true;
  }

  setTexture(texture: THREE.Texture | null): void {
    if (this.uniforms.uMap.value === texture) return;
    this.uniforms.uMap.value = texture;
    this.uniforms.uHasMap.value = texture ? 1 : 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class StackEdges {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly uniforms: EdgeUniforms;

  private readonly positions = new Float32Array((S * 4 + 4) * 3);
  private readonly geometry = new THREE.BufferGeometry();

  constructor(color: THREE.IUniform<THREE.Color>, opacity: THREE.IUniform<number>) {
    const material = createEdgeMaterial(color, opacity);
    this.uniforms = material.uniforms;

    const count = S * 4 + 4;
    const v = new Float32Array(count);
    const shade = new Float32Array(count);
    for (let i = 0; i < S; i += 1) {
      v[i] = 0; v[S + i] = 1; v[S * 2 + i] = 0; v[S * 3 + i] = 1;
      shade[i] = 1; shade[S + i] = 1;
      shade[S * 2 + i] = 0.86; shade[S * 3 + i] = 0.86;
    }
    const fore = S * 4;
    v[fore] = 0; v[fore + 1] = 0; v[fore + 2] = 1; v[fore + 3] = 1;
    shade[fore] = 0.93; shade[fore + 1] = 0.93; shade[fore + 2] = 0.93; shade[fore + 3] = 0.93;

    const indices: number[] = [];
    const strip = (lower: number, upper: number) => {
      for (let i = 0; i < S - 1; i += 1) {
        indices.push(lower + i, lower + i + 1, upper + i + 1, lower + i, upper + i + 1, upper + i);
      }
    };
    strip(0, S);
    strip(S * 2, S * 3);
    indices.push(fore, fore + 1, fore + 3, fore, fore + 3, fore + 2);

    const position = new THREE.BufferAttribute(this.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', position);
    this.geometry.setAttribute('aV', new THREE.BufferAttribute(v, 1));
    this.geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    this.geometry.setIndex(indices);

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(lower: CurveSamples, upper: CurveSamples, dir: 1 | -1, height: number): void {
    const half = height / 2;
    const p = this.positions;
    const write = (offset: number, x: number, y: number, z: number) => {
      p[offset * 3] = x;
      p[offset * 3 + 1] = y;
      p[offset * 3 + 2] = z;
    };
    for (let i = 0; i < S; i += 1) {
      const lx = dir * (lower.x[i] ?? 0);
      const lz = lower.z[i] ?? 0;
      const ux = dir * (upper.x[i] ?? 0);
      const uz = upper.z[i] ?? 0;
      write(i, lx, half, lz);
      write(S + i, ux, half, uz);
      write(S * 2 + i, lx, -half, lz);
      write(S * 3 + i, ux, -half, uz);
    }
    const last = S - 1;
    const fore = S * 4;
    const lx = dir * (lower.x[last] ?? 0);
    const lz = lower.z[last] ?? 0;
    const ux = dir * (upper.x[last] ?? 0);
    const uz = upper.z[last] ?? 0;
    write(fore, lx, -half, lz);
    write(fore + 1, lx, half, lz);
    write(fore + 2, ux, -half, uz);
    write(fore + 3, ux, half, uz);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export function createFacingQuad(
  material: THREE.Material,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  facing: 1 | -1,
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]);
  const uvs = facing > 0 ? new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]) : new Float32Array([1, 1, 0, 1, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, facing, 0, 0, facing, 0, 0, facing, 0, 0, facing]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('aS', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1]), 1));
  geometry.setIndex(facing > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
