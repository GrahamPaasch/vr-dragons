#!/usr/bin/env node
/**
 * Draws the valley from above into test-results/map.png: heights as shading with contour lines,
 * the lake, the forest, the two gaps and (when flight.js exists) the dragons' lanes. For design
 * work: it is how the terrain and the lanes were tuned against each other.
 *
 *   node tools/map.mjs [halfWidthMetres] [pixels]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';
import * as W from '../src/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const half = Number(process.argv[2] || 480);
const size = Number(process.argv[3] || 960);
const px = new Uint8Array(size * size * 4);
const scale = (2 * half) / size;
const toPx = (x, z) => [Math.round((x + half) / scale), Math.round((z + half) / scale)];

const t0 = performance.now();
let min = Infinity;
let max = -Infinity;
const hs = new Float32Array(size * size);
for (let j = 0; j < size; j++) {
  for (let i = 0; i < size; i++) {
    const h = W.ground(-half + (i + 0.5) * scale, -half + (j + 0.5) * scale);
    hs[j * size + i] = h;
    if (h < min) min = h;
    if (h > max) max = h;
  }
}
const groundMs = performance.now() - t0;

for (let j = 0; j < size; j++) {
  for (let i = 0; i < size; i++) {
    const x = -half + (i + 0.5) * scale;
    const z = -half + (j + 0.5) * scale;
    const h = hs[j * size + i];
    const k = (j * size + i) * 4;
    // Light from the sun's side.
    const hx = hs[j * size + Math.min(i + 1, size - 1)] - hs[j * size + Math.max(i - 1, 0)];
    const hz = hs[Math.min(j + 1, size - 1) * size + i] - hs[Math.max(j - 1, 0) * size + i];
    const shade = 0.75 + 0.9 * ((hx * W.SUN_DIR[0] + hz * W.SUN_DIR[2]) / (2 * scale)) * -1 * 0.5;
    const t = (h - W.LAKE_LEVEL) / (max - W.LAKE_LEVEL);
    let r = 90 + 140 * t;
    let g = 120 + 90 * t;
    let b = 70 + 60 * t;
    const f = W.forestDensity(x, z);
    if (f > 0.5) {
      r *= 0.8;
      g *= 0.62;
      b *= 0.5;
    }
    if (W.lakeDistance(x, z) < 0) {
      r = 60;
      g = 110;
      b = 170;
    }
    const s = Math.max(0.35, Math.min(1.3, shade));
    // Contours every 10 m.
    const c = Math.abs(h / 10 - Math.round(h / 10)) * 10 < 0.35 * Math.max(1, Math.hypot(hx, hz) / (2 * scale)) * scale ? 0.6 : 1;
    px[k] = Math.min(255, r * s * c);
    px[k + 1] = Math.min(255, g * s * c);
    px[k + 2] = Math.min(255, b * s * c);
    px[k + 3] = 255;
  }
}

function dot(x, z, rad, color) {
  const [cx, cy] = toPx(x, z);
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const i = cx + dx;
      const j = cy + dy;
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      const k = (j * size + i) * 4;
      px[k] = color[0];
      px[k + 1] = color[1];
      px[k + 2] = color[2];
    }
  }
}
function line(ax, az, bx, bz, color, rad) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / scale) + 1;
  for (let i = 0; i <= n; i++) dot(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, rad || 0, color);
}

const t1 = performance.now();
const trees = W.placeForest(20261115, 1);
const forestMs = performance.now() - t1;
const lin = (c) => Math.round(255 * Math.pow(Math.min(c, 1), 1 / 2.2));
for (const tree of trees) dot(tree.x, tree.z, tree.lod === W.LOD.MID ? 1 : 1, [lin(tree.color[0]), lin(tree.color[1]), lin(tree.color[2])]);
for (let i = 0; i + 1 < W.GORGE.length; i++) line(W.GORGE[i][0], W.GORGE[i][1], W.GORGE[i + 1][0], W.GORGE[i + 1][1], [80, 200, 255]);
for (let i = 0; i + 1 < W.MEADOW.length; i++) line(W.MEADOW[i][0], W.MEADOW[i][1], W.MEADOW[i + 1][0], W.MEADOW[i + 1][1], [255, 255, 120]);

// The viewer, and the way they face at the start.
dot(0, 0, 4, [255, 255, 255]);
line(0, 0, 0, -40, [255, 255, 255]);
// Toward the sun.
line(0, 0, W.SUN_DIR[0] * 120, W.SUN_DIR[2] * 120, [255, 220, 0]);

let lanes = 0;
try {
  const F = await import('../src/flight.js');
  if (F.LANES) {
    const colors = [[255, 80, 80], [255, 160, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255], [120, 255, 120], [160, 120, 255], [255, 120, 200], [200, 200, 80], [90, 90, 255]];
    F.LANES.forEach((lane, n) => {
      const c = colors[n % colors.length];
      for (let s = 0; s < lane.length; s += 2) {
        const p = lane.pointAt(s, [0, 0, 0]);
        dot(p[0], p[2], 0, c);
      }
      lanes++;
    });
  }
} catch (err) {
  if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
const file = path.join(ROOT, 'test-results', 'map.png');
await writeFile(file, encodePng(size, size, px));
const mid = trees.filter((t) => t.lod === W.LOD.MID).length;
console.log(`map: ${file}`);
console.log(`heights ${min.toFixed(1)} .. ${max.toFixed(1)} m; ground() ${((groundMs / (size * size)) * 1000).toFixed(2)} us per call`);
console.log(`forest: ${trees.length} trees (${mid} mid, ${trees.length - mid} far), placed in ${forestMs.toFixed(0)} ms; lanes drawn: ${lanes}`);
console.log(`ledge: ground(0,0)=${W.ground(0, 0).toFixed(2)}, 4 m ahead ${W.ground(0, -4).toFixed(2)}, 8 m ahead ${W.ground(0, -8).toFixed(2)}, 20 m ahead ${W.ground(0, -20).toFixed(2)}, 60 m ahead ${W.ground(0, -60).toFixed(2)}`);
