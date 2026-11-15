#!/usr/bin/env node
/**
 * Pictures of the flight at a list of times, with the camera turned to the dragons, for judging
 * the flying without a headset.
 *
 *   node tools/sheet.mjs 12 30 44.5        seconds into the flight; files test-results/sheet-<t>.png
 *   node tools/sheet.mjs --every 4 0 120   one every 4 s from 0 to 120 s
 *   SHEET_FOV=50 SHEET_AIM=0 ...           field of view; which dragon to aim at (0, 1, or both)
 *   SHEET_FIXED=yaw,pitch                  do not follow: look this way (degrees left, degrees up)
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

let args = process.argv.slice(2);
let times = [];
if (args[0] === '--every') {
  const step = Number(args[1]);
  for (let t = Number(args[2]); t <= Number(args[3]) + 1e-9; t += step) times.push(Math.round(t * 100) / 100);
} else {
  times = args.map(Number);
}
if (!times.length) times = [10, 20, 30, 40, 50, 60];
const fov = Number(process.env.SHEET_FOV || 70);
const aim = process.env.SHEET_AIM === undefined ? 'both' : process.env.SHEET_AIM;
const fixed = process.env.SHEET_FIXED ? process.env.SHEET_FIXED.split(',').map(Number) : null;
const width = Number(process.env.SHOTS_W || 960);
const height = Number(process.env.SHOTS_H || 600);

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
  for (const t of times) {
    const info = await page.evaluate(
      async ({ t, fov, aim, fixed }) => {
        const d = window.__dragons;
        d.setFlatShot();
        d.seek(t);
        const f = d.director.flyers;
        const cam = d.stage.camera.position;
        const pick = aim === 'both' ? null : f[Number(aim)];
        const dist = f.map((q) => Math.hypot(q.x - cam.x, q.y - cam.y, q.z - cam.z));
        let tx;
        let ty;
        let tz;
        if (pick) {
          tx = pick.x;
          ty = pick.y;
          tz = pick.z;
        } else {
          // Aim between the two, by direction, so that both are in the picture when they can be.
          const dir = f.map((q, i) => [(q.x - cam.x) / dist[i], (q.y - cam.y) / dist[i], (q.z - cam.z) / dist[i]]);
          tx = cam.x + dir[0][0] + dir[1][0];
          ty = cam.y + dir[0][1] + dir[1][1];
          tz = cam.z + dir[0][2] + dir[1][2];
        }
        d.view.follow = false;
        if (fixed) d.view.set((fixed[0] * Math.PI) / 180, (fixed[1] * Math.PI) / 180);
        else d.view.set(Math.atan2(-(tx - cam.x), -(tz - cam.z)), Math.atan2(ty - cam.y, Math.hypot(tx - cam.x, tz - cam.z)));
        d.stage.camera.fov = fov;
        d.stage.camera.updateProjectionMatrix();
        const frame = d.stage.renderer.info.render.frame;
        await new Promise((resolve) => {
          const tick = () => (d.stage.renderer.info.render.frame >= frame + 2 ? resolve() : setTimeout(tick, 10));
          tick();
        });
        const r = d.stage.renderer.info.render;
        return {
          calls: r.calls,
          triangles: r.triangles,
          dist: dist.map((v) => Math.round(v)),
          lane: d.director.find(d.director.center).lane.name,
          mode: d.director.mode.name,
          speed: f.map((q) => q.speed.toFixed(0)),
          power: f.map((q) => q.power.toFixed(1)),
        };
      },
      { t, fov, aim, fixed }
    );
    const file = path.join(OUT, 'sheet-' + String(t).padStart(5, '0') + '.png');
    await page.screenshot({ path: file });
    console.log(`${path.relative(ROOT, file)}  t=${t}s lane=${info.lane} mode=${info.mode} dist=${info.dist.join('/')}m speed=${info.speed.join('/')} power=${info.power.join('/')} calls=${info.calls} tris=${info.triangles}`);
  }
  if (problems.length) console.log('console:\n  ' + problems.slice(0, 12).join('\n  '));
} finally {
  if (browser) await browser.close();
  server.close();
}
