import * as THREE from 'three';

const LIGHT = new THREE.Vector3(-0.28, 0.36, 0.89).normalize();

const PAGE_VERTEX = `
  attribute float aS;
  varying vec2 vUv;
  varying float vS;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vS = aS;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PAGE_FRAGMENT = `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uPaper;
  uniform float uOpacity;
  uniform vec3 uLight;
  uniform float uShade;
  uniform float uGutter;
  uniform float uGutterWidth;
  uniform float uShadowEdge;
  uniform float uShadowSoft;
  uniform float uShadowAmount;
  uniform vec2 uSafeInset;
  uniform vec3 uGuideTrim;
  uniform vec3 uGuideSafe;
  uniform vec2 uGuides;
  varying vec2 vUv;
  varying float vS;
  varying vec3 vNormal;

  float rectLine(vec2 uv, vec2 inset, float widthPx) {
    vec2 d = min(uv - inset, (1.0 - inset) - uv);
    vec2 fw = max(fwidth(uv), vec2(1e-6));
    vec2 px = abs(d) / fw;
    float halfWidth = widthPx * 0.5;
    float lx = d.y > -fw.y * halfWidth ? 1.0 - smoothstep(halfWidth, halfWidth + 1.0, px.x) : 0.0;
    float ly = d.x > -fw.x * halfWidth ? 1.0 - smoothstep(halfWidth, halfWidth + 1.0, px.y) : 0.0;
    return max(lx, ly);
  }

  void main() {
    vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uPaper;

    float ndl = clamp(dot(normalize(vNormal), uLight) / uLight.z, 0.0, 1.0);
    float shade = mix(1.0 - uShade, 1.0, ndl);

    float gutter = 1.0 - uGutter * exp(-vS / uGutterWidth);

    float castShadow = 1.0 - uShadowAmount * (1.0 - smoothstep(uShadowEdge, uShadowEdge + uShadowSoft, vS));

    vec3 color = base * shade * gutter * castShadow;

    if (uGuides.y > 0.5) {
      float dash = step(0.5, fract((vUv.x + vUv.y) * 60.0));
      color = mix(color, uGuideSafe, rectLine(vUv, uSafeInset, 1.5) * dash * 0.95);
    }
    if (uGuides.x > 0.5) {
      color = mix(color, uGuideTrim, rectLine(vUv, vec2(0.0), 3.0) * 0.9);
    }

    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface PageUniforms {
  [uniform: string]: THREE.IUniform;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uHasMap: THREE.IUniform<number>;
  uPaper: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
  uLight: THREE.IUniform<THREE.Vector3>;
  uShade: THREE.IUniform<number>;
  uGutter: THREE.IUniform<number>;
  uGutterWidth: THREE.IUniform<number>;
  uShadowEdge: THREE.IUniform<number>;
  uShadowSoft: THREE.IUniform<number>;
  uShadowAmount: THREE.IUniform<number>;
  uSafeInset: THREE.IUniform<THREE.Vector2>;
  uGuideTrim: THREE.IUniform<THREE.Color>;
  uGuideSafe: THREE.IUniform<THREE.Color>;
  uGuides: THREE.IUniform<THREE.Vector2>;
}

export interface SharedPageUniforms {
  uPaper: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
  uSafeInset: THREE.IUniform<THREE.Vector2>;
  uGuideTrim: THREE.IUniform<THREE.Color>;
  uGuideSafe: THREE.IUniform<THREE.Color>;
  uGuides: THREE.IUniform<THREE.Vector2>;
}

export function createSharedPageUniforms(): SharedPageUniforms {
  return {
    uPaper: { value: new THREE.Color('#fbfaf7') },
    uOpacity: { value: 1 },
    uSafeInset: { value: new THREE.Vector2(0.05, 0.05) },
    uGuideTrim: { value: new THREE.Color('#0aa5c2') },
    uGuideSafe: { value: new THREE.Color('#2f9e44') },
    uGuides: { value: new THREE.Vector2(0, 0) },
  };
}

export function createPageMaterial(shared: SharedPageUniforms): THREE.ShaderMaterial & { uniforms: PageUniforms } {
  const uniforms: PageUniforms = {
    uMap: { value: null },
    uHasMap: { value: 0 },
    uPaper: shared.uPaper,
    uOpacity: shared.uOpacity,
    uLight: { value: LIGHT },
    uShade: { value: 0.22 },
    uGutter: { value: 0.16 },
    uGutterWidth: { value: 0.045 },
    uShadowEdge: { value: 0 },
    uShadowSoft: { value: 0.1 },
    uShadowAmount: { value: 0 },
    uSafeInset: shared.uSafeInset,
    uGuideTrim: shared.uGuideTrim,
    uGuideSafe: shared.uGuideSafe,
    uGuides: shared.uGuides,
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PAGE_VERTEX,
    fragmentShader: PAGE_FRAGMENT,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  return material as THREE.ShaderMaterial & { uniforms: PageUniforms };
}

const EDGE_VERTEX = `
  attribute float aV;
  attribute float aShade;
  varying float vV;
  varying float vShade;
  void main() {
    vV = aV;
    vShade = aShade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EDGE_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uLeaves;
  uniform float uCoverBottom;
  uniform float uCoverTop;
  varying float vV;
  varying float vShade;
  void main() {
    float lines = vV * uLeaves;
    float fw = max(fwidth(lines), 1e-5);
    float line = 1.0 - smoothstep(0.0, 1.5, abs(fract(lines) - 0.5) / fw);
    float visible = 1.0 - smoothstep(0.35, 1.2, fw);
    float tone = 1.0 - 0.16 * mix(0.45, line, visible);
    float cover = step(vV, uCoverBottom) + step(1.0 - uCoverTop, vV);
    tone = mix(tone, 0.86, clamp(cover, 0.0, 1.0));
    gl_FragColor = vec4(uColor * tone * vShade, uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface EdgeUniforms {
  [uniform: string]: THREE.IUniform;
  uColor: THREE.IUniform<THREE.Color>;
  uOpacity: THREE.IUniform<number>;
  uLeaves: THREE.IUniform<number>;
  uCoverBottom: THREE.IUniform<number>;
  uCoverTop: THREE.IUniform<number>;
}

export function createEdgeMaterial(
  color: THREE.IUniform<THREE.Color>,
  opacity: THREE.IUniform<number>,
): THREE.ShaderMaterial & { uniforms: EdgeUniforms } {
  const uniforms: EdgeUniforms = {
    uColor: color,
    uOpacity: opacity,
    uLeaves: { value: 1 },
    uCoverBottom: { value: 0 },
    uCoverTop: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return material as THREE.ShaderMaterial & { uniforms: EdgeUniforms };
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = Math.min(x, size - 1 - x) / (size * 0.28);
        const dy = Math.min(y, size - 1 - y) / (size * 0.28);
        const fx = Math.min(1, dx);
        const fy = Math.min(1, dy);
        const falloff = fx * fx * (3 - 2 * fx) * (fy * fy * (3 - 2 * fy));
        const offset = (y * size + x) * 4;
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = Math.round(255 * falloff);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
