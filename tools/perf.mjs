#!/usr/bin/env node
/**
 * Counts what the page asks the graphics chip to do: draw calls and triangles per frame, on a
 * flat screen and for both eyes of an emulated Oculus Quest 1, over several minutes of flight
 * and with the head turned every way. Also what is in the scene, and how long the page's own
 * work takes per frame on this machine.
 *
 *   npm run perf                 the table
 *   npm run perf -- --json       the same as JSON (for keeping a record)
 *   PERF_SECONDS=600 npm run perf     a longer flight (default 240 s)
 *
 * What this cannot tell: frames a second on the real headset. Headless Chromium draws in
 * software here. The counts are exact, though, and they are what the Quest 1 budget is about;
 * the page itself reports the real frame rate after each VR session (README, "On the headset").
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IWER = path.join(ROOT, 'node_modules', 'iwer', 'build', 'iwer.min.js');
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SECONDS = Number(process.env.PERF_SECONDS || 240);
const asJson = process.argv.includes('--json');

/** The brief's budget for the Quest 1. */
const BUDGET = { calls: 150, triangles: 100000 };

/** Runs in the page: fly `seconds`, drawing a frame every `every` seconds, and count. */
async function measure({ seconds, every, mode, xr }) {
  const d = window.__dragons;
  d.setFlatShot();
  d.seek(0);
  const info = d.stage.renderer.info.render;
  const wait = (n) =>
    new Promise((resolve) => {
      const start = info.frame;
      const tick = () => (info.frame >= start + n ? resolve() : setTimeout(tick, 2));
      tick();
    });
  const q = new d.THREE.Quaternion();
  const e = new d.THREE.Euler(0, 0, 0, 'YXZ');
  const look = (yaw, pitch) => {
    if (xr) {
      e.set(pitch, yaw, 0, 'YXZ');
      q.setFromEuler(e);
      window.__xrDevice.quaternion.set(q.x, q.y, q.z, q.w);
    } else {
      d.view.set(yaw, pitch);
    }
  };
  const calls = [];
  const triangles = [];
  let worst = { calls: 0, triangles: 0, at: 0, yaw: 0, pitch: 0, lane: '' };
  let n = 0;
  for (let t = 0; t < seconds; t += every) {
    d.fly(every);
    const f = d.director.flyers;
    let yaw;
    let pitch;
    if (mode === 'follow') {
      // Toward the nearer dragon.
      const k = Math.hypot(f[0].x, f[0].y, f[0].z) < Math.hypot(f[1].x, f[1].y, f[1].z) ? 0 : 1;
      yaw = Math.atan2(-f[k].x, -f[k].z);
      pitch = Math.atan2(f[k].y - 1.62, Math.hypot(f[k].x, f[k].z));
    } else {
      // Round and round, nodding: every direction a head can face.
      yaw = (n * 37 * Math.PI) / 180;
      pitch = ((((n * 17) % 100) - 50) * Math.PI) / 180;
    }
    look(yaw, pitch);
    await wait(2);
    calls.push(info.calls);
    triangles.push(info.triangles);
    if (info.triangles > worst.triangles) worst = { calls: info.calls, triangles: info.triangles, at: t, yaw: Math.round((yaw * 180) / Math.PI) % 360, pitch: Math.round((pitch * 180) / Math.PI), lane: d.director.find(d.director.center).lane.name };
    n++;
  }
  const stat = (list) => {
    const sorted = list.slice().sort((a, b) => a - b);
    return { mean: list.reduce((a, b) => a + b, 0) / list.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] };
  };
  return { frames: n, calls: stat(calls), triangles: stat(triangles), worst };
}

