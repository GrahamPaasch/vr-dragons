import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/world.js';
import { buildTerrain, terrainRings } from '../src/terrain.js';
import { makeRng, hash2, noise2, fbm, smoothstep } from '../src/rng.js';

test('randomness repeats: the same seed gives the same numbers', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const c = makeRng(43);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.notDeepEqual(first, [c(), c(), c()]);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1);
  }
  assert.equal(hash2(3, 7), hash2(3, 7));
  for (let i = 0; i < 200; i++) {
    const n = noise2(i * 0.37, i * 0.11);
    assert.ok(n >= -1 && n <= 1, 'noise in range: ' + n);
    const f = fbm(i * 0.37, i * 0.11, 3);
    assert.ok(f >= -1 && f <= 1, 'fbm in range: ' + f);
  }
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
});

test('the viewer stands on level rock, with the edge close in front and the lake far below', () => {
  assert.equal(W.ground(0, 0), 0);
  for (const [x, z] of [[0.5, 0], [0, 0.8], [-0.7, -0.4], [0.3, 1.0]]) assert.ok(Math.abs(W.ground(x, z)) < 0.05, 'level underfoot at ' + x + ', ' + z);
  // The edge: within three metres ahead the rock has dropped away.
  assert.ok(W.ground(0, -5) < -4, 'a drop in front: ' + W.ground(0, -5).toFixed(1));
  assert.ok(W.ground(0, -20) < -15);
  // The lake is ahead, about 46 m down.
  assert.equal(W.LAKE_LEVEL, -46);
  assert.ok(W.lakeDistance(W.LAKE.cx, W.LAKE.cz) < 0, 'the middle of the lake is water');
  assert.ok(W.LAKE.cz < -100, 'and it is ahead of the viewer');
  assert.ok(W.lakeDistance(0, 0) > 30, 'the ledge is not');
});

test('the sun is low and ahead, over the far end of the lake', () => {
  const s = W.SUN_DIR;
  assert.ok(Math.abs(Math.hypot(s[0], s[1], s[2]) - 1) < 1e-9, 'a unit vector');
  assert.ok(s[2] < -0.9, 'ahead');
  assert.ok(s[1] > 0.1 && s[1] < 0.25, 'low: ' + ((Math.asin(s[1]) * 180) / Math.PI).toFixed(1) + ' degrees up');
});

test('nothing grows on the water, on the ledge, in the two gaps, or between the ledge and the lake', () => {
  assert.equal(W.forestDensity(W.LAKE.cx, W.LAKE.cz), 0);
  assert.equal(W.forestDensity(0, 0), 0);
  for (const [x, z] of W.GORGE.slice(1, 8)) assert.equal(W.forestDensity(x, z), 0, 'gorge at ' + x + ', ' + z);
  for (const [x, z] of W.MEADOW) assert.equal(W.forestDensity(x, z), 0, 'meadow at ' + x + ', ' + z);
  for (let z = -5; z > -65; z -= 5) assert.equal(W.forestDensity(0, z), 0, 'straight ahead at ' + z);
  // And there is forest elsewhere.
  let wooded = 0;
  for (let x = -400; x <= 400; x += 40) for (let z = -400; z <= 80; z += 40) if (W.forestDensity(x, z) > 0.5) wooded++;
  assert.ok(wooded > 60, 'wooded sample points: ' + wooded);
});

test('the forest: the same every time, inside the budget, on land, and out of the view ahead', () => {
  const trees = W.placeForest(20261115, 1);
  const again = W.placeForest(20261115, 1);
  assert.equal(trees.length, again.length);
  assert.deepEqual(trees[100], again[100]);
  assert.ok(trees.length > 600 && trees.length < 1300, 'trees: ' + trees.length);
  let conifers = 0;
  for (const t of trees) {
    assert.ok(W.lakeDistance(t.x, t.z) > 0, 'no tree in the lake');
    assert.ok(t.height > 3 && t.height <= W.TREE_MAX + 1e-9, 'height ' + t.height);
    assert.ok(t.order >= 0 && t.order < 1);
    assert.ok(Math.hypot(t.x, t.z) >= W.FOREST_RANGE.hero, 'none on the ledge');
    // The valley must be seen from the ledge: nothing close in front stands above it.
    if (t.z < 6 && Math.hypot(t.x, t.z) < 75) assert.ok(t.y + t.height <= -4.9, 'a tree at ' + t.x.toFixed(0) + ', ' + t.z.toFixed(0) + ' tops out at ' + (t.y + t.height).toFixed(1));
    if (t.z < 0 && Math.hypot(t.x, t.z) < 75) assert.ok(Math.abs(t.x) >= 9 + 0.22 * -t.z, 'the line to the lake is open');
    for (const c of t.color) assert.ok(c >= 0 && c < 2);
    if (t.conifer) conifers++;
  }
  assert.ok(conifers > 20 && conifers < trees.length / 2, 'some pines among the maples: ' + conifers);
  // Thinning keeps the lowest `order`: any fraction is spread over the whole valley.
  const kept = trees.filter((t) => t.order < 0.5);
  assert.ok(Math.abs(kept.length / trees.length - 0.5) < 0.08);
});

