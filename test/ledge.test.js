import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/world.js';
import { buildLedge, buildGrove } from '../src/ledge.js';
import { buildTerrain } from '../src/terrain.js';
import { MeshBuilder, icosphere } from '../src/meshbuilder.js';

const heights = new W.HeightGrid(W.canopyHeight, 600, 96);
const terrain = buildTerrain(W.buildSunHeight(heights, 600, 96));
const surface = terrain.surfaceNear(40);
const ledge = buildLedge(surface, 20261115);

test('the mesh builder: flat-shaded triangles with outward normals', () => {
  const m = new MeshBuilder();
  m.tri([0, 0, 0], [1, 0, 0], [0, 0, -1], [1, 0, 0]);
  assert.equal(m.triangleCount, 1);
  assert.ok(Math.abs(m.normal[0]) < 1e-12 && m.normal[1] === 1 && Math.abs(m.normal[2]) < 1e-12, 'counter-clockwise from above faces up');
  m.tri([0, 0, 0], [0, 0, 0], [1, 1, 1], [1, 1, 1]);
  assert.equal(m.triangleCount, 1, 'a triangle with no area is left out');
  const ball = new MeshBuilder().blob([0, 0, 0], [1, 1, 1], 1, 0, 3, [1, 1, 1]);
  assert.equal(ball.triangleCount, 80);
  for (let i = 0; i < ball.vertexCount; i++) {
    const dot = ball.position[i * 3] * ball.normal[i * 3] + ball.position[i * 3 + 1] * ball.normal[i * 3 + 1] + ball.position[i * 3 + 2] * ball.normal[i * 3 + 2];
    assert.ok(dot > 0.5, 'the faces of a ball point outward');
  }
  assert.equal(icosphere(0).faces.length, 20);
  assert.equal(icosphere(2).faces.length, 320);
  const tube = new MeshBuilder().tube([{ p: [0, 0, 0], r: 1 }, { p: [0, 3, 0], r: 1 }], 6, [1, 1, 1], [0, 0, 0, 0]);
  assert.equal(tube.triangleCount, 12);
  for (let i = 0; i < tube.vertexCount; i++) {
    const dot = tube.position[i * 3] * tube.normal[i * 3] + tube.position[i * 3 + 2] * tube.normal[i * 3 + 2];
    assert.ok(dot > 0.5, 'the sides of a trunk point outward');
  }
});

test('the ledge mesh: seven trees, boulders and fallen leaves inside a small budget', () => {
  const a = ledge.arrays;
  assert.equal(ledge.trees.length, W.HERO_TREES.length);
  assert.ok(a.triangles > 2500 && a.triangles < 8000, 'triangles: ' + a.triangles);
  assert.ok(ledge.litter > 120, 'fallen leaves: ' + ledge.litter);
  for (let i = 0; i < a.position.length; i++) assert.ok(Number.isFinite(a.position[i]));
  for (let i = 0; i < a.color.length; i++) assert.ok(a.color[i] >= 0 && a.color[i] < 4);
});

test('every tree by the ledge stays inside the cylinder the dragons keep clear of', () => {
  // flight.js keeps the dragons out of (radius, height) round each of world.HERO_TREES: the
  // drawn leaves must not reach outside it. Leaves are the vertices with aux.y = 1 that sway.
  const a = ledge.arrays;
  const worst = W.HERO_TREES.map(() => ({ out: -Infinity, top: -Infinity, n: 0 }));
  for (let i = 0; i < a.vertices; i++) {
    const leaf = a.aux[i * 4 + 1] === 1 && a.aux[i * 4] > 0;
    if (!leaf) continue;
    const x = a.position[i * 3];
    const y = a.position[i * 3 + 1];
    const z = a.position[i * 3 + 2];
    // Which tree is this leaf on? The nearest one.
    let k = 0;
    let best = Infinity;
    W.HERO_TREES.forEach((t, j) => {
      const d = Math.hypot(x - t.x, z - t.z) - t.radius;
      if (d < best) {
        best = d;
        k = j;
      }
    });
    worst[k].out = Math.max(worst[k].out, best);
    worst[k].top = Math.max(worst[k].top, y - W.HERO_TREES[k].height);
    worst[k].n++;
  }
  W.HERO_TREES.forEach((t, k) => {
    assert.ok(worst[k].n > 50, t.kind + ' has leaves: ' + worst[k].n + ' vertices');
    // Lumps are bumpy: a facet may poke out by a hand's breadth, no more.
    assert.ok(worst[k].out < 0.9, t.kind + ' reaches ' + worst[k].out.toFixed(2) + ' m outside its radius');
    assert.ok(worst[k].top < 0.9, t.kind + ' reaches ' + worst[k].top.toFixed(2) + ' m above its height');
  });
});

