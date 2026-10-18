import * as THREE from 'three';
import { Builder, box, beam, cyl, sweep, extrude, taperedBox, rect, circle, at, rng, X, Z } from './geometry.js';
import { TILE } from './textures.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const range = (n) => Array.from({ length: n }, (_, i) => i);

export const TYPES = {
  wood: {
    label: 'Timber beam', note: 'Plank deck on trestle bents',
    defaults: { length: 10, lanes: 1, laneWidth: 3, sidewalk: 0, camber: 0.1, gapDepth: 2.5, gapShape: 'U', spans: 2 },
  },
  rope: {
    label: 'Rope', note: 'Suspended plank footbridge',
    defaults: { length: 36, lanes: 1, laneWidth: 1.2, sidewalk: 0, camber: -2.2, gapDepth: 24, gapShape: 'V', seed: 7 },
  },
  stone: {
    label: 'Stone arch', note: 'Masonry arches with cutwaters',
    defaults: { length: 54, lanes: 1, laneWidth: 4, sidewalk: 0.8, camber: 1.4, gapDepth: 9, gapShape: 'U', spans: 3, archRise: 0.5, parapet: 1.0 },
  },
  truss: {
    label: 'Truss', note: 'Through truss, steel or timber',
    defaults: { length: 96, lanes: 2, laneWidth: 3.5, sidewalk: 0, camber: 0.4, gapDepth: 14, gapShape: 'U', spans: 2, trussHeight: 7, trussStyle: 'Pratt', trussMaterial: 'Steel', steelColor: '#5d6b70', railing: 'Railing' },
  },
  girder: {
    label: 'Steel girder', note: 'Highway viaduct on concrete piers',
    defaults: { length: 180, lanes: 4, laneWidth: 3.6, sidewalk: 1.5, camber: 1.0, gapDepth: 16, gapShape: 'Flat', spans: 5, girderDepth: 2.2, steelColor: '#6f7b80', railing: 'Barrier' },
  },
  arch: {
    label: 'Tied arch', note: 'Bowstring arches with hangers',
    defaults: { length: 150, lanes: 2, laneWidth: 3.5, sidewalk: 1.2, camber: 0.6, gapDepth: 14, gapShape: 'U', spans: 1, archRise: 0.17, hangerSpacing: 6, hangerPattern: 'Network', steelColor: '#e4e1d8', railing: 'Railing' },
  },
  stayed: {
    label: 'Cable-stayed', note: 'Pylons with stay cables',
    defaults: { length: 420, lanes: 4, laneWidth: 3.6, sidewalk: 1.5, camber: 2.0, gapDepth: 40, gapShape: 'U', pylons: '2', pylonShape: 'H', stayLayout: 'Semi-fan', staySpacing: 12, towerHeight: 70, mainRatio: 0.52, towerMaterial: 'Concrete', steelColor: '#7d878c', railing: 'Barrier' },
  },
  suspension: {
    label: 'Suspension', note: 'Main cables, towers, hangers',
    defaults: { length: 500, lanes: 4, laneWidth: 3.6, sidewalk: 1.5, camber: 2.5, gapDepth: 45, gapShape: 'U', mainRatio: 0.6, towerHeight: 60, hangerSpacing: 10, stiffening: 'Truss', towerMaterial: 'Steel', steelColor: '#b4432f', railing: 'Railing' },
  },
};

export const BASE = {
  type: 'wood', length: 10, lanes: 1, laneWidth: 3, sidewalk: 0,
  startElev: 0, endElev: 0, camber: 0, gapDepth: 3, gapShape: 'U',
  spans: 2, archRise: 0.45, parapet: 1.0, girderDepth: 2, trussHeight: 7, trussStyle: 'Pratt', trussMaterial: 'Steel',
  mainRatio: 0.6, towerHeight: 60, towerMaterial: 'Concrete', stiffening: 'Truss', hangerSpacing: 10, hangerPattern: 'Vertical',
  pylons: '2', pylonShape: 'H', stayLayout: 'Semi-fan', staySpacing: 12, railing: 'Barrier', seed: 7,
  steelColor: '#6f7b80', pom: 1, terrain: true, water: true, texRes: '2048',
};

