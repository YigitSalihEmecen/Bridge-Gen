import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0);
export const Z = new THREE.Vector3(0, 0, 1);
export const X = new THREE.Vector3(1, 0, 0);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export const circle = (r, n) => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)]);
export const at = (x, y, z) => ({ matrix: new THREE.Matrix4().makeTranslation(x, y, z) });

// Collects geometry per material; UVs arrive in meters and are scaled to each material's tile size.
export class Builder {
  constructor(tileSize, seed = 1) {
    this.ws = tileSize;
    this.parts = {};
    this.rand = rng(seed);
  }

  add(mat, geo, { matrix, swap, wrap } = {}) {
    if (matrix) geo.applyMatrix4(matrix);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.clearGroups();
    if (!geo.index) geo = mergeVertices(geo, 1e-5);
    const uv = geo.attributes.uv;
    const s = 1 / (this.ws[mat] ?? 1);
    let wrapScale = 1;
    if (wrap) {
      let max = 0;
      for (let i = 0; i < uv.count; i++) max = Math.max(max, uv.getY(i));
      if (max > 0) wrapScale = Math.max(1, Math.round(max * s)) / (max * s);
    }
    const du = this.rand(), dv = wrap ? 0 : this.rand();
    for (let i = 0; i < uv.count; i++) {
      let u = uv.getX(i) * s, v = uv.getY(i) * s * wrapScale;
      if (swap) [u, v] = [v, u];
      uv.setXY(i, u + du, v + dv);
    }
    (this.parts[mat] ||= []).push(geo);
  }

  build() {
    const out = {};
    for (const [k, list] of Object.entries(this.parts)) {
      out[k] = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
    }
    return out;
  }
}

function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

// Long axis is local X so wood grain / texture rows follow the member.
export const box = (sx, sy, sz) => boxUV(new THREE.BoxGeometry(sx, sy, sz));

export function taperedBox(sx, sy, sz, taper) {
  const g = box(sx, sy, sz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * taper, p.getY(i), p.getZ(i) * taper);
  g.computeVertexNormals();
  return g;
}

// Box from a to b; w is measured along `side`, h along the remaining axis.
export function beam(a, b, w, h, side = Z) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  let s = side.clone().addScaledVector(dir, -side.dot(dir));
  if (s.lengthSq() < 1e-6) s = Math.abs(dir.y) < 0.9 ? new THREE.Vector3().crossVectors(dir, Y) : X.clone();
  s.normalize();
  const up = new THREE.Vector3().crossVectors(s, dir);
  const g = box(len, h, w);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, up, s).setPosition(a.clone().add(b).multiplyScalar(0.5)));
  return g;
}

