# Bridge-Gen

Parametric, game-ready 3D bridge generator in the browser: timber, rope, stone arch, truss, steel girder, tied arch, cable-stayed and suspension bridges, with procedural parallax-mapped PBR materials.

## Run

```sh
npm run serve   # then open http://localhost:8765
```

## Export

- **GLB**: meters, Y-up, one mesh per material, embedded BaseColor / Normal / ORM.
- **ZIP**: GLB plus texture maps, including height maps for parallax.

## Test

```sh
npm install && npm test   # checks every mesh is closed and outward-facing
```