const STEEL = ['truss', 'girder', 'arch', 'stayed', 'suspension'];
export const PARAMS = [
  { group: 'Dimensions' },
  { key: 'length', label: 'Length', unit: 'm', min: 4, max: 2000, step: 1 },
  { key: 'lanes', label: 'Lanes', min: 1, max: 8, step: 1 },
  { key: 'laneWidth', label: 'Lane width', unit: 'm', min: 0.8, max: 4.5, step: 0.1 },
  { key: 'sidewalk', label: 'Sidewalks', unit: 'm', min: 0, max: 5, step: 0.1, not: ['rope'] },
  { group: 'Side profile' },
  { key: 'startElev', label: 'Start elevation', unit: 'm', min: -50, max: 150, step: 0.1 },
  { key: 'endElev', label: 'End elevation', unit: 'm', min: -50, max: 150, step: 0.1 },
  { key: 'camber', label: 'Camber / sag', unit: 'm', min: -80, max: 60, step: 0.1 },
  { key: 'gapDepth', label: 'Gap depth', unit: 'm', min: 0, max: 300, step: 0.5 },
  { key: 'gapShape', label: 'Gap shape', options: ['V', 'U', 'Flat'] },
  { group: 'Structure' },
  { key: 'spans', label: 'Spans', min: 1, max: 60, step: 1, types: ['wood', 'stone', 'truss', 'girder', 'arch'] },
  { key: 'archRise', label: 'Arch rise', unit: '×', min: 0.1, max: 0.5, step: 0.01, types: ['stone', 'arch'] },
  { key: 'parapet', label: 'Parapet height', unit: 'm', min: 0.4, max: 1.6, step: 0.05, types: ['stone'] },
  { key: 'girderDepth', label: 'Girder depth', unit: 'm', min: 0.5, max: 8, step: 0.1, types: ['girder'] },
  { key: 'trussHeight', label: 'Truss height', unit: 'm', min: 1.5, max: 30, step: 0.1, types: ['truss'] },
  { key: 'trussStyle', label: 'Pattern', options: ['Warren', 'Pratt', 'Howe'], types: ['truss'] },
  { key: 'trussMaterial', label: 'Material', options: ['Steel', 'Timber'], types: ['truss'] },
  { key: 'mainRatio', label: 'Main span', unit: '×', min: 0.3, max: 0.9, step: 0.01, types: ['suspension', 'stayed'] },
  { key: 'towerHeight', label: 'Tower height', unit: 'm', min: 8, max: 350, step: 0.5, types: ['suspension', 'stayed'] },
  { key: 'towerMaterial', label: 'Towers', options: ['Concrete', 'Steel'], types: ['suspension', 'stayed'] },
  { key: 'stiffening', label: 'Stiffening', options: ['Truss', 'Box girder'], types: ['suspension'] },
  { key: 'pylons', label: 'Pylons', options: ['1', '2'], types: ['stayed'] },
  { key: 'pylonShape', label: 'Pylon shape', options: ['H', 'A'], types: ['stayed'] },
  { key: 'stayLayout', label: 'Stays', options: ['Fan', 'Semi-fan', 'Harp'], types: ['stayed'] },
  { key: 'staySpacing', label: 'Stay spacing', unit: 'm', min: 3, max: 40, step: 0.5, types: ['stayed'] },
  { key: 'hangerSpacing', label: 'Hanger spacing', unit: 'm', min: 2, max: 40, step: 0.5, types: ['suspension', 'arch'] },
  { key: 'hangerPattern', label: 'Hangers', options: ['Vertical', 'Network'], types: ['arch'] },
  { key: 'railing', label: 'Edge', options: ['Barrier', 'Railing'], types: STEEL },
  { key: 'seed', label: 'Variation seed', min: 1, max: 999, step: 1, types: ['rope', 'wood', 'stone'] },
  { group: 'Materials' },
  { key: 'steelColor', label: 'Steel paint', color: true, types: STEEL },
  { key: 'pom', label: 'Parallax depth', unit: '×', min: 0, max: 3, step: 0.05 },
  { group: 'Viewport' },
  { key: 'terrain', label: 'Terrain preview', check: true },
  { key: 'water', label: 'Water', check: true },
  { group: 'Export' },
  { key: 'texRes', label: 'Texture size', unit: 'px', options: ['2048', '1024', '512'] },
];

export function context(P) {
  const L = P.length;
  const tOf = (x) => (x + L / 2) / L;
  const deckY = (x) => {
    const t = clamp(tOf(x), 0, 1);
    return lerp(P.startElev, P.endElev, t) + P.camber * 4 * t * (1 - t);
  };
  const shape = { V: (s) => 1 - Math.abs(s), U: (s) => 1 - s ** 4, Flat: (s) => 1 - smoothstep(0.84, 1, Math.abs(s)) }[P.gapShape] ?? ((s) => 1 - s * s);
  const groundY = (x) => {
    const t = tOf(x);
    const base = lerp(P.startElev, P.endElev, clamp(t, 0, 1));
    return t <= 0 || t >= 1 ? base : base - P.gapDepth * shape(2 * t - 1);
  };
  const path = (x0, x1, dy = 0, z = 0) => {
    const xs = [x0, ...[-L / 2, L / 2].filter((b) => b > x0 && b < x1), x1];
    const pts = [V(x0, deckY(x0) + dy, z)];
    for (let i = 1; i < xs.length; i++) {
      const a = xs[i - 1], b = xs[i];
      const n = P.camber === 0 ? 1 : clamp(Math.ceil(Math.abs(b - a) / Math.max(0.5, L / 120)), 1, 240);
      for (let k = 1; k <= n; k++) {
        const x = lerp(a, b, k / n);
        pts.push(V(x, deckY(x) + dy, z));
      }
    }
    return pts;
  };
  const spans = Math.max(1, Math.round(P.spans));
  const joints = range(spans + 1).map((i) => -L / 2 + (i * L) / spans);
  return { L, deckY, groundY, path, roadW: P.lanes * P.laneWidth, spans, joints, piers: joints.slice(1, -1) };
}

// ---------- shared parts ----------

const JERSEY = [[0, -0.42], [0, 1.0], [-0.17, 1.0], [-0.22, 0.34], [-0.44, 0.1], [-0.44, -0.08]];

function railing(B, c, x0, x1, z, y0, mat) {
  const steel = mat === 'steel';
  const n = Math.max(1, Math.round((x1 - x0) / (steel ? 2 : 2.4)));
  const ps = steel ? 0.07 : 0.14;
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n), y = c.deckY(x) + y0;
    B.add(mat, beam(V(x, y, z), V(x, y + 1.1, z), ps, ps));
  }
  const rails = steel ? [[1.08, 0.09, 0.07], [0.75, 0.05, 0.05], [0.42, 0.05, 0.05]] : [[1.05, 0.12, 0.1], [0.55, 0.1, 0.07]];
  for (const [h, hh, w] of rails) B.add(mat, sweep(c.path(x0, x1, y0 + h, z), rect(-w / 2, w / 2, -hh / 2, hh / 2)));
}

function markings(B, c, x0, x1, P) {
  const rw = c.roadW / 2;
  if (c.roadW < 5) return;
  const line = (z, a, b) => B.add('paint', sweep(c.path(a, b), rect(z - 0.075, z + 0.075, -0.01, 0.008)));
  line(-rw + 0.3, x0, x1);
  line(rw - 0.3, x0, x1);
  for (let k = 1; k < P.lanes; k++) {
    const z = -rw + k * P.laneWidth;
    if (P.lanes > 2 && P.lanes % 2 === 0 && k === P.lanes / 2) {
      line(z - 0.12, x0, x1);
      line(z + 0.12, x0, x1);
    } else for (let x = x0 + 2; x + 3 < x1; x += 12) line(z, x, x + 3);
  }
}

