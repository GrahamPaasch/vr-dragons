#!/usr/bin/env node
/**
 * Browser smoke test: loads the real page in headless Chromium and uses it the way a person
 * would, on a flat screen and inside an emulated Oculus Quest 1.
 *
 *   npm run smoke
 *   SMOKE_ONLY=flat,quest1 npm run smoke     some of the parts: flat, phone, path, quest1, no3d
 *   SMOKE_CHANNEL=chrome npm run smoke       in the installed Google Chrome instead
 *   SMOKE_EXECUTABLE=/path/to/chrome npm run smoke
 *   SMOKE_URL=https://www.grahampaasch.com/vr/dragons npm run smoke    the page as deployed
 *
 * The VR part uses Meta's Immersive Web Emulation Runtime (iwer), which stands in for the
 * headset: it supplies navigator.xr, a tracked head and two Touch controllers. It is injected
 * by this test only; the page itself never loads it. This checks our WebXR code path. It says
 * nothing about speed on the real headset: for that see tools/perf.mjs and the README.
 *
 * Screenshots go to test-results/.
 */

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results');
const IWER = path.join(ROOT, 'node_modules', 'iwer', 'build', 'iwer.min.js');
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** The budget for an Oculus Quest 1, per eye. The page is far inside it; these catch a slip. */
const BUDGET = { calls: 60, triangles: 60000 };

const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ok    ' + name + '  (' + (Date.now() - started) + ' ms)');
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log('  FAIL  ' + name + '\n        ' + String(err && err.stack ? err.stack : err).split('\n').join('\n        '));
  }
}

const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, (label || 'value') + ': expected ' + expected + ' +/- ' + tolerance + ', got ' + actual);

/** Open a page and record everything that would count as a JavaScript or loading error. */
async function open(browser, url, options) {
  const o = options || {};
  const context = await browser.newContext({
    viewport: o.viewport || { width: 1280, height: 800 },
    deviceScaleFactor: o.mobile ? 2 : 1,
    isMobile: !!o.mobile,
    hasTouch: !!o.mobile,
  });
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text());
    if (m.type() === 'warning' && !/GPU stall|WebGL-|GL Driver Message|iwer|IWER/i.test(m.text())) problems.push('console.warn: ' + m.text());
  });
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('requestfailed', (r) => problems.push('request failed: ' + r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push('HTTP ' + r.status() + ': ' + r.url());
  });
  page.on('request', (r) => requests.push(r.url()));
  if (o.xr) {
    await page.addInitScript({ path: IWER });
    await page.addInitScript((stereo) => {
      /* global IWER */
      const device = new IWER.XRDevice(IWER.oculusQuest1, { stereoEnabled: stereo });
      // Headless Chromium has a native navigator.xr with no headset behind it: replace it.
      device.installRuntime({ forceInstall: true });
      window.__xrDevice = device;
    }, !!o.stereo);
  }
  await page.goto(url, { waitUntil: 'load' });
  if (!o.noWait) await page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 60000 });
  return { page, context, problems, requests };
}

const app = (page, fn, arg) => page.evaluate(fn, arg);
const frames = (page, n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const d = window.__dragons;
        const start = d.stage.renderer.info.render.frame;
        const tick = () => (d.stage.renderer.info.render.frame >= start + count ? resolve() : setTimeout(tick, 8));
        tick();
      }),
    n || 3
  );

/** How many different colours the next frame has (a blank or one-colour frame has very few). */
const colours = (page) =>
  app(page, () => {
    const d = window.__dragons;
    return new Promise((resolve) => {
      const original = d.stage.render.bind(d.stage);
      d.stage.render = () => {
        original();
        d.stage.render = original;
        const c = document.createElement('canvas');
        c.width = 96;
        c.height = 60;
        const ctx = c.getContext('2d');
        ctx.drawImage(d.stage.canvas, 0, 0, 96, 60);
        const data = ctx.getImageData(0, 0, 96, 60).data;
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4) seen.add((data[i] >> 3) + ',' + (data[i + 1] >> 3) + ',' + (data[i + 2] >> 3));
        resolve(seen.size);
      };
    });
  });

// ---------------------------------------------------------------------------------------------

