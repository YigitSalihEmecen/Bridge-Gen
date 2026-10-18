import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { zipSync, strToU8 } from 'fflate';
import { bakeTextures, makeMaterials, dataTexture, MATERIALS, RES, pomScale } from './textures.js';
import { TYPES, BASE, PARAMS, buildBridge, buildTerrain } from './bridges.js';

const P = { ...BASE, ...TYPES.wood.defaults, type: 'wood' };
const $ = (s) => document.querySelector(s);

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const BG = new THREE.Color('#eceae3');
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 200, 2000);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const sun = new THREE.DirectionalLight('#fff3e3', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0003;
scene.add(sun, sun.target, new THREE.HemisphereLight('#f6f3ec', '#9d9584', 0.75));

const bridge = new THREE.Group();
const terrain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#d4ccb8', roughness: 1 }));
terrain.receiveShadow = true;
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#7f9a9c', roughness: 0.08, transparent: true, opacity: 0.78 }),
);
water.receiveShadow = true;
scene.add(bridge, terrain, water);

let baked, mats, sphere;

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

function frame() {
  const d = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.8;
  camera.position.copy(sphere.center).add(new THREE.Vector3(0.78, 0.3, 1).normalize().multiplyScalar(d));
  controls.target.copy(sphere.center);
  camera.near = Math.max(0.05, d / 800);
  camera.far = d * 40;
  camera.updateProjectionMatrix();
}

function rebuild(refit) {
  const { parts, c } = buildBridge(P);
  for (const m of bridge.children) m.geometry.dispose();
  bridge.clear();
  let tris = 0;
  for (const [k, geo] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(geo, mats[k]);
    mesh.name = mats[k].name;
    mesh.castShadow = mesh.receiveShadow = true;
    bridge.add(mesh);
    tris += geo.index.count / 3;
  }
  const box = new THREE.Box3().setFromObject(bridge);
  const size = box.getSize(new THREE.Vector3());
  sphere = box.getBoundingSphere(new THREE.Sphere());

  const t = buildTerrain(P, c, Math.max(-box.min.z, box.max.z));
  terrain.geometry.dispose();
  terrain.geometry = t.geo;
  water.scale.set(t.size[0], 1, t.size[1]);
  water.position.y = t.minY + Math.min(2.5, P.gapDepth * 0.15);
  applyVisibility();

  const r = sphere.radius;
  sun.position.copy(sphere.center).add(new THREE.Vector3(-0.5, 0.85, 0.55).normalize().multiplyScalar(r * 2));
  sun.target.position.copy(sphere.center);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 4 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = (r / 4096) * 3;
  scene.fog.near = r * 5;
  scene.fog.far = r * 16;
  if (refit) frame();

  $('#stats').innerHTML = `<b>${Math.round(tris).toLocaleString()}</b> tris · ${bridge.children.length} materials · ${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} m`;
}

function applyVisibility() {
  terrain.visible = P.terrain;
  water.visible = P.terrain && P.water && P.gapDepth > 2;
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    rebuild(false);
  });
}

// ---------- UI ----------

const rows = [];