function roadDeck(B, c, P, { x0 = -c.L / 2, x1 = c.L / 2, slabT = 0.3 } = {}) {
  const barrier = P.railing === 'Barrier';
  const rw = c.roadW / 2, sw = P.sidewalk, eW = barrier ? 0.44 : 0.3;
  const hw = rw + sw + eW;
  const path = c.path(x0, x1);
  B.add('concrete', sweep(path, rect(-hw + 0.02, hw - 0.02, -0.06 - slabT, -0.06)));
  B.add('asphalt', sweep(path, rect(-rw, rw, -0.08, 0)));
  for (const s of [-1, 1]) {
    if (sw > 0) B.add('concrete', sweep(path, rect(s * rw, s * (rw + sw), -0.08, 0.2)));
    if (barrier) B.add('concrete', sweep(path, JERSEY.map(([z, y]) => [s * (hw + z), y])));
    else {
      B.add('concrete', sweep(path, rect(s * (hw - eW), s * hw, -0.42, 0.3)));
      railing(B, c, x0, x1, s * (hw - 0.15), 0.3, 'steel');
    }
  }
  markings(B, c, x0, x1, P);
  return { hw, bottom: -0.06 - slabT };
}

function plankDeck(B, c, P, { rail = true } = {}) {
  const L = c.L, rw = c.roadW / 2;
  const hw = rw + P.sidewalk + 0.15;
  const path = c.path(-L / 2, L / 2);
  B.add('planks', sweep(path, rect(-hw, hw, -0.1, 0)), { swap: true });
  const n = Math.max(3, Math.round((hw * 2) / 0.9) + 1);
  for (const k of range(n)) {
    const z = lerp(-hw + 0.15, hw - 0.15, k / (n - 1));
    B.add('timber', sweep(path, rect(z - 0.1, z + 0.1, -0.5, -0.1)));
  }
  for (const s of [-1, 1]) {
    B.add('timber', sweep(path, rect(s * hw, s * (hw + 0.06), -0.52, 0.03)));
    if (c.roadW >= 2.4) B.add('timber', sweep(path, rect(s * rw, s * (rw + 0.22), 0, 0.2)));
  }
  if (rail) for (const s of [-1, 1]) railing(B, c, -L / 2, L / 2, s * (hw - 0.08), 0, 'timber');
  return { hw, bottom: -0.5 };
}

function boxGirder(B, c, hw, top, gd) {
  const prof = [[-hw + 0.5, top], [hw - 0.5, top], [hw * 0.6, top - gd], [-hw * 0.6, top - gd]];
  B.add('steel', sweep(c.path(-c.L / 2, c.L / 2), prof));
}

function concretePier(B, c, x, topY, hw, thick = 1.6) {
  const g = c.groundY(x), bottom = g - 1.5;
  if (topY - g < 0.8) return;
  const capH = clamp(hw * 0.14, 0.9, 2.5);
  B.add('concrete', box(thick, capH, hw * 2), at(x, topY - capH / 2, 0));
  const nCol = hw * 2 > 16 ? Math.round((hw * 2) / 8) : hw * 2 > 9 ? 2 : 1;
  const r = Math.min(clamp(0.45 + (topY - g) * 0.012, 0.5, 3.2), hw * 0.45);
  for (const k of range(nCol)) {
    const z = nCol === 1 ? 0 : lerp(-hw + r + 0.4, hw - r - 0.4, k / (nCol - 1));
    B.add('concrete', cyl(V(x, bottom, z), V(x, topY - capH + 0.05, z), r, 24), { wrap: true });
    B.add('concrete', box(r * 3.2, 1.2, r * 3.2), at(x, g - 0.45, z));
  }
}

function abutment(B, c, side, topY, hw, mat = 'concrete') {
  const L = c.L, xIn = side * (L / 2 - 0.8), xOut = side * (L / 2 + 2.2);
  const g = c.groundY(xIn) - 1.5;
  const h = topY - g;
  if (h < 0.3) return;
  B.add(mat, box(Math.abs(xOut - xIn), h, hw * 2 + 0.6), at((xIn + xOut) / 2, g + h / 2, 0));
  for (const s of [-1, 1]) B.add(mat, box(4, h, 0.45), at(side * (L / 2 + 3.5), g + h / 2, s * (hw + 0.08)));
}

// Generic planar truss in the XY plane at depth z. `deck` = chords on both full lengths with vertical end posts.
function truss(B, mat, { xa, xb, yb, H, z, style, sz, deck = false }) {
  let p = Math.max(2, Math.round((xb - xa) / (H * (style === 'Warren' ? 1.1 : 0.85))));
  if (p % 2) p++;
  const xs = range(p + 1).map((j) => lerp(xa, xb, j / p));
  const bot = xs.map((x) => V(x, yb(x), z)), top = xs.map((x) => V(x, yb(x) + H, z));
  const chord = (a, b) => B.add(mat, beam(a, b, sz, sz * 1.1));
  const web = (a, b, f = 0.6) => B.add(mat, beam(a, b, sz * f, sz * f));
  const t0 = deck ? 0 : 1, t1 = deck ? p : p - 1;
  for (let j = 0; j < p; j++) chord(bot[j], bot[j + 1]);
  for (let j = t0; j < t1; j++) chord(top[j], top[j + 1]);
  if (deck) { web(bot[0], top[0], 1); web(bot[p], top[p], 1); }
  else { chord(bot[0], top[1]); chord(bot[p], top[p - 1]); }
  if (style !== 'Warren') for (let j = 1; j < p; j++) web(bot[j], top[j], 0.5);
  for (let k = 0; k < p; k++) {
    if (!deck && (k === 0 || k === p - 1)) continue;
    const left = k + 0.5 < p / 2;
    const up = style === 'Warren' ? k % 2 === 0 : style === 'Pratt' ? !left : left;
    up ? web(bot[k], top[k + 1]) : web(top[k], bot[k + 1]);
  }
  return { bot, top, t0, t1, p };
}