async function flatScreen(browser, base) {
  console.log('\nFlat screen (laptop)');
  const { page, context, problems, requests } = await open(browser, base);

  await check('the page loads and draws with no JavaScript errors', async () => {
    await frames(page, 5);
    const info = await app(page, () => {
      const d = window.__dragons;
      const r = d.stage.renderer.info.render;
      return { calls: r.calls, triangles: r.triangles, time: d.state.time, begun: d.state.begun, trees: d.stage.treeCount };
    });
    assert.ok(info.calls > 8, 'draw calls: ' + info.calls);
    assert.ok(info.time > 0, 'the clock is running');
    assert.equal(info.begun, false, 'the piece waits behind its card');
    assert.ok(info.trees > 500, 'there is a forest: ' + info.trees + ' trees');
    assert.deepEqual(problems, []);
  });

  await check('the picture is not blank', async () => {
    const n = await colours(page);
    assert.ok(n > 60, 'distinct colours in the frame: ' + n);
  });

  await check('everything it loads comes from its own folder (no CDN, no fonts, no trackers)', async () => {
    const origin = new URL(base).origin;
    const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    assert.deepEqual(foreign, []);
    assert.ok(requests.some((u) => u.endsWith('/vendor/three.module.min.js')), 'three.js is the vendored copy');
  });

  await check('the card says what this is; without a headset the flat view is the bright button', async () => {
    await page.waitForFunction(() => !window.__dragons.state.vr.checking);
    assert.equal(await page.isVisible('#veil'), true);
    assert.match(await page.textContent('#card h1'), /Two Dragons/);
    assert.equal(await page.isDisabled('#enterVR'), true);
    assert.equal(await page.isEnabled('#watch'), true);
    assert.match(await page.getAttribute('#watch', 'class'), /primary/);
    assert.match(await page.textContent('#note'), /VR headset/);
    assert.equal(await page.isVisible('#hud'), false);
    const icon = await page.getAttribute('link[rel="icon"]', 'href');
    assert.match(icon, /^data:image\/svg\+xml/, 'the favicon is inline');
    await page.screenshot({ path: path.join(OUT, 'flat-card.png') });
  });

  await check('no sound before a tap', async () => {
    assert.equal(await app(page, () => window.__dragons.audio.ctx), null);
  });

  await check('"Watch here" starts the piece from its opening, with sound', async () => {
    await page.click('#watch');
    await page.waitForFunction(() => window.__dragons.state.begun, null, { timeout: 5000 });
    await page.waitForFunction(() => window.__dragons.audio.running, null, { timeout: 5000 });
    const s = await app(page, () => {
      const d = window.__dragons;
      const f = d.director.flyers;
      return {
        time: d.director.time,
        lanes: d.director.program(),
        far: f.map((q) => Math.hypot(q.x, q.y, q.z)),
        voices: d.audio.dragons.length,
        follow: d.view.follow,
      };
    });
    assert.ok(s.time < 1.5, 'the flight starts over: ' + s.time.toFixed(2) + ' s in');
    assert.deepEqual(s.lanes.slice(0, 2), ['far turn', 'eight'], 'the opening is the scripted one');
    assert.ok(s.far.every((d) => d > 150), 'the dragons begin far out over the lake: ' + s.far.map((d) => d.toFixed(0)).join(', ') + ' m');
    assert.equal(s.voices, 2);
    assert.equal(s.follow, true);
    await page.waitForFunction(() => document.getElementById('veil').classList.contains('gone'));
    assert.equal(await page.isVisible('#hud'), true);
    assert.deepEqual(problems, []);
  });

  await check('the dragons fly: they move, beat their wings and stay clear of the viewer', async () => {
    const before = await app(page, () => window.__dragons.director.flyers.map((f) => [f.x, f.y, f.z, f.beats]));
    await page.waitForTimeout(2500);
    const after = await app(page, () => {
      const d = window.__dragons;
      return { flyers: d.director.flyers.map((f) => [f.x, f.y, f.z, f.beats]), closest: d.director.closest, beats: d.audio.stats.beats, gusts: d.audio.stats.gusts };
    });
    for (let i = 0; i < 2; i++) {
      const moved = Math.hypot(after.flyers[i][0] - before[i][0], after.flyers[i][1] - before[i][1], after.flyers[i][2] - before[i][2]);
      assert.ok(moved > 15, 'dragon ' + i + ' moved ' + moved.toFixed(1) + ' m in 2.5 s');
    }
    assert.ok(after.flyers[0][3] + after.flyers[1][3] > before[0][3] + before[1][3], 'wingbeats are counted');
    assert.ok(after.beats > 0, 'and heard: ' + after.beats);
    assert.ok(after.gusts > 0, 'the wind is blowing');
    assert.ok(after.closest > 9, 'nearest to the viewer so far: ' + after.closest.toFixed(1) + ' m');
  });

  await check('Space whistles and a dragon answers the call', async () => {
    const who = await app(page, () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      const d = window.__dragons;
      return { calls: d.state.calls, answered: d.state.answered, jobs: d.director.jobs.map((j) => (j ? j.phase : null)), whistles: d.audio.stats.whistles || 0 };
    });
    assert.equal(who.calls, 1);
    assert.equal(who.answered, 1);
    assert.equal(who.jobs.filter((j) => j === 'come').length, 1, 'one dragon is on its way');
    assert.equal(who.whistles, 1);
    // A second call at once is whistled into the wind: nobody else comes yet.
    const again = await app(page, () => {
      const d = window.__dragons;
      const got = d.call();
      return { got, calls: d.state.calls, answered: d.state.answered };
    });
    assert.equal(again.got, -1);
    assert.equal(again.calls, 2);
    assert.equal(again.answered, 1);
  });

  await check('the called dragon passes close by, roars, and never comes nearer than 9 m', async () => {
    // Run the flight ahead rather than wait half a minute.
    const s = await app(page, () => {
      const d = window.__dragons;
      const dt = 1 / 72;
      let passed = false;
      let roared = false;
      let nearest = Infinity;
      let up = 0;
      for (let i = 0; i < 72 * 50 && !(passed && !d.director.jobs.some(Boolean)); i++) {
        d.director.step(dt);
        for (const e of d.director.drain()) {
          if (e.type === 'pass') passed = true;
          if (e.type === 'roar' && e.kind === 'call') roared = true;
        }
        d.director.flyers.forEach((f, k) => {
          const range = Math.hypot(f.x, f.y - 1.62, f.z);
          if (d.director.jobs[k] && d.director.jobs[k].phase !== 'out' && range < nearest) {
            nearest = range;
            up = (Math.atan2(f.y - 1.62, Math.hypot(f.x, f.z)) * 180) / Math.PI;
          }
        });
      }
      return { passed, roared, nearest, up, free: !d.director.jobs.some(Boolean) };
    });
    assert.equal(s.passed, true, 'it came past');
    assert.equal(s.roared, true, 'it roared on the way in');
    assert.ok(s.nearest < 16, 'close: ' + s.nearest.toFixed(1) + ' m');
    assert.ok(s.nearest >= 9, 'but not too close: ' + s.nearest.toFixed(1) + ' m');
    assert.ok(s.up > 15 && s.up < 45, 'where it can be watched, not overhead: ' + s.up.toFixed(0) + ' degrees up');
    assert.equal(s.free, true, 'and went back to the other one');
  });

  await check('a dragon going by close is felt: the trees bend, the leaves are carried, and one in front of the sun casts its shadow', async () => {
    const s = await app(page, async () => {
      const d = window.__dragons;
      const wait = (n) =>
        new Promise((resolve) => {
          const start = d.stage.renderer.info.render.frame;
          const tick = () => (d.stage.renderer.info.render.frame >= start + n ? resolve() : setTimeout(tick, 8));
          tick();
        });
      const blown = d.stage.leaves.material.uniforms.uBlown.value;
      const before = [blown.x, blown.y, blown.z];
      const calm = d.state.wake;
      // On to a moment when one of them is within 15 m, and a few frames of it.
      let near = Infinity;
      for (let t = 0; t < 240 && near > 15; t += 0.25) {
        d.fly(0.25);
        near = Math.min(...d.director.flyers.map((f) => Math.hypot(f.x, f.y - 1.62, f.z)));
      }
      await wait(14);
      d.state.paused = true;
      await wait(14);
      const out = { near, calm, wake: d.state.wake, wind: d.stage.shared.uWind.value.length(), moved: Math.hypot(blown.x - before[0], blown.y - before[1], blown.z - before[2]) };
      // The maple's rattle, as a share of what a full gust gives it: what the wind has it at, times what the wake adds.
      out.wash = d.audio.washTold;
      out.rattle = d.audio.washTold * (0.12 + 0.88 * d.audio.wind.now * d.audio.wind.now);
      // And one put on the line from the eye to the sun, 60 m off (the other well out of it).
      const keep = d.director.flyers.map((f) => [f.x, f.y, f.z]);
      const put = (f, x, y, z) => {
        f.x = x;
        f.y = y;
        f.z = z;
      };
      const sun = d.stage.shared.uSunDir.value;
      put(d.director.flyers[1], 200, 40, 150);
      put(d.director.flyers[0], sun.x * 60, 1.62 + sun.y * 60, sun.z * 60);
      await wait(12);
      out.cover = d.state.cover;
      out.uniform = d.stage.shared.uCover.value;
      put(d.director.flyers[0], -200, 40, 150);
      await wait(40);
      out.after = d.state.cover;
      d.director.flyers.forEach((f, i) => put(f, keep[i][0], keep[i][1], keep[i][2]));
      d.state.paused = false;
      return out;
    });
    assert.ok(s.near <= 15, 'a dragon came within ' + s.near.toFixed(1) + ' m');
    assert.ok(s.wake > 0.5 && s.wake > s.calm + 0.3, 'its wake is felt: ' + s.wake.toFixed(2) + ' (it was ' + s.calm.toFixed(2) + ')');
    assert.ok(s.wind > 0.9, 'the trees by the ledge bend to it: ' + s.wind.toFixed(2));
    assert.ok(s.moved > 0.15, 'and the leaves in the air are carried along: ' + s.moved.toFixed(2) + ' m');
    assert.ok(s.wash >= 1 && s.rattle > 0.45 && s.rattle < 1.06, 'the maple rattles as in a gust, and no louder than in a full one: ' + s.rattle.toFixed(2) + ' of that');
    assert.ok(s.cover > 0.8 && s.uniform === s.cover, 'a dragon in front of the sun covers it: ' + s.cover.toFixed(2));
    assert.ok(s.after < 0.05, 'and the shadow passes: ' + s.after.toFixed(2));
    assert.deepEqual(problems, []);
  });

  await check('a roar comes with fire, and the fire goes out again', async () => {
    const s = await app(page, async () => {
      const d = window.__dragons;
      const wait = (n) =>
        new Promise((resolve) => {
          const start = d.stage.renderer.info.render.frame;
          const tick = () => (d.stage.renderer.info.render.frame >= start + n ? resolve() : setTimeout(tick, 8));
          tick();
        });
      const before = d.dragons.map((x) => x.flame.visible);
      const roars = d.audio.stats.roars;
      d.director.roar(0, 'far');
      let brightest = 0;
      let seen = false;
      for (let i = 0; i < 40; i++) {
        await wait(2);
        brightest = Math.max(brightest, d.dragons[0].fire);
        seen = seen || d.dragons[0].flame.visible;
        if (d.director.flyers[0].roar === 0 && i > 5) break;
      }
      await wait(3);
      return { before, seen, brightest, after: d.dragons[0].flame.visible, other: d.dragons[1].flame.visible, heard: d.audio.stats.roars - roars, jaw: d.director.flyers[0].jaw };
    });
    assert.deepEqual(s.before, [false, false]);
    assert.equal(s.seen, true, 'the fire was drawn');
    assert.ok(s.brightest > 0.9, 'at full strength: ' + s.brightest.toFixed(2));
    assert.equal(s.after, false, 'and it stops when the roar does');
    assert.equal(s.other, false, 'only the one that roared');
    assert.equal(s.heard, 1, 'the roar was heard');
    assert.deepEqual(problems, []);
  });

  await check('dragging looks around and stops the view following; a tap calls', async () => {
    const before = await app(page, () => ({ yaw: window.__dragons.view.yaw, calls: window.__dragons.state.calls }));
    await page.mouse.move(640, 300);
    await page.mouse.down();
    await page.mouse.move(440, 320, { steps: 8 });
    await page.mouse.up();
    const after = await app(page, () => ({ yaw: window.__dragons.view.yaw, follow: window.__dragons.view.follow, calls: window.__dragons.state.calls }));
    assert.ok(Math.abs(after.yaw - before.yaw) > 0.1, 'the view turned by ' + (after.yaw - before.yaw).toFixed(2) + ' rad');
    assert.equal(after.follow, false);
    assert.equal(after.calls, before.calls, 'a drag is not a call');
    await page.mouse.click(640, 300);
    assert.equal(await app(page, () => window.__dragons.state.calls), before.calls + 1, 'a tap is');
  });

  await check('the sound button switches the sound off (and the work of making it) and on again', async () => {
    await page.click('#soundChip');
    assert.equal(await page.getAttribute('#soundChip', 'aria-pressed'), 'false');
    await page.waitForTimeout(500);
    const off = await app(page, () => ({ gain: window.__dragons.audio.master.gain.value, state: window.__dragons.audio.ctx.state, running: window.__dragons.audio.running }));
    assert.ok(off.gain < 0.01, 'silent');
    assert.equal(off.state, 'suspended', 'and not being worked out at all');
    assert.equal(off.running, false);
    // A call while it is off must not wake it.
    await app(page, () => window.__dragons.call());
    await page.waitForTimeout(150);
    assert.equal(await app(page, () => window.__dragons.audio.ctx.state), 'suspended', 'a tap does not wake it');
    await page.click('#soundChip');
    assert.equal(await page.getAttribute('#soundChip', 'aria-pressed'), 'true');
    await page.waitForTimeout(500);
    const on = await app(page, () => ({ gain: window.__dragons.audio.master.gain.value, state: window.__dragons.audio.ctx.state }));
    assert.equal(on.state, 'running');
    assert.ok(on.gain > 0.5, 'back');
  });

  await check('the cheaper way of placing sound can be switched on, and off again', async () => {
    const s = await app(page, () => {
      const d = window.__dragons;
      const model = () => d.audio.dragons.map((v) => v.panner.panningModel);
      // (A page drawn in software is slow, and may have been given the cheap way already.)
      const was = d.audio.lite;
      d.audio.setLite(false);
      const full = model();
      d.audio.setLite(true);
      const lite = model();
      const echo = d.audio.reverbOff;
      d.audio.setLite(false);
      const out = { full, lite, echo, again: model(), back: d.audio.reverbOff };
      d.audio.setLite(was);
      return out;
    });
    assert.deepEqual(s.full, ['HRTF', 'HRTF']);
    assert.deepEqual(s.lite, ['equalpower', 'equalpower']);
    assert.equal(s.echo, true, 'no echo off the hills while it is on');
    assert.deepEqual(s.again, ['HRTF', 'HRTF']);
    assert.equal(s.back, false);
    assert.deepEqual(problems, []);
  });

  await check('looking every way, the frame stays inside the Quest 1 budget', async () => {
    const worst = await app(page, async () => {
      const d = window.__dragons;
      d.view.follow = false;
      const out = { calls: 0, triangles: 0 };
      for (let yaw = 0; yaw < 360; yaw += 30) {
        for (const pitch of [-35, 0, 35]) {
          d.view.set((yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
          const frame = d.stage.renderer.info.render.frame;
          await new Promise((resolve) => {
            const tick = () => (d.stage.renderer.info.render.frame >= frame + 2 ? resolve() : setTimeout(tick, 4));
            tick();
          });
          out.calls = Math.max(out.calls, d.stage.renderer.info.render.calls);
          out.triangles = Math.max(out.triangles, d.stage.renderer.info.render.triangles);
        }
      }
      return out;
    });
    console.log('        most in any direction: ' + worst.calls + ' draw calls, ' + worst.triangles + ' triangles');
    assert.ok(worst.calls <= BUDGET.calls, 'draw calls: ' + worst.calls);
    assert.ok(worst.triangles <= BUDGET.triangles, 'triangles: ' + worst.triangles);
  });

  await check('still no errors after all that', async () => {
    await frames(page, 3);
    await page.screenshot({ path: path.join(OUT, 'flat-running.png') });
    assert.deepEqual(problems, []);
  });
  await context.close();
}

async function phone(browser, base) {
  console.log('\nFlat screen (phone)');
  const { page, context, problems } = await open(browser, base, { viewport: { width: 390, height: 780 }, mobile: true });
  await check('loads on a phone-sized touch screen with a wider lens; a tap on the button starts it', async () => {
    await frames(page, 4);
    assert.equal(await app(page, () => window.__dragons.stage.camera.fov), 88);
    await page.tap('#watch');
    await page.waitForFunction(() => window.__dragons.state.begun, null, { timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('veil').classList.contains('gone'));
    await frames(page, 3);
    const box = await page.locator('#hud').boundingBox();
    assert.ok(box && box.y + box.height <= 780, 'the controls are on the screen');
    await page.waitForTimeout(1100); // the curtain is still opening
    await page.screenshot({ path: path.join(OUT, 'phone.png') });
    assert.deepEqual(problems, []);
  });
  await context.close();
}

async function liveSitePath(browser) {
  console.log('\nServed the way the live site serves it (/vr/dragons, no trailing slash)');
  const { server, port } = await listen({ mount: '/vr/dragons' });
  try {
    for (const suffix of ['/vr/dragons', '/vr/dragons/', '/vr/dragons/index.html']) {
      await check('loads at ' + suffix, async () => {
        const { page, context, problems } = await open(browser, 'http://localhost:' + port + suffix);
        await frames(page, 3);
        assert.ok((await app(page, () => window.__dragons.stage.treeCount)) > 500);
        assert.deepEqual(problems, []);
        await context.close();
      });
    }
  } finally {
    server.close();
  }
}

// ---------------------------------------------------------------------------------------------

async function quest1(browser, base) {
  console.log('\nInside an emulated Oculus Quest 1 (WebXR immersive-vr)');
  // (?governor=off: software drawing is slow, and the budget check must count the whole picture.)
  const { page, context, problems } = await open(browser, base + '?governor=off', { xr: true, stereo: true, viewport: { width: 1280, height: 720 } });

  await check('the page offers VR when a headset is present', async () => {
    await page.waitForFunction(() => !window.__dragons.state.vr.checking);
    assert.equal(await app(page, () => window.__dragons.state.vr.supported), true);
    assert.equal(await page.textContent('#enterVR'), 'Enter VR');
    assert.equal(await page.isEnabled('#enterVR'), true);
    assert.match(await page.getAttribute('#enterVR', 'class'), /primary/);
    assert.match(await app(page, () => navigator.userAgent), /Quest/);
  });

  await check('Enter VR starts an immersive session on a floor-level reference space, with sound', async () => {
    // Stand the emulated person up, a little off the middle of their floor space.
    await app(page, () => {
      const d = window.__xrDevice;
      d.position.set(0.2, 1.7, 0.1);
      d.controllers.left.position.set(-0.1, 0.9, 0);
      d.controllers.right.position.set(0.5, 0.9, 0);
    });
    const loaded = await app(page, () => ({ programs: window.__dragons.stage.renderer.info.programs.length, textures: window.__dragons.stage.renderer.info.memory.textures }));
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__dragons.state.vr.presenting, null, { timeout: 15000 });
    await frames(page, 6);
    const s = await app(page, () => {
      const d = window.__dragons;
      const head = d.xr.headPosition(new d.THREE.Vector3());
      return {
        type: d.xr.referenceSpaceType,
        isPresenting: d.stage.renderer.xr.isPresenting,
        renderPath: d.xr.renderPath,
        eyes: d.stage.renderer.xr.getCamera().cameras.length,
        head: [head.x, head.y, head.z],
        rig: [d.stage.rig.position.x, d.stage.rig.position.y, d.stage.rig.position.z],
        placed: d.xr.placed,
        begun: d.state.begun,
        time: d.director.time,
        hint: d.stage.hint.showing && d.stage.hint.text,
        audio: d.audio.running,
        veilGone: document.getElementById('veil').classList.contains('gone'),
        hud: !document.getElementById('hud').hidden,
        quality: d.state.quality,
      };
    });
    assert.equal(s.type, 'local-floor');
    assert.equal(s.isPresenting, true);
    assert.equal(s.eyes, 2, 'both eyes are drawn');
    // The person is 20 cm off the middle of their floor space: the ledge is put under them.
    assert.equal(s.placed, true);
    near(s.head[0], 0, 0.02, 'head x');
    near(s.head[1], 1.7, 0.02, 'head height above the ledge');
    near(s.head[2], 0, 0.02, 'head z');
    near(s.rig[0], -0.2, 0.02, 'the valley is shifted to where they stand, x');
    near(s.rig[2], -0.1, 0.02, 'and z');
    assert.equal(s.rig[1], 0, 'never up or down');
    assert.equal(s.begun, true);
    assert.ok(s.time < 2, 'the flight starts from its opening: ' + s.time.toFixed(2) + ' s in');
    assert.match(s.hint, /trigger/, 'the headset is told how to call');
    assert.equal(s.audio, true);
    assert.equal(s.veilGone, true);
    assert.equal(s.hud, false, 'no page controls while in the headset');
    assert.equal(s.quality, 0);
    assert.match(s.renderPath, /^XR(WebGLLayer|ProjectionLayer)$/);
    assert.deepEqual(problems, []);
    // The words on the rim were made while the page loaded: showing them builds no shader
    // and sends no picture to the graphics chip. (They once did, two seconds into every session.)
    await page.waitForFunction(() => window.__dragons.stage.hint.mesh.visible, null, { timeout: 20000 });
    await frames(page, 3);
    const shown = await app(page, () => ({ programs: window.__dragons.stage.renderer.info.programs.length, textures: window.__dragons.stage.renderer.info.memory.textures }));
    assert.deepEqual(shown, loaded, 'nothing new on the graphics chip when the hint appears');
  });

  await check('both eyes together stay inside the budget, whichever way the head is turned', async () => {
    const worst = await app(page, async () => {
      const d = window.__dragons;
      const out = { calls: 0, triangles: 0 };
      const q = new d.THREE.Quaternion();
      const e = new d.THREE.Euler(0, 0, 0, 'YXZ');
      for (let yaw = 0; yaw < 360; yaw += 45) {
        for (const pitch of [-30, 10]) {
          e.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0, 'YXZ');
          q.setFromEuler(e);
          window.__xrDevice.quaternion.set(q.x, q.y, q.z, q.w);
          const frame = d.stage.renderer.info.render.frame;
          await new Promise((resolve) => {
            const tick = () => (d.stage.renderer.info.render.frame >= frame + 3 ? resolve() : setTimeout(tick, 4));
            tick();
          });
          out.calls = Math.max(out.calls, d.stage.renderer.info.render.calls);
          out.triangles = Math.max(out.triangles, d.stage.renderer.info.render.triangles);
        }
      }
      window.__xrDevice.quaternion.set(0, 0, 0, 1);
      return out;
    });
    console.log('        most in any direction, both eyes: ' + worst.calls + ' draw calls, ' + worst.triangles + ' triangles');
    assert.equal(await app(page, () => window.__dragons.state.quality), 0, 'counted at full detail');
    assert.ok(worst.calls <= 2 * BUDGET.calls, 'draw calls for two eyes: ' + worst.calls);
    assert.ok(worst.calls < 150, 'under the 150 the brief allows: ' + worst.calls);
    assert.ok(worst.triangles <= 2 * BUDGET.triangles, 'triangles for two eyes: ' + worst.triangles);
  });

  await check('the picture follows the head: leaning moves the eye, the world stays put', async () => {
    const before = await app(page, () => [window.__dragons.stage.rig.position.x, window.__dragons.stage.rig.position.y, window.__dragons.stage.rig.position.z, window.__dragons.stage.rig.rotation.y]);
    // From (0.2, 1.7, 0.1) in their room: half a metre to the left, half a metre down, 30 cm back.
    await app(page, () => window.__xrDevice.position.set(-0.3, 1.2, 0.4));
    await frames(page, 4);
    const s = await app(page, () => {
      const d = window.__dragons;
      const head = d.xr.headPosition(new d.THREE.Vector3());
      return { head: [head.x, head.y, head.z], rig: [d.stage.rig.position.x, d.stage.rig.position.y, d.stage.rig.position.z, d.stage.rig.rotation.y] };
    });
    near(s.head[0], -0.5, 0.02, 'head x');
    near(s.head[1], 1.2, 0.02, 'head y');
    near(s.head[2], 0.3, 0.02, 'head z');
    assert.deepEqual(s.rig, before, 'after the first moment the viewer is never moved by the page');
  });

  await check('one failure inside a frame does not stop the picture or the head tracking', async () => {
    const s = await app(page, async () => {
      const d = window.__dragons;
      const info = d.stage.renderer.info.render;
      const real = d.director.step;
      // The flight throws, once, in the middle of a session.
      d.director.step = () => {
        d.director.step = real;
        throw new Error('injected by the smoke test');
      };
      const start = info.frame;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const drawn = info.frame - start;
      window.__xrDevice.position.set(0.4, 1.5, 0.1);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const head = d.xr.headPosition(new d.THREE.Vector3());
      const out = { drawn, head: [head.x, head.y, head.z], failed: Object.keys(d.state.failed), presenting: d.stage.renderer.xr.isPresenting };
      // Put it back as it was for the checks that follow.
      window.__xrDevice.position.set(-0.3, 1.2, 0.4);
      delete d.state.failed.flight;
      return out;
    });
    assert.ok(s.drawn >= 10, 'frames drawn in the second and a half after it: ' + s.drawn);
    assert.equal(s.presenting, true);
    near(s.head[0], 0.2, 0.02, 'the picture still follows the head, x');
    near(s.head[1], 1.5, 0.02, 'y');
    assert.deepEqual(s.failed, ['flight'], 'the part that failed is switched off, and only that');
    assert.equal(problems.filter((p) => /flight failed and has been switched off/.test(p)).length, 1, 'and it is reported, once: ' + JSON.stringify(problems));
    problems.length = 0;
  });

  await check('pulling a trigger whistles and calls a dragon', async () => {
    const before = await app(page, () => ({ calls: window.__dragons.state.calls, whistles: window.__dragons.audio.stats.whistles || 0 }));
    await app(page, () => window.__xrDevice.controllers.right.updateButtonValue('trigger', 1));
    await frames(page, 4);
    await app(page, () => window.__xrDevice.controllers.right.updateButtonValue('trigger', 0));
    await frames(page, 4);
    const s = await app(page, () => {
      const d = window.__dragons;
      return { calls: d.state.calls, answered: d.state.answered, jobs: d.director.jobs.map((j) => (j ? j.phase : null)), whistles: d.audio.stats.whistles || 0 };
    });
    assert.equal(s.calls, before.calls + 1);
    assert.equal(s.jobs.filter(Boolean).length, 1, 'one dragon has turned toward the ledge');
    assert.equal(s.whistles, before.whistles + 1);
    assert.deepEqual(problems, []);
  });

  await check('the line about the trigger comes back while nobody has called and the dragons are far off, and stops for good after a call', async () => {
    const s = await app(page, async () => {
      const d = window.__dragons;
      const wait = (n) =>
        new Promise((resolve) => {
          const start = d.stage.renderer.info.render.frame;
          const tick = () => (d.stage.renderer.info.render.frame >= start + n ? resolve() : setTimeout(tick, 8));
          tick();
        });
      const far = () => Math.min(...d.director.flyers.map((f) => Math.hypot(f.x, f.y - 1.62, f.z))) > 85;
      const out = { calledAlready: !d.state.hint.wanted };
      // As if nobody had called yet, and the first showing were over.
      d.state.hint.wanted = true;
      d.stage.hideHint();
      await wait(3);
      out.waiting = !d.stage.hint.showing;
      const shown = d.stage.hint.shown;
      // Most of a minute goes by, to a moment when both dragons are far off.
      d.fly(50);
      for (let t = 0; t < 120 && !far(); t += 1) d.fly(1);
      await wait(4);
      out.again = d.stage.hint.showing && d.stage.hint.shown === shown + 1;
      // A call that is answered: no more of it.
      d.director.jobs[0] = d.director.jobs[1] = null;
      d.director.callAt = -100;
      out.answered = d.call() >= 0;
      d.stage.hideHint();
      await wait(3);
      d.fly(50);
      for (let t = 0; t < 120 && !far(); t += 1) d.fly(1);
      await wait(4);
      out.after = d.stage.hint.showing;
      return out;
    });
    assert.equal(s.calledAlready, true, 'the call before this one was answered: the hint was no longer wanted');
    assert.equal(s.waiting, true);
    assert.equal(s.again, true, 'shown again three quarters of a minute later');
    assert.equal(s.answered, true);
    assert.equal(s.after, false, 'and never again once a call has been answered');
    assert.deepEqual(problems, []);
  });

  await check('a screenshot of what the headset is drawing', async () => {
    await app(page, () => window.__dragons.seek(14.5));
    await frames(page, 4);
    const n = await colours(page);
    await page.screenshot({ path: path.join(OUT, 'quest1-stereo.png') });
    assert.ok(n > 60, 'distinct colours in the frame: ' + n);
  });

  await check('leaving VR brings the page back, with a line about how the session ran', async () => {
    await page.waitForTimeout(1200);
    await app(page, () => window.__dragons.xr.exit());
    await page.waitForFunction(() => !window.__dragons.state.vr.presenting, null, { timeout: 10000 });
    await frames(page, 3);
    const s = await app(page, () => {
      const d = window.__dragons;
      return {
        last: d.state.vr.last,
        said: document.getElementById('hint').textContent,
        saidShown: !document.getElementById('hint').hidden,
        hud: !document.getElementById('hud').hidden,
        hint: d.stage.hint.showing || d.stage.hint.mesh.visible,
        rig: [d.stage.rig.position.x, d.stage.rig.position.z, d.stage.rig.rotation.y],
        camera: [d.stage.camera.position.x, d.stage.camera.position.y, d.stage.camera.position.z],
        size: [d.stage.canvas.width, d.stage.canvas.height],
        isPresenting: d.stage.renderer.xr.isPresenting,
      };
    });
    console.log('        ' + s.last + ' (software drawing: says nothing about a headset)');
    assert.match(s.last, /^Last VR session: \d+ frames a second on average \(the headset asks for \d+\), [\d.]+% of frames late, slowest \d+ ms, detail step \d of \d \([^)]+\), drawn through XR/);
    assert.equal(s.said, s.last, 'and the line is on the page to be read');
    assert.equal(s.saidShown, true);
    assert.equal(s.hud, true);
    assert.equal(s.hint, false);
    assert.deepEqual(s.rig, [0, 0, 0], 'the valley is back where the flat view expects it');
    assert.equal(s.isPresenting, false);
    near(s.camera[1], 1.62, 1e-6, 'the flat camera is back at standing height');
    assert.deepEqual(s.size, [1280, 720], 'the canvas is page-sized again');
    assert.equal(await page.textContent('#vrChip'), 'Enter VR');
    assert.deepEqual(problems, []);
  });

  await check('VR can be entered a second time', async () => {
    await page.click('#vrChip');
    await page.waitForFunction(() => window.__dragons.state.vr.presenting, null, { timeout: 15000 });
    await frames(page, 4);
    assert.equal(await app(page, () => window.__dragons.stage.renderer.xr.isPresenting), true);
    await app(page, () => window.__dragons.xr.exit());
    await page.waitForFunction(() => !window.__dragons.state.vr.presenting, null, { timeout: 10000 });
    assert.deepEqual(problems, []);
  });
  await context.close();

  // Wherever the person stands in their room, and whichever way they face.
  const away = await open(browser, base + '?governor=off', { xr: true, stereo: true, viewport: { width: 1280, height: 720 } });
  await check('standing 2 m from the middle of their room and turned away from its "forward", they are on the ledge facing the lake', async () => {
    await away.page.waitForFunction(() => !window.__dragons.state.vr.checking);
    await app(away.page, () => {
      const d = window.__xrDevice;
      d.position.set(2.0, 1.66, 1.2);
      // Turned 150 degrees to the left of where the headset's space points.
      const half = (150 * Math.PI) / 360;
      d.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
    });
    await away.page.click('#enterVR');
    await away.page.waitForFunction(() => window.__dragons.state.vr.presenting && window.__dragons.xr.placed, null, { timeout: 15000 });
    await frames(away.page, 4);
    const look = () =>
      app(away.page, () => {
        const d = window.__dragons;
        const head = d.xr.headPosition(new d.THREE.Vector3());
        const e = d.stage.renderer.xr.getCamera().cameras[0].matrixWorld.elements;
        return {
          head: [head.x, head.y, head.z],
          forward: [-e[8], -e[9], -e[10]],
          floor: d.stage.terrain.heightAt(head.x, head.z),
          rig: [d.stage.rig.position.x, d.stage.rig.position.z, d.stage.rig.rotation.y],
          hint: [d.stage.hint.mesh.position.x, d.stage.hint.mesh.position.z],
        };
      });
    const s = await look();
    near(s.head[0], 0, 0.03, 'the head is over the middle of the ledge, x');
    near(s.head[2], 0, 0.03, 'z');
    near(s.head[1], 1.66, 0.02, 'at its own height');
    near(s.floor, 0, 0.02, 'the drawn rock is under their real floor');
    near(s.forward[0], 0, 0.03, 'they face the lake, x');
    near(s.forward[2], -1, 0.03, 'z');
    assert.ok(s.hint[1] < -1 && Math.abs(s.hint[0]) < 0.1, 'and the line about the trigger is in front of them');
    // One step the way they face: in their room that is 150 degrees round from its "forward".
    await app(away.page, () => window.__xrDevice.position.set(2.0 - 0.5, 1.66, 1.2 + 0.866));
    await frames(away.page, 4);
    const t = await look();
    near(t.head[0], 0, 0.03, 'a step forward is a step toward the lake, x');
    near(t.head[2], -1, 0.03, 'z');
    assert.deepEqual(t.rig, s.rig, 'the valley does not move again');
    // The headset moves the origin of its space (the person recentres): once more.
    await app(away.page, () => {
      window.__dragons.xr.onReset();
      window.__xrDevice.position.set(-1, 1.66, 0.5);
      window.__xrDevice.quaternion.set(0, 0, 0, 1);
    });
    await frames(away.page, 4);
    const u = await look();
    near(u.head[0], 0, 0.03, 'after a recentre they are on the middle of the ledge again, x');
    near(u.head[2], 0, 0.03, 'z');
    near(u.forward[2], -1, 0.03, 'facing the lake');
    assert.deepEqual(away.problems, []);
  });
  await away.context.close();

  // A headset that refuses a floor-level space, and a browser without WebXR Layers.
  const plain = await open(browser, base + '?layers=off', { xr: true, stereo: true, viewport: { width: 1280, height: 720 } });
  // And the governor itself, in the page: starve it of frames and it thins the forest.
  await check('when frames keep coming late in VR the page does less: simpler sound first, then a thinner forest', async () => {
    await plain.page.waitForFunction(() => !window.__dragons.state.vr.checking);
    const s = await app(plain.page, () => {
      const d = window.__dragons;
      const full = d.stage.forest.reduce((a, m) => a + m.count, 0);
      const leaves = d.stage.leaves.geometry.instanceCount;
      // What main.js does each VR frame, with frames that take three times too long.
      let stepped = 0;
      let seconds = 0;
      let firstAt = 0;
      let soundAtFirst = '';
      for (let i = 0; i < 24 * 60; i++) {
        seconds += 3 / 72;
        if (d.governor.frame(3 / 72, 1 / 72)) {
          stepped++;
          d.applyQuality();
          if (!firstAt) {
            firstAt = seconds;
            soundAtFirst = d.audio.lite ? 'lite' : 'full';
          }
        }
      }
      return {
        full, leaves, stepped, firstAt, soundAtFirst, level: d.governor.level, quality: d.state.quality,
        now: d.stage.forest.reduce((a, m) => a + m.count, 0),
        leavesNow: d.stage.leaves.geometry.instanceCount,
        mirrors: d.dragons.map((x) => x.mirrorOn),
        batches: d.stage.forest.every((m) => m.count >= 1),
      };
    });
    assert.ok(s.firstAt > 3 && s.firstAt < 9, 'the first step comes ' + s.firstAt.toFixed(1) + ' s in');
    assert.equal(s.soundAtFirst, 'lite', 'and it is the sound that is made cheaper first');
    assert.equal(s.level, 3, 'it steps down to the last step and stops');
    assert.equal(s.quality, 3);
    assert.ok(s.now < s.full * 0.55 && s.now > s.full * 0.4, 'trees drawn: ' + s.now + ' of ' + s.full);
    assert.ok(s.leavesNow < s.leaves * 0.3, 'leaves in the air: ' + s.leavesNow + ' of ' + s.leaves);
    assert.deepEqual(s.mirrors, [false, false]);
    assert.equal(s.batches, true, 'every batch of the forest still has a tree in it');
  });
  await check('?layers=off draws through a plain XRWebGLLayer', async () => {
    await plain.page.waitForFunction(() => !window.__dragons.state.vr.checking);
    await plain.page.click('#enterVR');
    await plain.page.waitForFunction(() => window.__dragons.state.vr.presenting, null, { timeout: 15000 });
    await frames(plain.page, 4);
    assert.equal(await app(plain.page, () => window.__dragons.xr.renderPath), 'XRWebGLLayer');
    assert.deepEqual(plain.problems, []);
  });
  await check('a session that could not hold its rate is remembered: the next one is drawn smaller, and the page says so', async () => {
    // This one cannot: it is drawn in software. Twenty-odd seconds of it, which is as short as
    // a session may be and still be judged.
    await plain.page.waitForTimeout(23000);
    await app(plain.page, () => window.__dragons.xr.exit());
    await plain.page.waitForFunction(() => !window.__dragons.state.vr.presenting, null, { timeout: 10000 });
    const s = await app(plain.page, () => {
      const d = window.__dragons;
      return { last: d.state.vr.last, kept: window.localStorage.getItem('two-dragons.pace'), scale: d.xr.scale, pace: d.state.pace };
    });
    console.log('        ' + s.last);
    assert.match(s.last, /Next time the picture will be drawn at 0\.8 of full size/);
    const kept = JSON.parse(s.kept);
    assert.deepEqual({ scale: kept.scale, aa: kept.aa }, { scale: 0.8, aa: true }, 'kept in this browser');
    assert.ok(Math.abs(Date.now() - kept.at) < 60000, 'with the day it was kept on');
    assert.equal(s.scale, 0.8, 'and already set for the next session');
    // The page loaded again: it starts from what was kept.
    await plain.page.reload({ waitUntil: 'load' });
    await plain.page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 60000 });
    const again = await app(plain.page, () => ({ scale: window.__dragons.xr.scale, pace: window.__dragons.state.pace, aa: window.__dragons.stage.renderer.getContextAttributes().antialias }));
    assert.equal(again.scale, 0.8);
    assert.equal(again.aa, true, 'anti-aliasing is the second thing to go, not the first');
    // Two weeks on it is forgotten: a headset that had one bad day gets its full picture back.
    await app(plain.page, () => {
      const kept = JSON.parse(window.localStorage.getItem('two-dragons.pace'));
      kept.at -= 15 * 86400000;
      window.localStorage.setItem('two-dragons.pace', JSON.stringify(kept));
    });
    await plain.page.reload({ waitUntil: 'load' });
    await plain.page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 60000 });
    assert.equal(await app(plain.page, () => window.__dragons.xr.scale), 1, 'forgotten after two weeks');
    assert.deepEqual(plain.problems, []);
  });
  await plain.context.close();
}