test('the big trees by the creek: one small mesh, every crown inside the cylinder the dragons keep clear of', () => {
  const grove = buildGrove(terrain.heightAt, 20261115);
  const a = grove.arrays;
  assert.equal(grove.trees.length, W.GROVE.length);
  assert.ok(a.triangles > 1500 && a.triangles < 3200, 'triangles: ' + a.triangles);
  for (let i = 0; i < a.position.length; i++) assert.ok(Number.isFinite(a.position[i]));
  const worst = W.GROVE.map(() => ({ out: -Infinity, top: -Infinity, low: Infinity, n: 0 }));
  for (let i = 0; i < a.vertices; i++) {
    if (!(a.aux[i * 4 + 1] === 1 && a.aux[i * 4] > 0)) continue; // leaves only
    const x = a.position[i * 3];
    const y = a.position[i * 3 + 1];
    const z = a.position[i * 3 + 2];
    let k = 0;
    let best = Infinity;
    W.GROVE.forEach((t, j) => {
      const d = Math.hypot(x - t.x, z - t.z) - t.radius;
      if (d < best) {
        best = d;
        k = j;
      }
    });
    worst[k].out = Math.max(worst[k].out, best);
    worst[k].top = Math.max(worst[k].top, y - W.GROVE[k].height);
    worst[k].low = Math.min(worst[k].low, y);
    worst[k].n++;
  }
  W.GROVE.forEach((t, k) => {
    assert.ok(worst[k].n > 30, t.kind + ' has leaves: ' + worst[k].n + ' vertices');
    assert.ok(worst[k].out < 1.2, t.kind + ' reaches ' + worst[k].out.toFixed(2) + ' m outside its radius');
    assert.ok(worst[k].top < 1.2, t.kind + ' reaches ' + worst[k].top.toFixed(2) + ' m above its height');
    // The crown is high on the trunk: the gorge lane passes beneath it, 12 m over the creek.
    assert.ok(worst[k].low > W.ground(t.x, t.z) + 8, t.kind + ': the lowest leaves are ' + (worst[k].low - W.ground(t.x, t.z)).toFixed(1) + ' m up');
  });
});

test('a crown that sways stays closed: where faces meet, they sway by the same amount', () => {
  // How far a vertex sways is in aux.x. Faces are flat-shaded, so every corner is stored once
  // per face; if two faces gave the same corner different amounts, the wind would open a
  // crack between them and the background would show through as a hairline.
  const ball = new MeshBuilder().blob([0, 10, 0], [3, 2, 3], 0, 0.2, 5, [1, 1, 1], (dir) => [0.1 + 0.2 * dir[1], 1, 0, 0.5]);
  const grove = buildGrove(terrain.heightAt, 20261115);
  for (const [name, a] of [['a ball', ball.arrays()], ['the trees by the ledge', ledge.arrays], ['the big trees by the creek', grove.arrays]]) {
    const at = new Map();
    let shared = 0;
    let worst = 0;
    for (let i = 0; i < a.vertices; i++) {
      if (a.aux[i * 4 + 1] !== 1) continue; // leaves only: bark is checked by eye, ring by ring
      const key = a.position[i * 3] + ',' + a.position[i * 3 + 1] + ',' + a.position[i * 3 + 2];
      const sway = a.aux[i * 4];
      if (at.has(key)) {
        shared++;
        worst = Math.max(worst, Math.abs(at.get(key) - sway));
      } else {
        at.set(key, sway);
      }
    }
    assert.ok(shared > 30, name + ': corners shared between faces: ' + shared);
    assert.ok(worst < 1e-6, name + ': faces that meet differ in sway by ' + worst.toFixed(4) + ' m');
  }
});

test('no leaf or branch hangs where the viewer stands or in the view over the valley', () => {
  const a = ledge.arrays;
  for (let i = 0; i < a.vertices; i++) {
    const x = a.position[i * 3];
    const y = a.position[i * 3 + 1];
    const z = a.position[i * 3 + 2];
    // A cylinder of free air round the viewer, to well above head height.
    if (Math.hypot(x, z) < 1.2) assert.ok(y < 0.25 || y > 5, 'something at head height over the viewer: ' + [x, y, z].map((v) => v.toFixed(2)));
    // And nothing tall in front.
    if (z < -0.5 && Math.hypot(x, z) < 12) assert.ok(y < 1.1, 'something in the view ahead: ' + [x, y, z].map((v) => v.toFixed(2)));
  }
});

test('fallen leaves lie on the drawn rock, not in it and not floating over it', () => {
  const a = ledge.arrays;
  let checked = 0;
  // The litter is the last thing built: the flat leaf vertices (aux.y = 1, no sway) close to the viewer.
  for (let i = 0; i < a.vertices; i++) {
    if (a.aux[i * 4 + 1] !== 1 || a.aux[i * 4] !== 0) continue;
    const x = a.position[i * 3];
    const y = a.position[i * 3 + 1];
    const z = a.position[i * 3 + 2];
    const over = y - surface(x, z);
    assert.ok(over > 0.005 && over < 0.06, 'a leaf ' + over.toFixed(3) + ' m over the rock at ' + x.toFixed(2) + ', ' + z.toFixed(2));
    checked++;
  }
  assert.ok(checked >= 120 * 6, 'leaf vertices checked: ' + checked);
});