// ---------- bridge types ----------

function woodBeam(B, c, P) {
  const d = plankDeck(B, c, P);
  for (const x of c.piers) bent(B, c, x, c.deckY(x) + d.bottom, d.hw);
  for (const s of [-1, 1]) abutment(B, c, s, c.deckY(s * c.L / 2) + d.bottom, d.hw, 'stone');
}

function bent(B, c, x, topY, hw) {
  const g = c.groundY(x);
  if (topY - g < 0.4) return;
  B.add('timber', box(hw * 2 + 0.5, 0.32, 0.32).rotateY(Math.PI / 2), at(x, topY - 0.16, 0));
  const capB = topY - 0.32, base = g - 0.6, H = capB - base;
  const n = Math.max(2, Math.round((hw * 2) / 1.8) + 1);
  const r = clamp(0.13 + H * 0.004, 0.13, 0.32);
  const posts = range(n).map((k) => {
    const zt = lerp(-hw + 0.15, hw - 0.15, k / (n - 1));
    const outer = k === 0 || k === n - 1;
    return [zt + (outer ? Math.sign(zt) * H * 0.1 : 0), zt];
  });
  for (const [zb, zt] of posts) B.add('timber', cyl(V(x, base, zb), V(x, capB, zt), r, 10), { wrap: true });
  if (H < 1.8) return;
  const [zb0, zt0] = posts[n - 1];
  const zAt = (y) => lerp(zb0, zt0, (y - base) / H);
  const stories = Math.ceil((H - 0.8) / 5);
  for (let s = 0; s < stories; s++) {
    const ya = g + 0.2 + ((capB - 0.2 - g - 0.2) * s) / stories, yb = g + 0.2 + ((capB - 0.2 - g - 0.2) * (s + 1)) / stories;
    for (const f of [-1, 1]) {
      const xo = x + f * (r + 0.05);
      B.add('timber', beam(V(xo, ya, -zAt(ya)), V(xo, yb, zAt(yb)), 0.07, 0.22, X));
      B.add('timber', beam(V(xo, ya, zAt(ya)), V(xo, yb, -zAt(yb)), 0.07, 0.22, X));
    }
    if (s > 0) B.add('timber', beam(V(x, ya, -zAt(ya) - 0.1), V(x, ya, zAt(ya) + 0.1), 0.2, 0.2, X));
  }
}

function stoneArch(B, c, P) {
  const L = c.L, rand = rng(P.seed);
  const pt = 0.45, deckT = 0.2, fill = 0.3;
  const hw = c.roadW / 2 + P.sidewalk + pt;
  const sp = L / c.spans;
  const pw = clamp(sp * 0.16, 0.8, 8);
  const abut = clamp(sp * 0.3, 2.5, 12);
  const x0 = -L / 2 - abut, x1 = L / 2 + abut;
  const ringT = clamp(sp * 0.07, 0.35, 1.6);

  const holes = [], springs = [];
  for (const i of range(c.spans)) {
    const xa = c.joints[i] + pw / 2, xb = c.joints[i + 1] - pw / 2;
    const xm = (xa + xb) / 2, cs = xb - xa;
    const crown = c.deckY(xm) - deckT - fill - ringT;
    const floor = Math.max(c.groundY(xa), c.groundY(xb)) + 0.3;
    const arc = (rise) => {
      const R = (cs * cs / 4 + rise * rise) / (2 * rise), yc = crown - R;
      const half = Math.asin(clamp(cs / 2 / R, 0, 1));
      const pts = range(29).map((k) => {
        const a = Math.PI / 2 + half - (2 * half * k) / 28;
        return [xm + R * Math.cos(a), yc + R * Math.sin(a), a];
      });
      return { R, yc, pts };
    };
    // Shrink the rise until the arch ring stays under a cambered deck everywhere.
    let rise = Math.min(P.archRise * cs, crown - floor), A = null;
    for (; rise >= 0.4; rise *= 0.85) {
      A = arc(rise);
      const rr = A.R + ringT;
      if (A.pts.every(([, , a]) => A.yc + rr * Math.sin(a) <= c.deckY(xm + rr * Math.cos(a)) - deckT - 0.15)) break;
    }
    springs.push(rise < 0.4 ? null : crown - rise);
    if (rise < 0.4) continue;
    const { R, yc, pts: arcPts } = A;
    const hole = arcPts.map(([x, y]) => V2(x, y));
    for (let k = 0; k <= 16; k++) {
      const x = lerp(xb, xa, k / 16);
      hole.push(V2(x, c.groundY(x)));
    }
    holes.push(hole);
    const rr = R + ringT / 2;
    for (const s of [-1, 1]) {
      const ring = arcPts.map(([, , a]) => V(xm + rr * Math.cos(a), yc + rr * Math.sin(a), s * hw));
      const prof = s > 0 ? rect(-0.05, 0.07, -ringT / 2, ringT / 2) : rect(-0.07, 0.05, -ringT / 2, ringT / 2);
      B.add('stone', sweep(ring, prof, { side: Z }));
    }
  }

  const n = clamp(Math.ceil((x1 - x0) / 1.5), 24, 600);
  const xsTop = range(n + 1).map((k) => lerp(x0, x1, k / n));
  const outline = [
    ...xsTop.map((x) => V2(x, c.deckY(x) - deckT)),
    ...xsTop.slice().reverse().map((x) => V2(x, Math.min(c.groundY(x), c.deckY(x) - deckT - 1) - 2)),
  ];
  B.add('stone', extrude(outline, holes, hw * 2), at(0, 0, -hw));

  for (const [i, x] of c.piers.entries()) {
    const a = springs[i], b = springs[i + 1];
    const top = Math.min(a ?? Infinity, b ?? Infinity);
    const g = c.groundY(x);
    if (!isFinite(top) || top - g < 0.5) continue;
    const tri = [V2(-pw / 2, 0), V2(pw / 2, 0), V2(0, pw * 0.6)];
    for (const s of [1, -1]) {
      const geo = extrude(tri, [], top - g + 1).rotateX(Math.PI / 2);
      if (s < 0) geo.rotateY(Math.PI);
      B.add('stone', geo, at(x, top, s * (hw - 0.02)));
      const cap = new THREE.ConeGeometry(pw * 0.62, pw * 0.5, 3, 1).toNonIndexed().rotateY(s > 0 ? 0 : Math.PI);
      cap.computeVertexNormals();
      B.add('stone', coneUV(cap), at(x, top + pw * 0.25, s * (hw + pw * 0.18)));
    }
  }

  const path = c.path(x0, x1);
  const rw = c.roadW / 2;
  B.add('cobble', sweep(path, rect(-rw, rw, -deckT - 0.05, 0)));
  const ph = P.parapet;
  for (const s of [-1, 1]) {
    if (P.sidewalk > 0) B.add('stone', sweep(path, rect(s * rw, s * (hw - pt), -deckT, 0.15)));
    const prof = [[hw - pt, -deckT], [hw, -deckT], [hw, ph - 0.12], [hw + 0.05, ph - 0.12], [hw + 0.05, ph], [hw - pt - 0.05, ph], [hw - pt - 0.05, ph - 0.12], [hw - pt, ph - 0.12]];
    B.add('stone', sweep(path, prof.map(([z, y]) => [s * z, y])));
    B.add('stone', sweep(path, rect(s * (hw - 0.05), s * (hw + 0.08), -deckT - 0.5, -deckT - 0.25)));
    for (const e of [-1, 1]) {
      const x = e * (L / 2 + abut - 0.4), y = c.deckY(x) - deckT;
      const h = ph + 0.35 + rand() * 0.05;
      B.add('stone', box(0.8, h, 0.8), at(x, y + h / 2, s * (hw - pt / 2)));
      B.add('stone', box(0.95, 0.14, 0.95), at(x, y + h + 0.07, s * (hw - pt / 2)));
    }
  }
}