function buildUI() {
  const types = $('#types');
  for (const [key, t] of Object.entries(TYPES)) {
    const b = document.createElement('button');
    b.className = 'type';
    b.dataset.type = key;
    b.innerHTML = `<b>${t.label}</b><span>${t.note}</span>`;
    b.onclick = () => selectType(key);
    types.append(b);
  }

  let group;
  for (const p of PARAMS) {
    if (p.group) {
      group = document.createElement('section');
      group.className = 'group';
      group.innerHTML = `<h2>${p.group}</h2>`;
      $('#controls').append(group);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'row';
    const id = `p-${p.key}`;
    if (p.options) {
      row.innerHTML = `<div class="head"><label>${p.label}</label></div><div class="seg" role="group" aria-label="${p.label}">${p.options.map((o) => `<button data-v="${o}">${o}</button>`).join('')}</div>`;
      row.querySelectorAll('button').forEach((b) => (b.onclick = () => set(p, b.dataset.v)));
      row.sync = () => row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === String(P[p.key])));
    } else if (p.check) {
      row.innerHTML = `<label class="switch" for="${id}">${p.label}<input type="checkbox" id="${id}"></label>`;
      const input = row.querySelector('input');
      input.onchange = () => set(p, input.checked);
      row.sync = () => (input.checked = P[p.key]);
    } else if (p.color) {
      row.innerHTML = `<label class="color" for="${id}">${p.label}<input type="color" id="${id}"></label>`;
      const input = row.querySelector('input');
      input.oninput = () => set(p, input.value);
      row.sync = () => (input.value = P[p.key]);
    } else {
      row.innerHTML = `<div class="head"><label for="${id}">${p.label}</label><span class="val"><input type="number" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${p.label} value">${p.unit ?? ''}</span></div><input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      const [num, range] = row.querySelectorAll('input');
      const paint = () => range.style.setProperty('--p', `${((range.value - p.min) / (p.max - p.min)) * 100}%`);
      range.oninput = () => { num.value = range.value; paint(); set(p, +range.value); };
      num.onchange = () => {
        const v = Math.min(p.max, Math.max(p.min, +num.value || 0));
        num.value = range.value = v;
        paint();
        set(p, v);
      };
      row.sync = () => { num.value = range.value = P[p.key]; paint(); };
    }
    row.param = p;
    rows.push(row);
    group.append(row);
  }
}

function syncUI() {
  document.querySelectorAll('.type').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === P.type));
  for (const row of rows) {
    const p = row.param;
    row.hidden = (p.types && !p.types.includes(P.type)) || (p.not && p.not.includes(P.type));
    row.sync();
  }
  document.querySelectorAll('.group').forEach((g) => (g.hidden = ![...g.querySelectorAll('.row')].some((r) => !r.hidden)));
}

function set(p, v) {
  P[p.key] = v;
  if (p.options || p.check) rows.find((r) => r.param === p).sync();
  if (p.key === 'pom') pomScale.value = v;
  else if (p.key === 'steelColor') mats.steel.color.set(v);
  else if (p.key === 'terrain' || p.key === 'water') applyVisibility();
  else schedule();
}

function selectType(type) {
  const keep = { pom: P.pom, terrain: P.terrain, water: P.water };
  Object.assign(P, BASE, TYPES[type].defaults, keep, { type });
  mats.steel.color.set(P.steelColor);
  syncUI();
  rebuild(true);
}

// ---------- export ----------

const exportNormals = {};
function exportMaterial(mesh) {
  const key = Object.keys(mats).find((k) => mats[k] === mesh.material);
  const m = mesh.material;
  if (!m.normalMap) return m;
  if (!exportNormals[key]) {
    const d = new Uint8Array(baked[key].normal);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    exportNormals[key] = dataTexture(d, false);
  }
  return new THREE.MeshStandardMaterial({
    name: m.name, color: m.color, map: m.map, normalMap: exportNormals[key],
    roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, aoMap: m.aoMap, roughness: 1, metalness: 1,
  });
}

const baseName = () => `bridge_${P.type}_${Math.round(P.length)}m`;

async function glb() {
  const group = new THREE.Group();
  group.name = baseName();
  for (const mesh of bridge.children) {
    const m = new THREE.Mesh(mesh.geometry, exportMaterial(mesh));
    m.name = mesh.name;
    group.add(m);
  }
  return new Uint8Array(await new GLTFExporter().parseAsync(group, { binary: true, maxTextureSize: RES }));
}

async function png(rgba, map) {
  const data = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) map(rgba, data, i);
  const cv = new OffscreenCanvas(RES, RES);
  cv.getContext('2d').putImageData(new ImageData(data, RES, RES), 0, 0);
  return new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
const opaque = (s, d, i) => { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; };
const alphaGray = (s, d, i) => { d[i] = d[i + 1] = d[i + 2] = s[i + 3]; d[i + 3] = 255; };

function download(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function readme(used) {
  const lines = used.map((k) => `  ${MATERIALS[k].name.padEnd(14)} tile ${MATERIALS[k].ws} m   relief ${(MATERIALS[k].depth * 100).toFixed(2)} cm`);
  return `Bridge Generator export — ${baseName()}

Units: meters. Up axis: +Y. Bridge runs along +X, centered on X=0/Z=0.
Y=0 is the reference terrain level; deck ends sit at the start/end elevations.
UVs are baked at real-world scale (one texture tile = "tile" below).

Per material (textures/):
  *_BaseColor.png        sRGB albedo
  *_Normal_OpenGL.png    tangent-space normal, +Y green (glTF/Unity/Godot). Flip green for Unreal/DirectX.
  *_ORM.png              R = ambient occlusion, G = roughness, B = metalness
  *_Height.png           height for parallax occlusion / tessellation (white = high)

Height scale (use as POM/displacement depth):
${lines.join('\n')}

Paint (road markings) is untextured. The GLB embeds BaseColor, Normal and ORM;
height maps are only in this archive because glTF has no standard parallax slot.
`;
}

async function busy(btn, fn) {
  const label = btn.textContent;
  document.querySelectorAll('.export .btn').forEach((b) => (b.disabled = true));
  btn.textContent = 'Exporting…';
  try { await fn(); }
  catch (e) { console.error(e); alert(`Export failed: ${e.message}`); }
  finally {
    btn.textContent = label;
    document.querySelectorAll('.export .btn').forEach((b) => (b.disabled = false));
  }
}

$('#export-glb').onclick = (e) => busy(e.currentTarget, async () => download(await glb(), `${baseName()}.glb`, 'model/gltf-binary'));
$('#export-zip').onclick = (e) => busy(e.currentTarget, async () => {
  const used = Object.keys(mats).filter((k) => MATERIALS[k] && bridge.children.some((m) => m.material === mats[k]));
  const files = { [`${baseName()}.glb`]: await glb(), 'README.txt': strToU8(readme(used)) };
  for (const k of used) {
    const n = MATERIALS[k].name, d = baked[k];
    files[`textures/${n}_BaseColor.png`] = await png(d.albedo, opaque);
    files[`textures/${n}_Normal_OpenGL.png`] = await png(d.normal, opaque);
    files[`textures/${n}_ORM.png`] = await png(d.orm, opaque);
    files[`textures/${n}_Height.png`] = await png(d.normal, alphaGray);
  }
  download(zipSync(files, { level: 0 }), `${baseName()}.zip`, 'application/zip');
});

$('#frame').onclick = frame;
canvas.addEventListener('keydown', (e) => e.key === 'f' && frame());

// ---------- boot ----------

buildUI();
resize();
baked = await bakeTextures(renderer, (i, n, name) => {
  $('#progress').style.width = `${(i / n) * 100}%`;
  $('#progress-label').textContent = name ? `${name} · ${i + 1} of ${n}` : 'Done';
});
mats = makeMaterials(baked, renderer);
selectType('wood');
$('#loading').classList.add('done');
document.querySelectorAll('.export .btn').forEach((b) => (b.disabled = false));
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