async function no3D(base) {
  console.log('\nA browser without WebGL');
  const browser = await chromium.launch({ args: ['--disable-3d-apis'] }).catch(() => chromium.launch({ channel: 'chrome', args: ['--disable-3d-apis'] }));
  try {
    await check('says so on the card, and offers no dead buttons', async () => {
      const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__dragons && window.__dragons.failed, null, { timeout: 15000 });
      assert.match(await page.textContent('#note'), /could not start WebGL/);
      assert.equal(await page.isDisabled('#enterVR'), true);
      assert.equal(await page.isDisabled('#watch'), true);
      assert.equal(await page.isVisible('#card h1'), true, 'the page still says what it is');
      assert.deepEqual(errors, [], 'no uncaught error');
      await page.screenshot({ path: path.join(OUT, 'flat-no-webgl.png') });
      await context.close();
    });
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------

const started = Date.now();
await mkdir(OUT, { recursive: true });
const LIVE = process.env.SMOKE_URL || '';
const { server, url: localUrl } = await listen({});
const url = LIVE || localUrl;
let browser;
try {
  if (process.env.SMOKE_EXECUTABLE) {
    browser = await chromium.launch({ executablePath: process.env.SMOKE_EXECUTABLE, args: GL_ARGS });
  } else if (process.env.SMOKE_CHANNEL) {
    browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL, args: GL_ARGS });
  } else {
    try {
      browser = await chromium.launch({ args: GL_ARGS });
    } catch (err) {
      console.log('Bundled Chromium not found (' + String(err.message).split('\n')[0] + '); trying the installed Chrome.');
      browser = await chromium.launch({ channel: 'chrome', args: GL_ARGS });
    }
  }
  console.log('Chromium ' + browser.version() + ', page at ' + url);
  const only = (process.env.SMOKE_ONLY || '').split(',').filter(Boolean);
  const wanted = (name) => only.length === 0 || only.includes(name);
  if (wanted('flat')) await flatScreen(browser, url);
  if (wanted('phone')) await phone(browser, url);
  if (wanted('path') && !LIVE) await liveSitePath(browser);
  if (wanted('quest1')) await quest1(browser, url);
  if (wanted('no3d')) await no3D(url);
} finally {
  if (browser) await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed, ' + results.length + ' checks in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
if (failed.length) {
  console.log('Failed: ' + failed.map((f) => f.name).join('; '));
  process.exit(1);
}