// ConeGeometry ships with polar UVs; re-project in meters.
function coneUV(g) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + p.getZ(i), p.getY(i));
  return g;
}

function trussBridge(B, c, P) {
  const timber = P.trussMaterial === 'Timber';
  const mat = timber ? 'timber' : 'steel';
  const d = timber ? plankDeck(B, c, P, { rail: false }) : roadDeck(B, c, P);
  const zt = d.hw + 0.35, H = P.trussHeight;
  const sz = clamp(H * 0.05, timber ? 0.25 : 0.22, 1.2);
  const yb = (x) => c.deckY(x) + d.bottom + sz * 0.3;
  for (const i of range(c.spans)) {
    const xa = c.joints[i] + 0.3, xb = c.joints[i + 1] - 0.3;
    const sides = [-1, 1].map((s) => truss(B, mat, { xa, xb, yb, H, z: s * zt, style: P.trussStyle, sz }));
    const [A, Bt] = sides;
    for (let j = 0; j <= A.p; j++) {
      const y = A.bot[j].y - sz * 0.2;
      B.add(mat, beam(V(A.bot[j].x, y, -zt), V(A.bot[j].x, y, zt), sz * 0.7, sz * 1.3));
    }
    if (H >= 5.5) {
      for (let j = A.t0; j <= A.t1; j++) B.add(mat, beam(A.top[j], Bt.top[j], sz * 0.6, sz * 0.7));
      for (let j = A.t0; j < A.t1; j++) {
        B.add(mat, beam(A.top[j], Bt.top[j + 1], sz * 0.35, sz * 0.35));
        B.add(mat, beam(Bt.top[j], A.top[j + 1], sz * 0.35, sz * 0.35));
      }
      for (const [b0, t0] of [[0, 1], [A.p, A.p - 1]]) {
        const pa = A.bot[b0].clone().lerp(A.top[t0], 0.78), pb = Bt.bot[b0].clone().lerp(Bt.top[t0], 0.78);
        B.add(mat, beam(pa, pb, sz * 0.7, sz * 1.4));
      }
    }
  }
  const pierMat = timber ? 'stone' : 'concrete';
  for (const x of c.piers) {
    const top = yb(x) - sz * 1.0, g = c.groundY(x) - 1.5;
    if (top - g > 1.8) B.add(pierMat, box(2.2, top - g, zt * 2 + 1.6), at(x, (top + g) / 2, 0));
  }
  for (const s of [-1, 1]) abutment(B, c, s, yb(s * c.L / 2) - sz, zt + 0.4, pierMat);
}

