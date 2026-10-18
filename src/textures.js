import * as THREE from 'three';

// ws: tile size in meters, depth: physical relief in meters (drives both normals and POM).
export const MATERIALS = {
  stone: { name: 'Stone', ws: 2.0, depth: 0.08 },
  cobble: { name: 'Cobblestone', ws: 1.5, depth: 0.07 },
  planks: { name: 'Planks', ws: 2.0, depth: 0.028 },
  timber: { name: 'Timber', ws: 1.0, depth: 0.016 },
  steel: { name: 'PaintedSteel', ws: 1.0, depth: 0.004 },
  concrete: { name: 'Concrete', ws: 2.0, depth: 0.02 },
  asphalt: { name: 'Asphalt', ws: 2.0, depth: 0.012 },
  rope: { name: 'Rope', ws: 0.25, depth: 0.02 },
  cable: { name: 'SteelCable', ws: 0.25, depth: 0.012 },
};
export const TILE = Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.ws]));
export const RES = 1024;

const NOISE = /* glsl */ `
uniform float uRes;
uniform float uSeed;
uniform int uMode;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 s = vec2(uSeed * 17.0, uSeed * 31.0);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1, 0), per) + s);
  float c = hash12(mod(i + vec2(0, 1), per) + s), d = hash12(mod(i + vec2(1, 1), per) + s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 uv, vec2 f, int oct) {
  float s = 0., a = .5, n = 0.;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(uv * f, f); n += a; f *= 2.; a *= .5; }
  return s / n;
}
vec3 voronoi(vec2 uv, vec2 f, float jit) {
  vec2 p = uv * f, i = floor(p), fr = fract(p);
  float d1 = 9., d2 = 9.; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), c = mod(i + g, f);
    vec2 r = g + 0.5 + (hash22(c + uSeed) - 0.5) * jit - fr;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = c; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), hash12(id + 7.7 + uSeed));
}
`;