/** Runs in the page: what the scene is made of, and the cost of the page's own work per frame. */
async function inventory() {
  const d = window.__dragons;
  d.setFlatShot();
  const meshes = [];
  d.stage.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const perInstance = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const instances = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
    meshes.push({ triangles: perInstance * instances, instances, visible: o.visible, instanced: instances > 1 || !!o.isInstancedMesh });
  });
  const forest = d.stage.forest.reduce((a, m) => a + m.count, 0);
  const forestTriangles = d.stage.forest.reduce((a, m) => a + (m.count * m.geometry.attributes.position.count) / 3, 0);
  // The page's own work for one frame, timed over many: flying, posing, and handing the frame to WebGL.
  d.seek(20);
  const time = (fn, n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    return (performance.now() - t0) / n;
  };
  const flyMs = time(() => d.director.step(1 / 72), 2000);
  d.director.drain();
  const poseMs = time((i) => d.dragons.forEach((x, k) => x.update(d.director.flyers[k], i / 72, 1 / 72)), 2000);
  const drawMs = time(() => d.stage.render(), 200);
  return {
    meshes: meshes.length,
    drawCallsIfNothingWereCulled: meshes.length,
    trianglesIfNothingWereCulled: Math.round(meshes.reduce((a, m) => a + m.triangles, 0)),
    trees: forest,
    forestMeshes: d.stage.forest.length,
    forestTriangles: Math.round(forestTriangles),
    terrainTriangles: d.stage.terrain.triangles,
    ledgeTriangles: d.stage.ledgeTriangles,
    dragonTriangles: d.dragons.map((x) => x.triangles),
    leaves: d.stage.leaves.geometry.instanceCount,
    waterTriangles: d.stage.water.geometry.attributes.position.count / 3,
    textures: d.stage.renderer.info.memory.textures,
    geometries: d.stage.renderer.info.memory.geometries,
    programs: d.stage.renderer.info.programs.length,
    buildMs: Math.round(d.buildMs),
    flyMs,
    poseMs,
    drawMs,
  };
}

const { server, url } = await listen({});
let browser;
const out = { seconds: SECONDS, budget: BUDGET };
try {
  try {
    browser = await chromium.launch({ args: GL_ARGS });
  } catch (err) {
    browser = await chromium.launch({ channel: 'chrome', args: GL_ARGS });
  }
  const problems = [];
  const watch = (page) => {
    page.on('pageerror', (e) => problems.push('page error: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('console.error: ' + m.text());
    });
  };

  // Flat: one eye, a laptop-shaped picture with a wide lens (wider than either eye of the headset).
  const flat = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(flat);
  await flat.goto(url + '?shots=1&seed=20261115', { waitUntil: 'load' });
  await flat.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 60000 });
  out.inventory = await flat.evaluate(inventory);
  out.flatFollow = await flat.evaluate(measure, { seconds: SECONDS, every: 0.5, mode: 'follow', xr: false });
  out.flatSweep = await flat.evaluate(measure, { seconds: SECONDS, every: 0.5, mode: 'sweep', xr: false });
  await flat.close();

  // The headset: both eyes, drawn the way the Quest 1 asks for them.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const vr = await context.newPage();
  watch(vr);
  await vr.addInitScript({ path: IWER });
  await vr.addInitScript(() => {
    /* global IWER */
    const device = new IWER.XRDevice(IWER.oculusQuest1, { stereoEnabled: true });
    device.installRuntime({ forceInstall: true });
    device.position.set(0, 1.62, 0);
    window.__xrDevice = device;
  });
  await vr.goto(url + '?seed=20261115', { waitUntil: 'load' });
  await vr.waitForFunction(() => window.__dragons && window.__dragons.ready && !window.__dragons.state.vr.checking, null, { timeout: 60000 });
  await vr.click('#enterVR');
  await vr.waitForFunction(() => window.__dragons.state.vr.presenting, null, { timeout: 15000 });
  out.vr = await vr.evaluate(() => {
    const d = window.__dragons;
    const cam = d.stage.renderer.xr.getCamera().cameras[0];
    return { eyes: d.stage.renderer.xr.getCamera().cameras.length, viewport: [cam.viewport.z, cam.viewport.w], renderPath: d.xr.renderPath };
  });
  out.vrFollow = await vr.evaluate(measure, { seconds: SECONDS, every: 0.5, mode: 'follow', xr: true });
  out.vrSweep = await vr.evaluate(measure, { seconds: SECONDS, every: 0.5, mode: 'sweep', xr: true });
  await context.close();
  out.problems = problems;
} finally {
  if (browser) await browser.close();
  server.close();
}

