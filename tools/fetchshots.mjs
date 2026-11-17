#!/usr/bin/env node
/**
 * Pictures of fetch, for looking at it without a headset: the page is loaded, a game is played
 * in it (fetch.js, driven the way the tools drive the flight), and at chosen moments the view
 * is pointed at what is happening. Into test-results/fetch-*.png.
 *
 *   node tools/fetchshots.mjs                  all of them
 *   node tools/fetchshots.mjs rest flight      some (rest, eager, flight, splash, thrash, joy, pick, offer, toss)
 *   SHOTS_GPU=1 ...                            the machine's GPU instead of the software renderer
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
const wanted = process.argv.slice(2);
const want = (name) => !wanted.length || wanted.includes(name);

await mkdir(OUT, { recursive: true });
const { server, url } = await listen({});
const browser = await chromium.launch({ args: GL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  await page.goto(url + '?shots=1&seed=11', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 90000 });

  // In the page: play on until a condition holds (or a time runs out), a few steps at a time.
  await page.evaluate(() => {
    const d = window.__dragons;
    d.setFlatShot();
    d.state.begun = true;
    window.__fetch = {
      until(test, most) {
        const dt = 1 / 60;
        for (let t = 0; t < most; t += dt) {
          d.director.step(dt);
          d.director.drain();
          d.game.events.length = 0;
          d.state.time += dt;
          if (test()) return t;
        }
        return -1;
      },
      // Point the view at a point, with a lens of fov degrees: from the ledge, or from `eye`.
      look(p, fov, eye) {
        const e = eye || [0, 1.62, 0];
        d.stage.camera.position.set(e[0], e[1], e[2]);
        const dx = p[0] - e[0];
        const dy = p[1] - e[1];
        const dz = p[2] - e[2];
        d.view.set(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        d.stage.camera.fov = fov || 70;
        d.stage.camera.updateProjectionMatrix();
      },
      start(mode, seed) {
        d.director.seed = seed || 11;
        d.director.reset();
        d.director.drain();
        d.game.setHands(false);
        if (mode === 'perch') d.game.toggleMode();
        // The opening flies a while.
        this.until(() => false, 30);
      },
      grabAndThrow(hand, yawDeg) {
        const b = d.game.ball;
        d.game.grab('right', b.x, b.y + 0.3, b.z);
        this.until(() => false, 5);
        const yaw = (yawDeg * Math.PI) / 180;
        const up = (34 * Math.PI) / 180;
        d.game.hold('right', 0.3, 1.4, -0.4, 0, 0, 0);
        d.game.release('right', -Math.sin(yaw) * Math.cos(up) * hand, Math.sin(up) * hand, -Math.cos(yaw) * Math.cos(up) * hand);
      },
    };
  });
  const frame = async () => {
    // A few frames drawn, so the picture (and the ball's trail) catches up.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const d = window.__dragons;
          const start = d.stage.renderer.info.render.frame;
          const tick = () => (d.stage.renderer.info.render.frame >= start + 3 ? resolve() : setTimeout(tick, 8));
          tick();
        })
    );
    await page.evaluate(() => window.__dragons.pose(1 / 60));
  };
  const shot = async (name, info) => {
    await frame();
    await page.screenshot({ path: path.join(OUT, 'fetch-' + name + '.png') });
    console.log('fetch-' + name + '.png', info ? JSON.stringify(info) : '');
  };

  if (want('rest')) {
    await page.evaluate(() => {
      window.__fetch.start('exercise');
      const b = window.__dragons.game.ball;
      window.__fetch.look([b.x, b.y, b.z], 75);
    });
    await shot('rest');
  }
  if (want('eager')) {
    const info = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      f.start('exercise');
      const b = d.game.ball;
      d.game.grab('right', b.x, b.y + 0.3, b.z);
      d.game.hold('right', 0.3, 1.3, -0.3, 0, 0, 0);
      f.until(() => false, 22);
      const n = d.director.flyers[0];
      f.look([n.x, n.y, n.z], 75);
      return { at: [n.x, n.y, n.z].map((v) => Math.round(v)) };
    });
    await shot('eager', info);
  }
  if (want('flight') || want('splash') || want('thrash')) {
    const info = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      f.start('exercise');
      f.grabAndThrow(10, 0);
      f.until(() => false, 1.6);
      const b = d.game.ball;
      f.look([b.x, b.y - 6, b.z], 70);
      return { ball: [b.x, b.y, b.z].map((v) => Math.round(v)), state: b.state };
    });
    if (want('flight')) await shot('flight', info);
    const splash = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      f.until(() => d.game.ball.state === 'floating', 8);
      // (The splash is drawn by the page from the event: put it there.)
      const b = d.game.ball;
      d.ballView.splash(b.x, -46, b.z, 1.2);
      f.until(() => false, 0.25);
      f.look([b.x, b.y, b.z], 40);
      return { ball: [b.x, b.y, b.z].map((v) => Math.round(v)) };
    });
    if (want('splash')) await shot('splash', splash);
    const thrash = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      let found = f.until(() => d.game.d.some((x) => x.script && x.script.moves[x.script.k].name === 'thrash'), 40);
      for (const [seed, hand] of [[2, 6], [4, 6], [7, 5.5], [9, 6.5]]) {
        if (found >= 0) break;
        f.start('exercise', seed);
        f.grabAndThrow(hand, 0);
        found = f.until(() => d.game.d.some((x) => x.script && x.script.moves[x.script.k].name === 'thrash'), 60);
      }
      f.until(() => false, 1.2);
      const i = d.game.d.findIndex((x) => x.script);
      const g = d.director.flyers[Math.max(i, 0)];
      d.ballView.splash(d.game.ball.x, -46, d.game.ball.z, 0.8);
      f.look([g.x, g.y, g.z], 35);
      return { found, dragon: i };
    });
    if (want('thrash')) await shot('thrash', thrash);
  }
  if (want('joy') || want('pick')) {
    const info = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      // (Throws until one comes down on open ground.)
      let found = -1;
      for (const [seed, hand] of [[11, 3], [2, 3], [5, 2.5], [8, 3.5], [3, 2]]) {
        f.start('exercise', seed);
        f.grabAndThrow(hand, 0);
        found = f.until(() => d.game.d.some((x) => x.script && x.script.moves[x.script.k].name === 'joy'), 60);
        if (found >= 0) break;
      }
      f.until(() => false, 0.9);
      const i = d.game.d.findIndex((x) => x.script);
      const g = d.director.flyers[Math.max(i, 0)];
      f.look([g.x, g.y + 2, g.z], 32);
      return { found, dragon: i, at: [g.x, g.y, g.z].map((v) => Math.round(v)) };
    });
    if (want('joy')) await shot('joy', info);
    const pick = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      const found = f.until(() => d.game.d.some((x) => x.script && x.script.moves[x.script.k].name === 'pick' && x.script.t > 0.7), 10);
      const i = d.game.d.findIndex((x) => x.script);
      const g = d.director.flyers[Math.max(i, 0)];
      f.look([g.x, g.y, g.z], 30);
      return { found, ball: d.game.ball.state };
    });
    if (want('pick')) await shot('pick', pick);
  }
  if (want('offer') || want('perch')) {
    const info = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      f.start('perch');
      f.grabAndThrow(12, 0);
      const landed = f.until(() => d.game.d.some((x) => x.script && x.script.moves[x.script.k].name === 'turn'), 90);
      const g = d.game.d.findIndex((x) => x.script);
      const fl = d.director.flyers[Math.max(g, 0)];
      f.look([fl.x, fl.y + 1, fl.z], 80);
      return { landed, dragon: g };
    });
    if (want('perch')) await shot('perch', info);
    const offer = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      const found = f.until(() => d.game.ball.state === 'offered', 12);
      f.until(() => false, 1);
      const b = d.game.ball;
      // From behind and beside the viewer, to see the neck come over to them.
      f.look([2.6, 0.2, -3.4], 70, [-2.2, 2.6, 3.4]);
      return { found, ball: [b.x, b.y, b.z].map((v) => +v.toFixed(2)), miss: d.game.offerMiss };
    });
    if (want('offer')) await shot('offer', offer);
  }
  if (want('toss')) {
    const info = await page.evaluate(() => {
      const f = window.__fetch;
      const d = window.__dragons;
      f.start('exercise');
      f.grabAndThrow(12, 0);
      const found = f.until(() => d.game.ball.state === 'flying' && d.game.ball.home, 90);
      f.until(() => false, 0.35);
      const b = d.game.ball;
      f.look([b.x + 3, b.y + 1, b.z - 2], 90);
      return { found, ball: [b.x, b.y, b.z].map((v) => +v.toFixed(1)) };
    });
    await shot('toss', info);
  }
  if (problems.length) console.log('PROBLEMS:\n' + problems.slice(0, 10).join('\n'));
} finally {
  await browser.close();
  server.close();
}