test('the trees by the ledge leave the viewer room, and the big maple is over the left shoulder', () => {
  const maple = W.HERO_TREES[0];
  assert.equal(maple.kind, 'maple');
  assert.ok(maple.x < 0 && maple.z > 0, 'left and a little behind');
  for (const t of W.HERO_TREES) {
    const d = Math.hypot(t.x, t.z);
    assert.ok(d - t.radius > 3, t.kind + ' crown comes no nearer than 3 m (in plan): ' + (d - t.radius).toFixed(1));
    assert.ok(d < 40, t.kind + ' is close by');
    // None stands in the forward view of the valley.
    assert.ok(t.z > 0, t.kind + ' is not in front of the viewer');
  }
});

test('haze: more of it with distance, thickest down by the lake, and none at no distance', () => {
  assert.equal(W.fogAmount(1.6, 0, 0), 0);
  let last = 0;
  for (const d of [10, 50, 200, 800, 3000]) {
    const f = W.fogAmount(1.6, -0.1, d);
    assert.ok(f > last && f <= 1, 'haze at ' + d + ' m: ' + f);
    last = f;
  }
  assert.ok(W.fogAmount(-44, 0, 300) > W.fogAmount(20, 0, 300), 'mist lies low');
  const c = W.toDisplay([0.5, 3, 0]);
  assert.ok(c[0] > 0 && c[0] < 1 && c[1] < 1 && c[2] === 0, 'bright colours roll off below white');
});

test('the terrain mesh: a web of rings inside the budget, level underfoot, and trees can be planted on it', () => {
  const heights = new W.HeightGrid(W.canopyHeight, 600, 96);
  const sun = W.buildSunHeight(heights, 600, 96);
  const t = buildTerrain(sun);
  assert.ok(t.triangles > 4000 && t.triangles < 12000, 'triangles: ' + t.triangles);
  assert.equal(t.position.length, t.triangles * 9);
  assert.equal(t.color.length, t.triangles * 9);
  for (let i = 0; i < t.position.length; i++) assert.ok(Number.isFinite(t.position[i]));
  for (let i = 0; i < t.color.length; i++) assert.ok(t.color[i] >= 0 && Number.isFinite(t.color[i]));
  const { radii, counts } = terrainRings();
  assert.equal(radii[0], 0);
  assert.ok(radii[radii.length - 1] > 1500, 'reaches the horizon');
  assert.ok(Math.max(...counts) <= 96);
  // The exact surface near the viewer: flat on the ledge, and equal to the ideal ground to within the facets.
  const surface = t.surfaceNear(30);
  assert.ok(Math.abs(surface(0.2, 0.1)) < 0.02);
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const a = i * 2.399;
    const r = 0.3 + (i % 37) * 0.3;
    const x = Math.cos(a) * r;
    const z = Math.abs(Math.sin(a) * r) + 0.5; // on the neck of rock behind, away from the cliff
    if (Math.abs(x) > 2) continue;
    worst = Math.max(worst, Math.abs(surface(x, z) - W.ground(x, z)));
  }
  assert.ok(worst < 0.5, 'drawn ground follows the ideal ground: off by at most ' + worst.toFixed(2) + ' m');
  // Further off, trees stand on the mesh, which is within a few metres of the ideal ground
  // (and beyond 235 m is lifted by most of a tree, to stand for the canopy).
  for (const [x, z] of [[60, -90], [-100, -120], [90, -150]]) assert.ok(Math.abs(t.heightAt(x, z) - W.ground(x, z)) < 6, 'at ' + x + ', ' + z);
  for (const [x, z] of [[120, -400], [-300, -350]]) {
    const lift = t.heightAt(x, z) - W.ground(x, z);
    assert.ok(lift > -8 && lift < 0.7 * W.CANOPY + 8, 'far ground at ' + x + ', ' + z + ' is lifted by ' + lift.toFixed(1));
  }
});
