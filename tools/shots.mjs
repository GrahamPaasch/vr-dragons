#!/usr/bin/env node
/**
 * Takes pictures of the scene from the ledge, for looking at the work without a headset.
 *
 *   node tools/shots.mjs                         the standard set into test-results/
 *   node tools/shots.mjs name yawDeg pitchDeg [fov] [simSeconds]   one picture
 *
 * yaw: degrees to the LEFT of straight ahead. pitch: degrees up.
 * SHOTS_EYE=x,y,z puts the camera somewhere else than on the ledge (to look at the ledge itself).
 * SHOTS_GPU=1 uses the machine's GPU instead of the software renderer (faster, same picture).
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
const GL_ARGS = process.env.SHOTS_GPU
  ? ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const STANDARD = [
  ['ahead', 0, -8, 80],
  ['ahead-down', 0, -32, 80],
  ['left', 70, -10, 80],
  ['right', -75, -12, 80],
  ['behind', 180, 5, 80],
  ['up', 20, 55, 80],
  ['sun', 12, 6, 60],
];

const args = process.argv.slice(2);
const shots = args.length >= 3 ? [[args[0], Number(args[1]), Number(args[2]), Number(args[3] || 80), args[4] !== undefined ? Number(args[4]) : undefined]] : STANDARD;
const width = Number(process.env.SHOTS_W || 1280);
const height = Number(process.env.SHOTS_H || 800);

await mkdir(OUT, { recursive: true });
const { server, url } = await listen({});
let browser;
try {
  try {
    browser = await chromium.launch({ args: GL_ARGS });
  } catch (err) {
    browser = await chromium.launch({ channel: 'chrome', args: GL_ARGS });
  }
  const page = await browser.newPage({ viewport: { width, height } });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  await page.goto(url + '?shots=1' + (process.env.SHOTS_QUERY ? '&' + process.env.SHOTS_QUERY : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 60000 });
  for (const [name, yaw, pitch, fov, sim] of shots) {
    const info = await page.evaluate(
      async ({ yaw, pitch, fov, sim, eye }) => {
        const d = window.__dragons;
        if (d.setFlatShot) d.setFlatShot();
        if (sim !== undefined && d.seek) d.seek(sim);
        d.view.follow = false;
        if (eye) d.stage.camera.position.set(eye[0], eye[1], eye[2]);
        d.view.set((yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
        d.stage.camera.fov = fov;
        d.stage.camera.updateProjectionMatrix();
        const frame = d.stage.renderer.info.render.frame;
        await new Promise((resolve) => {
          const tick = () => (d.stage.renderer.info.render.frame >= frame + 2 ? resolve() : setTimeout(tick, 10));
          tick();
        });
        const r = d.stage.renderer.info.render;
        return { calls: r.calls, triangles: r.triangles, buildMs: Math.round(d.buildMs) };
      },
      { yaw, pitch, fov, sim, eye: process.env.SHOTS_EYE ? process.env.SHOTS_EYE.split(',').map(Number) : null }
    );
    const file = path.join(OUT, 'shot-' + name + '.png');
    await page.screenshot({ path: file });
    console.log(`${file}  draw calls ${info.calls}, triangles ${info.triangles}, build ${info.buildMs} ms`);
  }
  if (problems.length) console.log('console:\n  ' + problems.slice(0, 12).join('\n  '));
} finally {
  if (browser) await browser.close();
  server.close();
}