function girderBridge(B, c, P) {
  const L = c.L;
  const d = roadDeck(B, c, P);
  const gd = P.girderDepth, top = d.bottom;
  const n = Math.max(2, Math.ceil((d.hw * 2) / 3.2));
  const bf = 0.3 + gd * 0.15, tf = 0.03 + gd * 0.012, tw = 0.016 + gd * 0.006;
  const I = [[-bf / 2, 0], [bf / 2, 0], [bf / 2, tf], [tw / 2, tf], [tw / 2, gd - tf], [bf / 2, gd - tf], [bf / 2, gd], [-bf / 2, gd], [-bf / 2, gd - tf], [-tw / 2, gd - tf], [-tw / 2, tf], [-bf / 2, tf]];
  const zs = range(n).map((k) => lerp(-d.hw + 1, d.hw - 1, k / (n - 1)));
  const path = c.path(-L / 2 + 0.2, L / 2 - 0.2);
  for (const z of zs) B.add('steel', sweep(path, I.map(([a, b]) => [a + z, b + top - gd])));
  const stations = new Set(c.joints.map((x) => clamp(x, -L / 2 + 0.4, L / 2 - 0.4)));
  for (let x = -L / 2 + 8; x < L / 2 - 4; x += 8) stations.add(x);
  for (const x of stations) {
    const y = c.deckY(x) + top - gd / 2;
    for (let k = 0; k < n - 1; k++) B.add('steel', beam(V(x, y, zs[k] + tw), V(x, y, zs[k + 1] - tw), 0.02, gd * 0.7));
  }
  for (const x of c.piers) concretePier(B, c, x, c.deckY(x) + top - gd - 0.05, d.hw - 0.2);
  for (const s of [-1, 1]) abutment(B, c, s, c.deckY(s * L / 2) + top - gd - 0.05, d.hw);
}

function tiedArch(B, c, P) {
  const d = roadDeck(B, c, P);
  const hw = d.hw, zr = hw + 0.7;
  for (const i of range(c.spans)) {
    const xa = c.joints[i] + 0.4, xb = c.joints[i + 1] - 0.4, sp = xb - xa;
    const rise = P.archRise * sp;
    const rw = clamp(0.6 + sp * 0.006, 0.6, 3.5), rd = clamp(0.8 + sp * 0.01, 0.8, 5);
    const archY = (x) => { const t = (x - xa) / sp; return lerp(c.deckY(xa), c.deckY(xb), t) + 0.4 + rise * 4 * t * (1 - t); };
    const xsA = range(49).map((k) => lerp(xa, xb, k / 48));
    for (const s of [-1, 1]) {
      const z = s * zr;
      B.add('steel', sweep(xsA.map((x) => V(x, archY(x), z)), rect(-rw / 2, rw / 2, -rd / 2, rd / 2), { side: Z }));
      B.add('steel', sweep(c.path(xa, xb), rect(z - rw / 2 - 0.1, z + rw / 2 + 0.1, d.bottom - 1.0, 0.7)));
    }
    const n = Math.max(4, Math.round(sp / P.hangerSpacing));
    const rh = clamp(0.03 + sp * 0.0002, 0.035, 0.12);
    for (let k = 1; k < n; k++) {
      const x = lerp(xa, xb, k / n);
      const fy = c.deckY(x) + d.bottom - 0.45;
      B.add('steel', beam(V(x, fy, -zr), V(x, fy, zr), 0.4, 0.8));
      for (const s of [-1, 1]) {
        const z = s * zr, base = V(x, c.deckY(x) + 0.7, z);
        if (P.hangerPattern === 'Network') {
          for (const dir of [-1, 1]) {
            const xt = clamp(x + dir * sp * 0.14, xa + 1, xb - 1);
            B.add('cable', cyl(base, V(xt, archY(xt) - rd / 2, z), rh, 6), { wrap: true });
          }
        } else B.add('cable', cyl(base, V(x, archY(x) - rd / 2, z), rh, 6), { wrap: true });
      }
    }
    if (rise > 8) {
      const braced = range(n + 1).map((k) => lerp(xa, xb, k / n)).filter((x) => archY(x) - c.deckY(x) > 7.5).filter((_, k) => k % 2 === 0);
      braced.forEach((x, k) => {
        B.add('steel', beam(V(x, archY(x), -zr), V(x, archY(x), zr), rw * 0.6, rd * 0.6));
        const xn = braced[k + 1];
        if (xn === undefined) return;
        B.add('steel', beam(V(x, archY(x), -zr), V(xn, archY(xn), zr), 0.3, 0.3));
        B.add('steel', beam(V(x, archY(x), zr), V(xn, archY(xn), -zr), 0.3, 0.3));
      });
    }
  }
  for (const x of c.piers) concretePier(B, c, x, c.deckY(x) + d.bottom - 1.0, zr + 0.6);
  for (const s of [-1, 1]) abutment(B, c, s, c.deckY(s * c.L / 2) + d.bottom - 1.0, zr + 0.4);
}

function towerLegs(B, c, mat, x, z, yBot, yTop, leg) {
  B.add(mat, taperedBox(leg, yTop - yBot, leg * 0.85, 0.7), at(x, (yTop + yBot) / 2, z));
}

