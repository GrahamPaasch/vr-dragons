#!/usr/bin/env node
/**
 * Flies the dragons without drawing anything and reports how it went: how close they came to
 * the ground, the trees, each other and the viewer, how hard they turned, and which lanes they
 * took. Also checks every lane against the land. With --map it draws the flown paths into
 * test-results/flight.png.
 *
 *   node tools/flysim.mjs [minutes] [seed] [--calls] [--map]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';
import * as W from '../src/world.js';
import * as F from '../src/flight.js';
import { DRAGONS } from '../src/dragonGeometry.js';
import { makeRng } from '../src/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const minutes = Number(args[0] || 10);
const seed = Number(args[1] || 20261115);
const calls = process.argv.includes('--calls');
const wantMap = process.argv.includes('--map');

// --- The lanes against the land ---------------------------------------------------------------
console.log('Lanes (length, time, lowest clearance above the flight floor, nearest to the viewer, hardest turn, steepest climb):');
const laneProblems = [];
for (const lane of F.LANES) {
  let worst = Infinity;
  let where = 0;
  let near = Infinity;
  let time = 0;
  let bank = 0;
  let bankAt = 0;
  let climb = 0;
  const p = [0, 0, 0];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let s = 0; s <= lane.length; s += 2) {
    lane.pointAt(s, p);
    const c = p[1] - F.flightFloor(p[0], p[2]);
    if (c < worst) {
      worst = c;
      where = s;
    }
    near = Math.min(near, Math.hypot(p[0] - F.VIEWER[0], p[1] - F.VIEWER[1], p[2] - F.VIEWER[2]));
    time += 2 / lane.speedAt(s);
    // The turn, measured over 16 m of lane, and the bank it takes at the lane's speed.
    if (s >= 8 && s + 8 <= lane.length) {
      lane.pointAt(s - 8, a);
      lane.pointAt(s + 8, b);
      const h0 = Math.atan2(p[0] - a[0], p[2] - a[2]);
      const h1 = Math.atan2(b[0] - p[0], b[2] - p[2]);
      let dh = h1 - h0;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const flat = (Math.hypot(p[0] - a[0], p[2] - a[2]) + Math.hypot(b[0] - p[0], b[2] - p[2])) / 2;
      const v = lane.speedAt(s);
      const need = (Math.atan((v * v * Math.abs(dh)) / (flat * 9.81)) * 180) / Math.PI;
      if (need > bank) {
        bank = need;
        bankAt = s;
      }
      const up = (Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])) * 180) / Math.PI;
      if (up > climb) climb = up;
    }
  }
  lane.pointAt(where, p);
  lane.pointAt(bankAt, a);
  console.log(
    `  ${lane.name.padEnd(11)} ${lane.from.padEnd(3)} -> ${lane.to.padEnd(3)} ${lane.length.toFixed(0).padStart(5)} m ${time.toFixed(0).padStart(3)} s  clear ${worst.toFixed(1).padStart(6)} m at (${p[0].toFixed(0)}, ${p[1].toFixed(0)}, ${p[2].toFixed(0)})  viewer ${near.toFixed(1).padStart(5)} m  bank ${bank.toFixed(0).padStart(2)} deg at (${a[0].toFixed(0)}, ${a[2].toFixed(0)})  climb ${climb.toFixed(0)} deg`
  );
  if (worst < 0) laneProblems.push(`${lane.name}: ${(-worst).toFixed(1)} m under the flight floor`);
  if (bank > 47) laneProblems.push(`${lane.name}: needs a ${bank.toFixed(0)} degree bank at (${a[0].toFixed(0)}, ${a[2].toFixed(0)})`);
  if (lane.tightest < 18) laneProblems.push(`${lane.name}: a turn of only ${lane.tightest.toFixed(0)} m radius`);
  if (climb > 35) laneProblems.push(`${lane.name}: climbs at ${climb.toFixed(0)} degrees`);
}
if (laneProblems.length) console.log('  PROBLEMS:\n    ' + laneProblems.join('\n    '));

// --- Fly ---------------------------------------------------------------------------------------
const builds = DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale }));
const director = new F.Director(builds, seed);
const trees = W.placeForest(20261115, 1);
const dt = 1 / 72;
const steps = Math.round(minutes * 60 * 72);
const rng = makeRng(seed + 99);
let nextCall = 20 + rng() * 20;
const stats = {
  minFloor: Infinity, minGround: Infinity, minViewer: Infinity, minSep: Infinity, maxBank: 0, maxBankRate: 0, maxOmega: 0,
  maxSpeed: 0, minSpeed: Infinity, treeHits: 0, floorHits: 0, callsMade: 0, callsAnswered: 0, passes: 0, beats: 0, roars: 0,
  flapTime: 0, glideTime: 0, nearTime: 0, midTime: 0, farTime: 0, maxLag: 0, frontTime: 0, maxOffTight: 0,
};
const lanesFlown = {};
const trail = [[], []];
let lastLane = '';
const where = {};
const tmp = [0, 0, 0];
for (let n = 0; n < steps; n++) {
  if (calls && director.time > nextCall) {
    stats.callsMade++;
    if (director.call() >= 0) stats.callsAnswered++;
    nextCall = director.time + 8 + rng() * 45;
  }
  director.step(dt);
  for (const e of director.drain()) {
    if (e.type === 'beat') stats.beats++;
    if (e.type === 'roar') stats.roars++;
    if (e.type === 'pass') stats.passes++;
  }
  const lane = director.find(director.center).lane.name;
  if (lane !== lastLane) {
    lanesFlown[lane] = (lanesFlown[lane] || 0) + 1;
    lastLane = lane;
  }
  if (director.separation < stats.minSep) {
    stats.minSep = director.separation;
    where.sep = `${lane} t=${director.time.toFixed(1)}s mode=${director.mode.name} (${director.mode.t.toFixed(1)}s) gap=${director.gap.toFixed(1)} jobs=${director.jobs.map((j) => (j ? j.phase : '-')).join('/')}`;
  }
  for (let i = 0; i < 2; i++) {
    const f = director.flyers[i];
    const floor = f.y - F.flightFloor(f.x, f.z);
    if (floor < stats.minFloor) {
      stats.minFloor = floor;
      where.floor = `${lane} (${f.x.toFixed(0)}, ${f.y.toFixed(0)}, ${f.z.toFixed(0)}) t=${director.time.toFixed(0)}s job=${director.jobs[i] ? director.jobs[i].phase : '-'}`;
    }
    const overWater = W.lakeDistance(f.x, f.z) < 0;
    const g = f.y - (overWater ? W.LAKE_LEVEL : W.ground(f.x, f.z));
    stats.minGround = Math.min(stats.minGround, g);
    const v = Math.hypot(f.x - F.VIEWER[0], f.y - F.VIEWER[1], f.z - F.VIEWER[2]);
    if (v < stats.minViewer) {
      stats.minViewer = v;
      where.viewer = `${lane} t=${director.time.toFixed(0)}s job=${director.jobs[i] ? director.jobs[i].phase : '-'}`;
    }
    stats.maxBank = Math.max(stats.maxBank, Math.abs(f.bank));
    stats.maxBankRate = Math.max(stats.maxBankRate, Math.abs(f.bankRate));
    stats.maxOmega = Math.max(stats.maxOmega, Math.abs(f.omega));
    stats.maxSpeed = Math.max(stats.maxSpeed, f.speed);
    stats.minSpeed = Math.min(stats.minSpeed, f.speed);
    if (f.power > 0.2) stats.flapTime += dt;
    else stats.glideTime += dt;
    if (v < 40) stats.nearTime += dt;
    else if (v < 160) stats.midTime += dt;
    else stats.farTime += dt;
    if (f.z < 0 && Math.abs(Math.atan2(f.x, -f.z)) < 0.9) stats.frontTime += dt;
    if (director.on[i]) {
      const should = director.center + (i === 0 ? 0.5 : -0.5) * director.gap;
      stats.maxLag = Math.max(stats.maxLag, should - director.along[i]);
      // How far off the lane, sideways and up/down, counting what the pair's figure asks for.
      director.pointAt(director.along[i], tmp);
      const off = Math.hypot(tmp[0] - f.x, tmp[1] - f.y, tmp[2] - f.z);
      const asked = Math.hypot(director.offsets[i * 2] + director.standOff[i * 2], director.offsets[i * 2 + 1] + director.standOff[i * 2 + 1]);
      if (director.tightAt(director.along[i]) > 0.5 && off - asked > stats.maxOffTight) {
        stats.maxOffTight = off - asked;
        where.off = `${lane} (${f.x.toFixed(0)}, ${f.y.toFixed(0)}, ${f.z.toFixed(0)}) v=${f.speed.toFixed(0)} t=${director.time.toFixed(0)}s`;
      }
    }
    if (n % 6 === 0) {
      // Trees: is the body inside a crown?
      for (const t of trees) {
        const d = Math.hypot(f.x - t.x, f.z - t.z);
        if (d < t.radius + 1.5 && f.y < t.y + t.height + 1 && f.y > t.y) {
          stats.treeHits++;
          where.tree = `${lane} (${f.x.toFixed(0)}, ${f.y.toFixed(0)}, ${f.z.toFixed(0)}) tree top ${(t.y + t.height).toFixed(0)}`;
          break;
        }
      }
    }
    if (n % 9 === 0) trail[i].push(f.x, f.z, f.y);
  }
}
stats.floorHits = director.flyers[0].floorHits + director.flyers[1].floorHits;
const total = minutes * 60 * 2;
const pct = (t) => ((100 * t) / total).toFixed(0) + '%';
console.log(`\nFlew ${minutes} min, seed ${seed}${calls ? ', with calls' : ''}:`);
console.log(`  lowest above the flight floor ${stats.minFloor.toFixed(1)} m  [${where.floor}]`);
console.log(`  lowest above ground or water  ${stats.minGround.toFixed(1)} m; steps well under the floor ${stats.floorHits} (deepest ${Math.max(director.flyers[0].deepest, director.flyers[1].deepest).toFixed(1)} m); bodies inside a tree crown ${stats.treeHits}${where.tree ? '  [' + where.tree + ']' : ''}`);
console.log(`  nearest to the viewer ${stats.minViewer.toFixed(1)} m  [${where.viewer}]; nearest to each other ${stats.minSep.toFixed(1)} m  [${where.sep}]`);
console.log(`  speed ${stats.minSpeed.toFixed(1)} .. ${stats.maxSpeed.toFixed(1)} m/s; steepest bank ${((stats.maxBank * 180) / Math.PI).toFixed(0)} deg; fastest roll ${((stats.maxBankRate * 180) / Math.PI).toFixed(0)} deg/s; fastest turn ${((stats.maxOmega * 180) / Math.PI).toFixed(0)} deg/s`);
console.log(`  beating ${pct(stats.flapTime)}, gliding ${pct(stats.glideTime)}; wingbeats ${stats.beats}; roars ${stats.roars}`);
console.log(`  within 40 m ${pct(stats.nearTime)}, 40-160 m ${pct(stats.midTime)}, beyond ${pct(stats.farTime)}; in the forward view ${pct(stats.frontTime)}`);
console.log(`  furthest behind its place in the pair ${stats.maxLag.toFixed(0)} m; furthest off the lane in a tight place ${stats.maxOffTight.toFixed(1)} m${where.off ? '  [' + where.off + ']' : ''}`);
if (calls) console.log(`  calls ${stats.callsMade}, answered ${stats.callsAnswered}, passes ${stats.passes}`);
console.log('  lanes: ' + Object.entries(lanesFlown).map(([k, v]) => `${k} x${v}`).join(', '));

if (wantMap) {
  const half = 420;
  const size = 840;
  const px = new Uint8Array(size * size * 4);
  const scale = (2 * half) / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -half + (i + 0.5) * scale;
      const z = -half + (j + 0.5) * scale;
      const h = W.ground(x, z);
      const k = (j * size + i) * 4;
      const t = Math.max(0, Math.min(1, (h - W.LAKE_LEVEL) / 100));
      let r = 70 + 150 * t;
      let g = 90 + 110 * t;
      let b = 60 + 70 * t;
      if (W.forestDensity(x, z) > 0.5) {
        r *= 0.72;
        g *= 0.62;
        b *= 0.5;
      }
      if (W.lakeDistance(x, z) < 0) {
        r = 50;
        g = 95;
        b = 150;
      }
      px[k] = r;
      px[k + 1] = g;
      px[k + 2] = b;
      px[k + 3] = 255;
    }
  }
  const dot = (x, z, c, rad) => {
    const cx = Math.round((x + half) / scale);
    const cy = Math.round((z + half) / scale);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const i = cx + dx;
        const j = cy + dy;
        if (i < 0 || j < 0 || i >= size || j >= size) continue;
        const k = (j * size + i) * 4;
        px[k] = c[0];
        px[k + 1] = c[1];
        px[k + 2] = c[2];
      }
    }
  };
  // Height as brightness: low dark, high bright.
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < trail[i].length; k += 3) {
      const v = Math.max(0.25, Math.min(1, (trail[i][k + 2] + 50) / 90));
      dot(trail[i][k], trail[i][k + 1], i === 0 ? [255 * v, 60 * v, 40 * v] : [40 * v, 220 * v, 255 * v], 0);
    }
  }
  const p = [0, 0, 0];
  for (const lane of F.LANES) for (let s = 0; s < lane.length; s += 6) dot(lane.pointAt(s, p)[0], p[2], [255, 255, 255], 0);
  dot(0, 0, [255, 255, 0], 3);
  await mkdir(path.join(ROOT, 'test-results'), { recursive: true });
  await writeFile(path.join(ROOT, 'test-results', 'flight.png'), encodePng(size, size, px));
  console.log('  map: test-results/flight.png');
}