const SURF = {
  stone: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  const float WS = 2.0, rows = 5.0;
  float row = floor(uv.y * rows), fy = fract(uv.y * rows);
  float k = 2.0 + floor(hash12(vec2(row, 3.7) + uSeed) * 2.99);
  float bx = uv.x * k + hash12(vec2(row, 9.1) + uSeed);
  float fx = fract(bx);
  vec2 id = vec2(mod(floor(bx), k), row);
  float r1 = hash12(id + 1.3 + uSeed), r2 = hash12(id + 5.9 + uSeed), r3 = hash12(id * 1.7 + 2.1);
  float ex = min(fx, 1.0 - fx) * WS / k, ey = min(fy, 1.0 - fy) * WS / rows;
  float chip = fbm(uv, vec2(28.0), 4);
  float e = min(ex, ey) - (chip - 0.5) * 0.035;
  float edge = smoothstep(0.008, 0.05, e);
  float surface = fbm(uv + r1, vec2(12.0), 6);
  float tilt = dot(vec2(fx, fy) - 0.5, (vec2(r2, r3) - 0.5) * 0.25);
  float face = 0.70 + 0.10 * r1 + 0.24 * (surface - 0.5) + tilt + smoothstep(0.0, 0.12, e) * 0.06;
  float mortarH = 0.12 + 0.1 * fbm(uv, vec2(96.0), 3);
  h = clamp(mix(mortarH, face, edge), 0.0, 1.0);
  vec3 sc = mix(vec3(0.69, 0.64, 0.56), vec3(0.57, 0.54, 0.50), r2);
  sc = mix(sc, vec3(0.75, 0.68, 0.57), smoothstep(0.6, 1.0, r3) * 0.8);
  float grain = fbm(uv, vec2(64.0), 4);
  sc *= 0.86 + 0.28 * grain;
  sc *= mix(1.0, 0.88, smoothstep(0.5, 0.8, fbm(uv, vec2(5.0), 5)));
  sc = mix(sc, vec3(0.52, 0.55, 0.40), smoothstep(0.66, 0.8, fbm(uv + 3.3, vec2(9.0), 5)) * 0.2);
  vec3 mc = vec3(0.60, 0.58, 0.54) * (0.85 + 0.2 * fbm(uv, vec2(160.0), 2));
  col = mix(mc * 0.88, sc, edge) * (0.9 + 0.1 * smoothstep(0.0, 0.03, e));
  rough = mix(0.97, 0.82 + 0.08 * grain, edge);
  metal = 0.0;
}`,
  cobble: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  vec3 v = voronoi(uv, vec2(10.0), 0.85);
  float r = v.z;
  float s = smoothstep(0.02, 0.34, v.y - v.x);
  float dome = sqrt(s);
  float n = fbm(uv, vec2(40.0), 4), fine = fbm(uv, vec2(160.0), 2);
  h = clamp(0.06 + 0.03 * fine + dome * (0.72 + 0.18 * r) + 0.07 * (n - 0.5) * s, 0.0, 1.0);
  vec3 sc = mix(vec3(0.50, 0.49, 0.47), vec3(0.61, 0.56, 0.49), r);
  sc = mix(sc, vec3(0.40, 0.40, 0.42), smoothstep(0.7, 1.0, hash12(vec2(r * 91.0, 3.0))));
  sc *= (0.82 + 0.3 * n) * (0.9 + 0.15 * dome);
  vec3 gc = vec3(0.36, 0.33, 0.29) * (0.8 + 0.3 * fine);
  col = mix(gc, sc, smoothstep(0.0, 0.25, s));
  rough = mix(0.98, 0.74 - 0.14 * dome, s);
  metal = 0.0;
}`,
  planks: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  const float WS = 2.0, np = 10.0, pw = WS / np;
  float pr = floor(uv.y * np), py = fract(uv.y * np);
  float r = hash12(vec2(pr, 1.3) + uSeed), r2 = hash12(vec2(pr, 8.1) + uSeed);
  float px = fract(uv.x + r);
  float e = min(min(py, 1.0 - py) * pw, min(px, 1.0 - px) * WS);
  float edge = smoothstep(0.004, 0.016, e);
  float warp = fbm(uv + r, vec2(2.0, 24.0), 4);
  float rings = fract(py * (3.0 + r * 3.0) + warp * 2.5 + r * 7.0);
  float late = smoothstep(0.55, 0.95, rings);
  float fibers = fbm(uv + r2, vec2(4.0, 400.0), 3);
  float wear = fbm(uv, vec2(5.0), 5);
  float cup = (1.0 - pow(abs(py * 2.0 - 1.0), 3.0)) * 0.05;
  float nail = 1.0 - smoothstep(0.004, 0.007, length(vec2(min(px, 1.0 - px) * WS - 0.06, (abs(py - 0.5) - 0.25) * pw)));
  h = 0.06 + edge * (0.82 + cup - 0.07 * late * wear - 0.05 * fibers + 0.04 * r) - nail * 0.15;
  vec3 wc = mix(vec3(0.55, 0.40, 0.26), vec3(0.42, 0.29, 0.18), r2) * (0.85 + 0.25 * fibers);
  wc = mix(wc, wc * 0.72, late);
  wc = mix(wc, vec3(0.56, 0.53, 0.48) * (0.85 + 0.2 * fibers), smoothstep(0.45, 0.8, wear) * 0.35);
  col = mix(mix(vec3(0.12, 0.10, 0.08), wc, edge), vec3(0.22, 0.2, 0.19), nail);
  rough = mix(0.95, 0.78 + 0.1 * late, edge);
  metal = nail * 0.6;
}`,
  timber: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  float rings = fract(uv.y * 14.0 + fbm(uv, vec2(2.0, 12.0), 5) * 3.0);
  float late = smoothstep(0.6, 0.95, rings);
  float fibers = fbm(uv, vec2(3.0, 240.0), 3);
  float crack = (1.0 - smoothstep(0.0, 0.012, abs(fbm(uv + 0.37, vec2(3.0, 18.0), 4) - 0.5)))
              * smoothstep(0.55, 0.7, fbm(uv, vec2(4.0, 2.0), 3));
  float big = fbm(uv, vec2(3.0), 4);
  h = 0.82 - 0.05 * late - 0.04 * fibers + 0.06 * (big - 0.5) - crack * 0.6;
  vec3 c = mix(vec3(0.47, 0.34, 0.22), vec3(0.36, 0.25, 0.16), late) * (0.85 + 0.25 * fibers) * (0.9 + 0.2 * big);
  c = mix(c, vec3(0.5, 0.47, 0.42), smoothstep(0.55, 0.85, fbm(uv, vec2(6.0), 4)) * 0.2);
  col = mix(c, vec3(0.1, 0.08, 0.06), crack);
  rough = 0.82 + 0.1 * late;
  metal = 0.0;
}`,
  steel: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  float peel = fbm(uv, vec2(48.0), 4), big = fbm(uv, vec2(3.0), 5);
  float chipN = fbm(uv + 0.5, vec2(8.0), 6);
  float chips = smoothstep(0.67, 0.69, chipN);
  float rim = smoothstep(0.65, 0.67, chipN) - chips;
  float streak = fbm(uv, vec2(40.0, 3.0), 4), pit = fbm(uv, vec2(128.0), 3);
  h = 0.9 + 0.03 * peel + 0.03 * rim - chips * (0.35 + 0.2 * pit);
  vec3 paint = vec3(0.88) * (0.94 + 0.08 * big) * mix(1.0, 0.86, smoothstep(0.5, 0.8, streak));
  col = mix(paint, mix(vec3(0.30, 0.22, 0.17), vec3(0.42, 0.28, 0.18), pit), chips);
  rough = mix(0.42 + 0.12 * big + 0.1 * streak, 0.85, chips);
  metal = 0.0;
}`,
  concrete: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  float n = fbm(uv, vec2(5.0), 6), m = fbm(uv, vec2(32.0), 4);
  vec3 v = voronoi(uv, vec2(120.0), 1.0);
  float pore = (1.0 - smoothstep(0.05, 0.22, v.x)) * step(0.82, v.z);
  float fy = fract(uv.y * 4.0);
  float seam = 1.0 - smoothstep(0.0015, 0.005, min(fy, 1.0 - fy) * 0.5);
  vec2 tp = (fract(uv * vec2(2.0, 4.0) + vec2(0.0, 0.5)) - 0.5) * vec2(1.0, 0.5);
  float tie = 1.0 - smoothstep(0.011, 0.015, length(tp));
  h = 0.72 + 0.1 * (m - 0.5) + 0.05 * (n - 0.5) - pore * 0.3 + seam * 0.06 - tie * 0.5;
  vec3 base = vec3(0.70, 0.69, 0.66) * (0.86 + 0.22 * n) * (0.95 + 0.08 * m);
  base *= mix(1.0, 0.82, smoothstep(0.55, 0.85, fbm(uv, vec2(28.0, 2.0), 4)));
  col = base * (1.0 - 0.5 * pore) * (1.0 - 0.45 * tie);
  rough = 0.9 - 0.05 * m;
  metal = 0.0;
}`,
  asphalt: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  vec3 v = voronoi(uv, vec2(150.0), 1.0);
  float agg = smoothstep(0.02, 0.3, v.y - v.x) * step(0.3, v.z);
  float fine = fbm(uv, vec2(256.0), 2), n = fbm(uv, vec2(6.0), 5);
  vec3 cr = voronoi(uv, vec2(3.0), 1.0);
  float crack = (1.0 - smoothstep(0.0, 0.01, cr.y - cr.x)) * smoothstep(0.6, 0.7, fbm(uv + 0.3, vec2(4.0), 4));
  h = 0.4 + 0.4 * agg * (0.5 + 0.5 * v.z) + 0.15 * fine - crack * 0.35;
  vec3 c = mix(vec3(0.15, 0.15, 0.155), vec3(0.30, 0.29, 0.28), agg * v.z) * (0.85 + 0.3 * n);
  col = mix(c, vec3(0.07), crack);
  rough = 0.88 - 0.1 * agg;
  metal = 0.0;
}`,
  rope: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  float prof = sqrt(max(0.0, sin(3.14159 * fract(uv.x * 6.0 + uv.y * 3.0))));
  float fib = fract(uv.x * 60.0 + uv.y * 30.0 + fbm(uv, vec2(8.0), 3) * 2.0);
  float fibH = smoothstep(0.0, 0.5, fib) * (1.0 - smoothstep(0.5, 1.0, fib));
  float n = fbm(uv, vec2(16.0), 4);
  h = 0.1 + 0.8 * prof + 0.06 * fibH * prof + 0.04 * (n - 0.5);
  vec3 c = vec3(0.64, 0.53, 0.36) * (0.8 + 0.25 * n) * (0.85 + 0.15 * fibH);
  col = mix(c * 0.45, c, smoothstep(0.0, 0.5, prof));
  rough = 0.95;
  metal = 0.0;
}`,
  cable: /* glsl */ `
void surf(vec2 uv, out float h, out vec3 col, out float rough, out float metal) {
  float prof = sqrt(max(0.0, sin(3.14159 * fract(uv.x * 4.0 + uv.y * 8.0))));
  float n = fbm(uv, vec2(16.0), 4);
  h = 0.15 + 0.8 * prof + 0.05 * (n - 0.5);
  vec3 c = vec3(0.62, 0.63, 0.64) * (0.85 + 0.2 * n);
  col = mix(c * 0.4, c, prof);
  rough = 0.36 + 0.15 * n;
  metal = 1.0;
}`,
};

