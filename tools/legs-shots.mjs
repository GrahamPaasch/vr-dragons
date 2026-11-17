#!/usr/bin/env node
/**
 * Pictures of the legs test page (legs/) at moments of its loop, into test-results/legs-*.png.
 *   node tools/legs-shots.mjs [seconds ...]   (default: flying, landing, standing, head down, take-off)
 * LEGS_SPECIES=1 for the teal one; LEGS_NEAR=1 for the nearer pair.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
await mkdir(OUT, { recursive: true });
const times = process.argv.slice(2).map(Number);
const at = times.length ? times : [2.5, 6.8, 8.0, 10.5, 13.4, 16.2];
const { server, port } = await listen({ mount: '/vr/dragons' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await page.goto('http://localhost:' + port + '/vr/dragons/legs');
  await page.waitForFunction(() => window.__legs && window.__legs.ready, null, { timeout: 90000 });
  await page.click('#watch');
  if (process.env.LEGS_SPECIES === '1') await page.evaluate(() => window.__legs.swap());
  if (process.env.LEGS_NEAR === '1') await page.evaluate(() => window.__legs.closer());
  await page.evaluate(() => (document.getElementById('bar').style.display = 'none'));
  // LEGS_CAM=x,y,z,tx,ty,tz: a camera anywhere, looking at a point.
  if (process.env.LEGS_CAM) await page.evaluate((c) => window.__legs.setCam(c), process.env.LEGS_CAM.split(',').map(Number));
  for (const t of at) {
    // Run up to the moment (the loop eases some things frame by frame).
    await page.evaluate((t) => window.__legs.setTime(Math.max(0, t - 1.2)), t);
    await page.waitForTimeout(1600);
    await page.evaluate((t) => window.__legs.setTime(t), t);
    await page.waitForTimeout(250);
    const name = 'legs-' + (process.env.LEGS_SPECIES === '1' ? 'tarn-' : '') + (process.env.LEGS_NEAR === '1' ? 'near-' : '') + (process.env.LEGS_CAM ? 'cam-' : '') + t.toFixed(1) + '.png';
    await page.screenshot({ path: path.join(OUT, name) });
    console.log(name);
  }
  if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
} finally {
  await browser.close();
  server.close();
}
