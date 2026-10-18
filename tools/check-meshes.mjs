// Verifies every generated part is watertight and outward-facing, across all bridge types and extreme params.
import { buildBridge, TYPES, BASE } from '../src/bridges.js';

const COMBOS = [
  {},
  { length: 4, lanes: 1, laneWidth: 0.8, spans: 1, gapDepth: 0 },
  { length: 2000, lanes: 8, laneWidth: 4.5, sidewalk: 5, spans: 60, gapDepth: 300, gapShape: 'V' },
  { length: 500, camber: -80, gapDepth: 2, startElev: -50, endElev: 150 },
  { length: 120, camber: 60, gapShape: 'Flat', spans: 1, archRise: 0.5 },
  { length: 800, spans: 7, trussMaterial: 'Timber', trussStyle: 'Warren', pylons: '1', pylonShape: 'A', stayLayout: 'Harp', stiffening: 'Box girder', hangerPattern: 'Vertical', railing: 'Railing', towerHeight: 8, mainRatio: 0.9, hangerSpacing: 2, staySpacing: 3 },
];

function inspect(geo) {
  const pos = geo.attributes.position.array, idx = geo.index.array;
  const ids = new Map(), weld = new Int32Array(pos.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = `${Math.round(pos[i * 3] * 1e3)},${Math.round(pos[i * 3 + 1] * 1e3)},${Math.round(pos[i * 3 + 2] * 1e3)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    weld[i] = ids.get(k);
  }
  const parent = Int32Array.from({ length: ids.size }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const edges = new Map();
  let nan = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [weld[idx[t]], weld[idx[t + 1]], weld[idx[t + 2]]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) {
      const k = `${v[e]}>${v[(e + 1) % 3]}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
      parent[find(v[e])] = find(v[(e + 1) % 3]);
    }
  }
  for (const x of pos) if (!Number.isFinite(x)) nan++;
  let open = 0;
  for (const k of edges.keys()) {
    const [a, b] = k.split('>');
    if (!edges.has(`${b}>${a}`)) open++;
  }
  const vol = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const r = find(weld[idx[t]]);
    vol.set(r, (vol.get(r) ?? 0) + v);
  }
  const inverted = [...vol.values()].filter((v) => v < -1e-6).length;
  return { open, inverted, nan, parts: vol.size };
}

let failures = 0;
for (const type of Object.keys(TYPES)) {
  for (const [i, combo] of COMBOS.entries()) {
    const { parts } = buildBridge({ ...BASE, ...TYPES[type].defaults, ...combo, type });
    for (const [mat, geo] of Object.entries(parts)) {
      const r = inspect(geo);
      if (r.open || r.inverted || r.nan) {
        failures++;
        console.log(`FAIL ${type}#${i} ${mat}: open edges ${r.open}, inverted solids ${r.inverted}/${r.parts}, NaN ${r.nan}`);
      }
    }
  }
}
console.log(failures ? `${failures} failing parts` : `all parts closed and outward-facing (${Object.keys(TYPES).length} types × ${COMBOS.length} param sets)`);
process.exit(failures ? 1 : 0);
