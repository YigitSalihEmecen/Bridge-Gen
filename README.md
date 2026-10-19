# Bridge-Gen

Parametric, game-ready 3D bridge generator in the browser: timber, rope, stone arch, truss, steel girder, tied arch, cable-stayed and suspension bridges, with procedural parallax-mapped PBR materials.

## Run

```sh
npm run serve   # then open http://localhost:8765
```

## Export

- **GLB**: meters, Y-up, one mesh per material, embedded BaseColor / Normal / ORM.
- **ZIP**: GLB plus texture maps, including height maps for parallax.

## As a library

The generator is plain ES modules importing only `three` and `three/addons/`, so a host with an import map
(or a bundler) uses it straight from `src/` — this is how [HighRoads](https://github.com/YigitSalihEmecen/HighRoads)
consumes it as a submodule:

```js
import { buildBridge, TYPES, BASE } from './bridge_gen/src/bridges.js';
import { bakeTextures, makeMaterials } from './bridge_gen/src/textures.js';

const { parts } = buildBridge({ ...BASE, ...TYPES.girder.defaults, type: 'girder', length: 140, ground: (x) => -20 });
const mats = makeMaterials(await bakeTextures(renderer, null, { maxRes: 1024 }), renderer);
for (const [key, geo] of Object.entries(parts)) scene.add(new THREE.Mesh(geo, mats[key]));
```

- `buildBridge(P)` → `{ parts: { [material]: BufferGeometry }, c }`, metres, deck centreline on local X from
  `-length/2` to `length/2`, road surface at `deckY(x)`, Y up. Pure geometry, no renderer.
- `P.ground(x)` (optional) replaces the preview's synthetic gap: the host's terrain height under the centreline,
  in the bridge's frame. Piers, abutments, towers and stone arch fill stand on it.
- `P.segment` (optional) caps the spacing of the deck's sweep rings, metres. A flat deck is otherwise swept end
  to end in one piece; set it when the host bends the bridge onto a curved road afterwards.
- `bakeTextures(renderer, onProgress, { maxRes })` bakes every material's maps on the GPU, capped at `maxRes` px;
  `makeMaterials(baked, renderer)` turns them into parallax-mapped `MeshStandardMaterial`s keyed like `parts`.

## Test

```sh
npm install && npm test   # checks every mesh is closed and outward-facing
```