function suspension(B, c, P) {
  const L = c.L;
  const d = roadDeck(B, c, P, { slabT: 0.25 });
  const hw = d.hw, zc = hw + 0.45;
  const ms = L * P.mainRatio, xT = ms / 2;
  const gd = clamp(ms / 90, 1.5, 10);
  const tMat = P.towerMaterial === 'Steel' ? 'steel' : 'concrete';
  const Ht = P.towerHeight;

  B.add('steel', sweep(c.path(-L / 2, L / 2), rect(hw - 0.2, zc + 0.35, d.bottom - 0.9, d.bottom + 0.25)));
  B.add('steel', sweep(c.path(-L / 2, L / 2), rect(-zc - 0.35, -hw + 0.2, d.bottom - 0.9, d.bottom + 0.25)));
  if (P.stiffening === 'Truss') {
    const yb = (x) => c.deckY(x) + d.bottom - 0.9 - gd;
    const sz = clamp(gd * 0.08, 0.25, 0.9);
    const sides = [-1, 1].map((s) => truss(B, 'steel', { xa: -L / 2 + 0.5, xb: L / 2 - 0.5, yb, H: gd, z: s * (hw - 0.3), style: 'Warren', sz, deck: true }));
    const [A, Bt] = sides;
    for (let j = 0; j < A.p; j++) {
      B.add('steel', beam(A.bot[j], Bt.bot[j + 1], sz * 0.4, sz * 0.4));
      if (j % 2 === 0) B.add('steel', beam(A.bot[j], Bt.bot[j], sz * 0.5, sz * 0.5));
    }
  } else boxGirder(B, c, hw, d.bottom - 0.9, gd);

  const leg = clamp(Ht * 0.045, 1.0, 9);
  const deckUnder = d.bottom - 0.9 - gd;
  for (const s of [-1, 1]) {
    const x = s * xT, yDeck = c.deckY(x), yTop = yDeck + Ht, g = c.groundY(x), yBot = g - 3;
    for (const z of [-zc, zc]) {
      towerLegs(B, c, tMat, x, z, yBot, yTop, leg);
      B.add('steel', box(leg * 1.2, leg * 0.45, leg * 1.0), at(x, yTop + leg * 0.2, z));
    }
    const struts = [yTop - leg * 0.7];
    const above = Math.floor((Ht - 12) / Math.max(25, Ht * 0.3));
    for (let k = 1; k <= above; k++) struts.push(lerp(yDeck + 10, yTop - leg * 0.7, k / (above + 1)));
    if (yDeck + deckUnder - g > 2) struts.push(yDeck + deckUnder - leg * 0.4);
    for (const y of struts) B.add(tMat, box(leg * 0.7, leg * 0.8, zc * 2 + leg * 0.6), at(x, y, 0));
    B.add('concrete', box(leg * 2.4, 4, zc * 2 + leg * 3), at(x, g - 1.2, 0));
  }

  const rc = clamp(0.06 + 0.00028 * ms * Math.sqrt(c.roadW / 7), 0.08, 0.6);
  const aLen = clamp(L * 0.04, 6, 60), aH = clamp(Ht * 0.12, 3, 25);
  const xA = L / 2 + aLen * 0.35;
  const yTL = c.deckY(-xT) + Ht, yTR = c.deckY(xT) + Ht;
  const yAL = c.deckY(-L / 2) + aH * 0.75, yAR = c.deckY(L / 2) + aH * 0.75;
  const sag = (yTL + yTR) / 2 - (c.deckY(0) + 1.6 + rc);
  const cableY = (x) => {
    if (x < -xT) { const t = (x + xA) / (xA - xT); return lerp(yAL, yTL, t) - 0.015 * (xA - xT) * 4 * t * (1 - t); }
    if (x > xT) { const t = (x - xT) / (xA - xT); return lerp(yTR, yAR, t) - 0.015 * (xA - xT) * 4 * t * (1 - t); }
    const t = (x + xT) / (2 * xT);
    return lerp(yTL, yTR, t) - sag * 4 * t * (1 - t);
  };
  const xsC = [
    ...range(17).map((k) => lerp(-xA, -xT, k / 16)),
    ...range(96).map((k) => lerp(-xT, xT, (k + 1) / 96)),
    ...range(16).map((k) => lerp(xT, xA, (k + 1) / 16)),
  ];
  for (const z of [-zc, zc]) B.add('cable', sweep(xsC.map((x) => V(x, cableY(x), z)), circle(rc, 14), { smooth: true, side: Z }), { wrap: true });

  const rh = clamp(rc * 0.12, 0.025, 0.1);
  const hangers = [];
  const nMain = Math.max(2, Math.round(ms / P.hangerSpacing));
  for (let k = 1; k < nMain; k++) hangers.push(lerp(-xT, xT, k / nMain));
  const side = L / 2 - xT, nSide = Math.round(side / P.hangerSpacing);
  for (let k = 1; k < nSide; k++) hangers.push(-xT - (k * side) / nSide, xT + (k * side) / nSide);
  for (const x of hangers) {
    for (const z of [-zc, zc]) B.add('cable', cyl(V(x, c.deckY(x) + d.bottom + 0.2, z), V(x, cableY(x) - rc * 0.7, z), rh, 6), { wrap: true });
  }
  for (const s of [-1, 1]) {
    const yE = c.deckY(s * L / 2), g = c.groundY(s * L / 2);
    for (const z of [-zc, zc]) {
      const h = yE + aH - (g - 4);
      B.add('concrete', box(aLen, h, 3.2), at(s * (L / 2 + aLen / 2), g - 4 + h / 2, z + Math.sign(z) * 1.4));
    }
    abutment(B, c, s, yE + deckUnder, hw);
  }
}