// UV: u along the axis, v around the circumference (meters).
export function cyl(a, b, r, seg = 8, caps = true, rTop = r) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1, !caps);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const C = Math.PI * (r + rTop);
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getY(i) + len / 2, uv.getX(i) * C);
  }
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Sweeps a closed 2D profile (x → side, y → up) along a 3D path. u = arc length, v = profile perimeter.
export function sweep(path, profile, { caps = true, smooth = false, side = null } = {}) {
  const prof = profile.map(([x, y]) => new THREE.Vector2(x, y));
  if (THREE.ShapeUtils.isClockWise(prof)) prof.reverse();
  const n = prof.length;
  const frames = path.map((p, i) => {
    const T = path[Math.min(i + 1, path.length - 1)].clone().sub(path[Math.max(i - 1, 0)]).normalize();
    let S = side ? side.clone().addScaledVector(T, -side.dot(T)) : new THREE.Vector3().crossVectors(T, Y);
    if (S.lengthSq() < 1e-8) S = Z.clone();
    S.normalize();
    return { p, T, S, U: new THREE.Vector3().crossVectors(S, T) };
  });
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + path[i].distanceTo(path[i - 1]));

  const ring = [], strips = [];
  let v = 0;
  if (smooth) {
    for (let i = 0; i <= n; i++) {
      const a = prof[(i - 1 + n) % n], b = prof[i % n], c = prof[(i + 1) % n];
      if (i) v += b.distanceTo(prof[i - 1]);
      const e1 = b.clone().sub(a).normalize(), e2 = c.clone().sub(b).normalize();
      const nx = e1.y + e2.y, ny = -(e1.x + e2.x), l = Math.hypot(nx, ny) || 1;
      ring.push([b.x, b.y, nx / l, ny / l, v]);
      if (i) strips.push([i - 1, i]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = prof[i], b = prof[(i + 1) % n], l = a.distanceTo(b);
      if (l < 1e-9) continue;
      const nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l;
      ring.push([a.x, a.y, nx, ny, v], [b.x, b.y, nx, ny, v + l]);
      strips.push([ring.length - 2, ring.length - 1]);
      v += l;
    }
  }

  const pos = [], nrm = [], uvs = [], idx = [];
  const t = new THREE.Vector3();
  frames.forEach(({ p, S, U }, i) => {
    for (const [x, y, nx, ny, vv] of ring) {
      t.copy(p).addScaledVector(S, x).addScaledVector(U, y);
      pos.push(t.x, t.y, t.z);
      t.set(0, 0, 0).addScaledVector(S, nx).addScaledVector(U, ny);
      nrm.push(t.x, t.y, t.z);
      uvs.push(along[i], vv);
    }
  });
  const R = ring.length;
  for (let i = 0; i < path.length - 1; i++) {
    for (const [a, b] of strips) {
      const A = i * R + a, B = i * R + b, C = (i + 1) * R + b, D = (i + 1) * R + a;
      idx.push(A, D, B, B, D, C);
    }
  }

  if (caps) {
    const tris = THREE.ShapeUtils.triangulateShape(prof.slice(), []);
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (const [end, sign] of [[0, -1], [path.length - 1, 1]]) {
      const { p, T, S, U } = frames[end];
      const base = pos.length / 3;
      for (const q of prof) {
        t.copy(p).addScaledVector(S, q.x).addScaledVector(U, q.y);
        pos.push(t.x, t.y, t.z);
        nrm.push(T.x * sign, T.y * sign, T.z * sign);
        uvs.push(q.x, q.y);
      }
      for (let [a, b, c] of tris) {
        if (cross(prof[a], prof[b], prof[c]) < 0) [b, c] = [c, b];
        if (sign < 0) idx.push(base + a, base + b, base + c);
        else idx.push(base + a, base + c, base + b);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

// Extrudes a polygon with holes along +Z. Side walls get arc-length UVs so arch soffits wrap cleanly.
// ExtrudeGeometry only fixes hole winding for CCW outlines, so normalize: outline CCW, holes CW.
export function extrude(outline, holes, depth) {
  if (THREE.ShapeUtils.isClockWise(outline)) outline = outline.slice().reverse();
  holes = holes.map((h) => (THREE.ShapeUtils.isClockWise(h) ? h : h.slice().reverse()));
  const shape = new THREE.Shape(outline);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const key = (x, y) => `${x.toFixed(4)},${y.toFixed(4)}`;
  const arc = new Map();
  for (const loop of [outline, ...holes]) {
    let s = 0;
    const total = loop.reduce((acc, p, i) => acc + p.distanceTo(loop[(i + 1) % loop.length]), 0);
    loop.forEach((p, i) => {
      if (i) s += p.distanceTo(loop[i - 1]);
      arc.set(key(p.x, p.y), { s, total });
    });
  }
  const UVGenerator = {
    generateTopUV: (g, v, a, b, c) => [a, b, c].map((i) => new THREE.Vector2(v[i * 3], v[i * 3 + 1])),
    generateSideWallUV(g, v, a, b, c, d) {
      const A = arc.get(key(v[a * 3], v[a * 3 + 1])), B = arc.get(key(v[b * 3], v[b * 3 + 1]));
      let sa = A?.s ?? 0, sb = B?.s ?? 0;
      const T = A?.total ?? 1;
      if (sb - sa > T / 2) sa += T;
      else if (sa - sb > T / 2) sb += T;
      return [
        new THREE.Vector2(sa, v[a * 3 + 2]),
        new THREE.Vector2(sb, v[b * 3 + 2]),
        new THREE.Vector2(sb, v[c * 3 + 2]),
        new THREE.Vector2(sa, v[d * 3 + 2]),
      ];
    },
  };
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1, UVGenerator });
}