const worstCalls = Math.max(out.vrFollow.calls.max, out.vrSweep.calls.max);
const worstTriangles = Math.max(out.vrFollow.triangles.max, out.vrSweep.triangles.max);
out.verdict = { worstCallsBothEyes: worstCalls, worstTrianglesBothEyes: worstTriangles, insideBudget: worstCalls < BUDGET.calls };

if (asJson) {
  console.log(JSON.stringify(out, null, 1));
} else {
  const i = out.inventory;
  const pad = (v, n) => String(v).padStart(n);
  console.log(`What is in the scene`);
  console.log(`  ${i.meshes} meshes (one draw call each when in view): terrain, lake, sky, sun, clouds, ${i.forestMeshes} forest batches, the ledge, the leaves, 2 dragons and their 2 mirror images`);
  console.log(`  forest   ${pad(i.trees, 6)} trees, instanced, ${i.forestTriangles} triangles in all`);
  console.log(`  terrain  ${pad(i.terrainTriangles, 6)} triangles (lit once at start, not per frame)`);
  console.log(`  ledge    ${pad(i.ledgeTriangles, 6)} triangles (7 trees close by, boulders, fallen leaves)`);
  console.log(`  dragons  ${pad(i.dragonTriangles.join(' + '), 6)} triangles, 24 bones each, posed in the vertex shader`);
  console.log(`  leaves   ${pad(i.leaves, 6)} in the air, one instanced draw call, animated in the vertex shader`);
  console.log(`  lake     ${pad(i.waterTriangles, 6)} triangles; its mirror image is a 256 x 256 texture worked out at start`);
  console.log(`  textures ${i.textures}, shader programs ${i.programs}, no shadow maps, no render-to-texture, no post-processing`);
  console.log(`  everything at once, nothing culled: ${i.drawCallsIfNothingWereCulled} draw calls, ${i.trianglesIfNothingWereCulled} triangles\n`);
  console.log(`Per frame over ${out.seconds} s of flight (a frame every half second)`);
  console.log(`                                        draw calls            triangles`);
  console.log(`                                        mean   95%   max      mean     95%     max`);
  const row = (label, m) =>
    console.log(`  ${label.padEnd(36)} ${pad(m.calls.mean.toFixed(1), 5)} ${pad(m.calls.p95, 5)} ${pad(m.calls.max, 5)}   ${pad(Math.round(m.triangles.mean), 7)} ${pad(m.triangles.p95, 7)} ${pad(m.triangles.max, 7)}`);
  row('flat, watching the dragons', out.flatFollow);
  row('flat, looking every way', out.flatSweep);
  row('Quest 1, both eyes, watching', out.vrFollow);
  row('Quest 1, both eyes, every way', out.vrSweep);
  const w = out.vrSweep.triangles.max >= out.vrFollow.triangles.max ? out.vrSweep.worst : out.vrFollow.worst;
  console.log(`\n  Emulated Quest 1: ${out.vr.eyes} eyes of ${out.vr.viewport[0]} x ${out.vr.viewport[1]}, drawn through ${out.vr.renderPath}.`);
  console.log(`  Heaviest frame: ${w.calls} draw calls, ${w.triangles} triangles for both eyes (${w.at} s in, lane '${w.lane}', looking ${w.yaw} deg left, ${w.pitch} deg up).`);
  console.log(`  Budget: under ${BUDGET.calls} draw calls. Worst seen: ${worstCalls} for both eyes, ${Math.round(worstCalls / 2)} an eye. ${out.verdict.insideBudget ? 'Inside it.' : 'OVER IT.'}`);
  console.log(`\nThe page's own work per frame, on this machine (a Quest 1 is several times slower)`);
  console.log(`  flying both dragons ${i.flyMs.toFixed(3)} ms, posing both skeletons ${i.poseMs.toFixed(3)} ms, handing a frame to WebGL ${i.drawMs.toFixed(2)} ms (software drawing here); a 72 Hz frame has 13.9 ms`);
  console.log(`  building the valley at start: ${i.buildMs} ms`);
  if (out.problems.length) console.log('\nPROBLEMS:\n  ' + out.problems.join('\n  '));
}
if (!out.verdict.insideBudget || out.problems.length) process.exitCode = 1;