function cableStayed(B, c, P) {
  const L = c.L;
  const d = roadDeck(B, c, P, { slabT: 0.25 });
  const hw = d.hw, zs = hw + 0.3;
  const gd = clamp(L / 150, 1.2, 4);
  boxGirder(B, c, hw, d.bottom, gd);
  for (const s of [-1, 1]) B.add('steel', sweep(c.path(-L / 2, L / 2), rect(s * (hw - 0.2), s * (hw + 0.6), d.bottom - 0.8, d.bottom + 0.25)));
  const two = P.pylons === '2';
  const xp = two ? [-(L * P.mainRatio) / 2, (L * P.mainRatio) / 2] : [0];
  const Hp = P.towerHeight;
  const tMat = P.towerMaterial === 'Steel' ? 'steel' : 'concrete';
  const leg = clamp(Hp * 0.035, 1.0, 7);
  const zl = hw + 0.9 + leg / 2;
  const rs = clamp(0.05 + L * 0.00008, 0.06, 0.18);
  const under = d.bottom - gd;
  for (const x of xp) {
    const yD = c.deckY(x), top = yD + Hp, g = c.groundY(x), yBot = g - 3;
    const A = P.pylonShape === 'A';
    const apex = leg * 0.45;
    for (const s of [-1, 1]) {
      if (A) {
        towerLegs(B, c, tMat, x, s * zl, yBot, yD + under + 0.1, leg);
        B.add(tMat, beam(V(x, yD + under, s * zl), V(x, top, s * apex), leg * 0.9, leg, X));
      } else towerLegs(B, c, tMat, x, s * zl, yBot, top, leg);
    }
    if (A) B.add(tMat, box(leg * 1.2, Hp * 0.2, apex * 2 + leg), at(x, top - Hp * 0.1, 0));
    else B.add(tMat, box(leg * 0.8, leg, zl * 2), at(x, top - leg * 0.6, 0));
    if (yD + under - g > 2) B.add(tMat, box(leg * 0.9, leg * 0.9, zl * 2 + leg), at(x, yD + under - leg * 0.45, 0));
    B.add('concrete', box(leg * 3, 4, zl * 2 + leg * 3), at(x, g - 1.2, 0));
    const legZ = (y, s) => (A ? s * lerp(zl, apex, clamp((y - yD - under) / (Hp - under), 0, 1)) - s * leg * 0.4 : s * (zl - leg * 0.5));
    for (const dir of [-1, 1]) {
      const xEnd = two && Math.sign(x) !== dir ? 0 : dir * L / 2;
      const reach = Math.abs(xEnd - x) - 2;
      if (reach < 8) continue;
      const n = Math.max(2, Math.round((reach * 0.88) / P.staySpacing));
      for (let k = 1; k <= n; k++) {
        const xd = x + dir * (reach * 0.12 + reach * 0.88 * (k / n));
        const ya = P.stayLayout === 'Fan' ? top - 1.5 - Hp * 0.04 * (1 - k / n)
          : P.stayLayout === 'Harp' ? yD + Hp * (0.2 + 0.72 * (k / n))
            : top - 1.5 - Hp * 0.32 * (1 - k / n);
        for (const s of [-1, 1]) {
          const a = V(xd, c.deckY(xd) + d.bottom + 0.1, s * zs);
          const b = V(x + dir * leg * 0.45, ya, legZ(ya, s));
          B.add('cable', cyl(a, b, rs, 8), { wrap: true });
        }
      }
    }
  }
  for (const s of [-1, 1]) abutment(B, c, s, c.deckY(s * L / 2) + under, hw);
  if (two) {
    for (const s of [-1, 1]) {
      const x = s * (L / 2 + (L * P.mainRatio) / 2) / 2;
      concretePier(B, c, x, c.deckY(x) + under - 0.05, hw - 0.4);
    }
  }
}

function ropeBridge(B, c, P) {
  const L = c.L, rand = rng(P.seed);
  const hw = clamp(c.roadW / 2, 0.4, 1.6);
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let x = -L / 2 + 0.25; x < L / 2 - 0.15;) {
    const y = c.deckY(x), ang = Math.atan((c.deckY(x + 0.05) - c.deckY(x - 0.05)) / 0.1);
    e.set((rand() - 0.5) * 0.04, Math.PI / 2 + (rand() - 0.5) * 0.07, ang, 'ZYX');
    const m = new THREE.Matrix4().compose(V(x, y - 0.025, (rand() - 0.5) * 0.06), q.setFromEuler(e), V(1, 1, 1));
    B.add('timber', box(hw * 2 + 0.12 + rand() * 0.12, 0.045, 0.2 + rand() * 0.04), { matrix: m });
    x += 0.31 * Math.cos(ang);
  }
  const rope = (pts, r) => B.add('rope', sweep(pts, circle(r, 8), { smooth: true, side: Z }), { wrap: true });
  for (const s of [-1, 1]) {
    rope(c.path(-L / 2 - 0.9, L / 2 + 0.9, -0.07, s * (hw + 0.02)), 0.03);
    rope(c.path(-L / 2 - 0.9, L / 2 + 0.9, 1.0, s * (hw + 0.1)), 0.028);
    const nt = Math.max(2, Math.round(L / 1.2));
    for (let k = 0; k <= nt; k++) {
      const x = lerp(-L / 2, L / 2, k / nt), y = c.deckY(x);
      B.add('rope', cyl(V(x, y - 0.07, s * (hw + 0.02)), V(x, y + 1.0, s * (hw + 0.1)), 0.012, 5), { wrap: true });
    }
    for (const end of [-1, 1]) {
      const xP = end * (L / 2 + 0.9), g = c.groundY(xP), z = s * (hw + 0.2);
      B.add('timber', cyl(V(xP, g - 1, z), V(xP, g + 1.45, z), 0.13, 10), { wrap: true });
      const stake = V(xP + end * 2.6, g - 0.05, s * (hw + 0.7));
      B.add('rope', cyl(V(xP, g + 1.0, z), stake, 0.025, 6), { wrap: true });
      B.add('rope', cyl(V(xP, g - 0.05, z), stake, 0.025, 6), { wrap: true });
      B.add('timber', cyl(stake.clone().setY(g - 0.6), stake.clone().setY(g + 0.35), 0.07, 8), { wrap: true });
    }
  }
}

const BUILDERS = { wood: woodBeam, rope: ropeBridge, stone: stoneArch, truss: trussBridge, girder: girderBridge, arch: tiedArch, stayed: cableStayed, suspension };

export function buildBridge(P) {
  const c = context(P);
  const B = new Builder(TILE, P.seed);
  BUILDERS[P.type](B, c, P);
  return { parts: B.build(), c };
}

export function buildTerrain(P, c, halfWidth) {
  const L = P.length, ext = Math.max(L * 0.35, 40), zw = Math.max(halfWidth * 8, L * 0.5, 60);
  const nx = 320;
  const geo = new THREE.PlaneGeometry(L + 2 * ext, zw * 2, nx, 4).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  let minY = Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = c.groundY(p.getX(i)) - 0.04;
    p.setY(i, y);
    minY = Math.min(minY, y);
  }
  geo.computeVertexNormals();
  return { geo, minY, size: [L + 2 * ext, zw * 2] };
}