const BAKE = NOISE + /* glsl */ `
void main() {
  float h, r, m; vec3 c;
  surf(gl_FragCoord.xy / uRes, h, c, r, m);
  gl_FragColor = uMode == 0 ? vec4(h, r, m, 1.0) : vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Normal (glTF/OpenGL convention, height in alpha) and ORM from the float height buffer.
const POST = /* glsl */ `
uniform sampler2D tH;
uniform float uRes, uDepth, uWS;
uniform int uMode;
vec4 S(ivec2 p) { int r = int(uRes); return texelFetch(tH, (p % r + r) % r, 0); }
float H(ivec2 p) { return S(p).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = S(p);
  float px = uWS / uRes;
  if (uMode == 0) {
    float tl = H(p + ivec2(-1, 1)), t = H(p + ivec2(0, 1)), tr = H(p + ivec2(1, 1));
    float l = H(p + ivec2(-1, 0)), r = H(p + ivec2(1, 0));
    float bl = H(p + ivec2(-1, -1)), b = H(p + ivec2(0, -1)), br = H(p + ivec2(1, -1));
    float dx = ((tr + 2. * r + br) - (tl + 2. * l + bl)) / (8. * px) * uDepth;
    float dy = ((tl + 2. * t + tr) - (bl + 2. * b + br)) / (8. * px) * uDepth;
    gl_FragColor = vec4(normalize(vec3(-dx, dy, 1.0)) * 0.5 + 0.5, c.r);
  } else {
    float occ = 0.0;
    for (int i = 0; i < 24; i++) {
      float a = float(i) * 2.39996, rr = 1.5 + float(i) * 1.1;
      float hs = H(p + ivec2(round(vec2(cos(a), sin(a)) * rr)));
      occ += clamp((hs - c.r) * uDepth / (rr * px) * 0.6, 0.0, 1.0);
    }
    gl_FragColor = vec4(clamp(1.0 - occ / 24.0 * 1.4, 0.25, 1.0), c.g, c.b, 1.0);
  }
}`;

const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';

export async function bakeTextures(renderer, onProgress) {
  const N = RES;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  const rtF = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const rt8 = new THREE.WebGLRenderTarget(N, N, { depthBuffer: false });
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: POST,
    uniforms: { tH: { value: rtF.texture }, uRes: { value: N }, uDepth: { value: 0 }, uWS: { value: 1 }, uMode: { value: 0 } },
  });
  const read = () => {
    const buf = new Uint8Array(N * N * 4);
    renderer.readRenderTargetPixels(rt8, 0, 0, N, N, buf);
    return buf;
  };
  const draw = (target) => {
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  };

  const out = {};
  const keys = Object.keys(MATERIALS);
  for (const [i, key] of keys.entries()) {
    onProgress?.(i, keys.length, MATERIALS[key].name);
    await new Promise(requestAnimationFrame);
    const bake = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BAKE.replace('void main()', SURF[key] + '\nvoid main()'),
      uniforms: { uRes: { value: N }, uSeed: { value: i + 1 }, uMode: { value: 0 } },
    });
    quad.material = bake;
    draw(rtF);
    bake.uniforms.uMode.value = 1;
    draw(rt8);
    const albedo = read();
    quad.material = post;
    post.uniforms.uDepth.value = MATERIALS[key].depth;
    post.uniforms.uWS.value = MATERIALS[key].ws;
    post.uniforms.uMode.value = 0;
    draw(rt8);
    const normal = read();
    post.uniforms.uMode.value = 1;
    draw(rt8);
    const orm = read();
    bake.dispose();
    out[key] = { albedo, normal, orm };
  }
  renderer.setRenderTarget(null);
  rtF.dispose();
  rt8.dispose();
  post.dispose();
  onProgress?.(keys.length, keys.length, '');
  return out;
}

export function dataTexture(data, srgb, aniso = 8) {
  const t = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Parallax occlusion mapping with relief interpolation; height comes from normalMap.a.
const POM = /* glsl */ `
uniform float pomDepth;
uniform float pomScale;
vec2 pomUV(vec2 uv) {
  float depth = pomDepth * pomScale;
  if (depth <= 0.0) return uv;
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-20));
  T *= inv; B *= inv;
  vec3 V = normalize(vViewPosition);
  vec3 Vt = vec3(dot(V, T), dot(V, B), dot(V, N));
  if (Vt.z <= 0.0) return uv;
  float layers = mix(40.0, 10.0, Vt.z);
  float stp = 1.0 / layers;
  vec2 delta = Vt.xy / max(Vt.z, 0.2) * depth * stp;
  vec2 cur = uv;
  float layer = 0.0;
  float d = 1.0 - textureGrad(normalMap, cur, duv1, duv2).a;
  for (int i = 0; i < 40; i++) {
    if (layer >= d) break;
    cur -= delta;
    layer += stp;
    d = 1.0 - textureGrad(normalMap, cur, duv1, duv2).a;
  }
  vec2 prev = cur + delta;
  float after = d - layer;
  float before = (1.0 - textureGrad(normalMap, prev, duv1, duv2).a) - layer + stp;
  return mix(cur, prev, clamp(after / (after - before + 1e-6), 0.0, 1.0));
}
`;

export const pomScale = { value: 1 };

function patchPOM(src) {
  const swap = (chunk, from) => THREE.ShaderChunk[chunk].replaceAll(from, 'pomUv');
  return src
    .replace('#include <map_fragment>', swap('map_fragment', 'vMapUv'))
    .replace('#include <normal_fragment_maps>', swap('normal_fragment_maps', 'vNormalMapUv'))
    .replace('#include <roughnessmap_fragment>', swap('roughnessmap_fragment', 'vRoughnessMapUv'))
    .replace('#include <metalnessmap_fragment>', swap('metalnessmap_fragment', 'vMetalnessMapUv'))
    .replace('#include <aomap_fragment>', swap('aomap_fragment', 'vAoMapUv'))
    .replace('void main() {', POM + 'void main() {\n\tvec2 pomUv = pomUV(vNormalMapUv);');
}

export function makeMaterials(baked, renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const mats = {};
  for (const [key, def] of Object.entries(MATERIALS)) {
    const b = baked[key];
    const orm = dataTexture(b.orm, false, aniso);
    const m = new THREE.MeshStandardMaterial({
      name: def.name,
      map: dataTexture(b.albedo, true, aniso),
      normalMap: dataTexture(b.normal, false, aniso),
      normalScale: new THREE.Vector2(1, -1),
      roughnessMap: orm,
      metalnessMap: orm,
      aoMap: orm,
      roughness: 1,
      metalness: 1,
    });
    const depth = { value: def.depth / def.ws };
    m.onBeforeCompile = (s) => {
      s.uniforms.pomDepth = depth;
      s.uniforms.pomScale = pomScale;
      s.fragmentShader = patchPOM(s.fragmentShader);
    };
    mats[key] = m;
  }
  mats.paint = new THREE.MeshStandardMaterial({ name: 'RoadPaint', color: '#f2f0ea', roughness: 0.6, metalness: 0 });
  return mats;
}
