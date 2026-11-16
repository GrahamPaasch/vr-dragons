#!/usr/bin/env node
/**
 * How well does each dragon stand out from the valley behind it? Nobody can judge that from
 * the code: the valley is the same reds and golds as one of them, and all of it is in mist.
 *
 * So the flight is flown, and every few seconds each dragon is drawn twice from the ledge, at
 * the 16 pixels a degree of a Quest 1: once as it is, and once with that dragon left out. The
 * pixels that differ are the dragon's; for each of them the difference in colour between the
 * dragon and what was behind it is worked out (CIE76, in L*a*b*), and the mean over the dragon
 * is that sample's number. As a guide: under 10 is hard to pick out, 10 to 20 is seen by
 * somebody who knows where to look, over 25 stands out.
 *
 *   node tools/contrast.mjs                  the first 470 s of the usual flight, every 3 s
 *   node tools/contrast.mjs 900 5 7          900 s, every 5 s, on seed 7
 */
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const seconds = Number(process.argv[2] || 470);
const every = Number(process.argv[3] || 3);
const seed = process.argv[4];
const GL_ARGS = process.env.SHOTS_GPU
  ? ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Runs in the page. */
function measureAll({ seconds, every }) {
  const d = window.__dragons;
  d.setFlatShot();
  d.seek(2);
  const gl = d.stage.renderer.getContext();
  const W = gl.drawingBufferWidth;
  const H = gl.drawingBufferHeight;
  // 16 pixels a degree across the picture.
  const across = W / 16;
  d.stage.camera.fov = (2 * Math.atan(Math.tan((across * Math.PI) / 360) * (H / W)) * 180) / Math.PI;
  d.stage.camera.updateProjectionMatrix();
  const grab = () => {
    d.stage.render();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const lab = (r, g, b, out) => {
    const lin = (v) => {
      const c = v / 255;
      return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
    };
    const R = lin(r);
    const G = lin(g);
    const B = lin(b);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    out[0] = 116 * y - 16;
    out[1] = 500 * (x - y);
    out[2] = 200 * (y - z);
  };
  const la = [0, 0, 0];
  const lb = [0, 0, 0];
  const rows = [];
  for (let t = 2; t < seconds; t += every) {
    const lane = d.director.find(d.director.center).lane.name;
    for (let k = 0; k < 2; k++) {
      const f = d.director.flyers[k];
      const cam = d.stage.camera.position;
      const dx = f.x - cam.x;
      const dy = f.y - cam.y;
      const dz = f.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      d.view.set(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      d.view.apply();
      const view = d.dragons[k];
      const flame = view.flame.visible;
      const a = grab();
      view.mesh.visible = false;
      view.flame.visible = false;
      const b = grab();
      view.mesh.visible = true;
      view.flame.visible = flame;
      let n = 0;
      let sum = 0;
      let lighter = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) <= 3) continue;
        lab(a[i], a[i + 1], a[i + 2], la);
        lab(b[i], b[i + 1], b[i + 2], lb);
        sum += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
        lighter += la[0] - lb[0];
        n++;
      }
      rows.push({ t, k, lane, dist, up: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI, pixels: n, dE: n >= 6 ? sum / n : 0, dL: n >= 6 ? lighter / n : 0 });
    }
    d.fly(every);
  }
  return { rows, size: [W, H] };
}

const { server, url } = await listen({});
let browser;
try {
  browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  page.on('pageerror', (e) => console.log('page error: ' + e.message));
  await page.goto(url + '?shots=1&governor=off' + (seed ? '&seed=' + seed : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dragons && window.__dragons.ready, null, { timeout: 120000 });
  const { rows, size } = await page.evaluate(measureAll, { seconds, every });

  const names = ['Ember (red)', 'Tarn (teal)'];
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const share = (a, test) => (a.length ? Math.round((100 * a.filter(test).length) / a.length) : 0);
  const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const pad = (v, n) => String(v).padStart(n);
  console.log(`${rows.length / 2} moments of ${seconds} s of flight${seed ? ' on seed ' + seed : ''}, each dragon drawn with and without, ${size[0]} x ${size[1]} at 16 pixels a degree.`);
  console.log('Colour difference (CIE76) between the dragon and what is behind it: under 10 hard to pick out, 10 to 20 seen if looked for, over 25 stands out.');
  for (let k = 0; k < 2; k++) {
    console.log(`\n${names[k]}`);
    console.log('  distance      moments  pixels   mean  lowest tenth  under 15  under 20  out of sight');
    for (const [lo, hi] of [[0, 60], [60, 100], [100, 160], [160, 240], [240, Infinity]]) {
      const all = rows.filter((r) => r.k === k && r.dist >= lo && r.dist < hi);
      if (!all.length) continue;
      const seen = all.filter((r) => r.pixels >= 6);
      const dE = seen.map((r) => r.dE).sort((x, y) => x - y);
      const label = (hi === Infinity ? `beyond ${lo} m` : `${lo} to ${hi} m`).padEnd(13);
      console.log(`  ${label} ${pad(all.length, 7)} ${pad(median(seen.map((r) => r.pixels)), 7)} ${pad(mean(dE).toFixed(1), 6)} ${pad((dE[Math.floor(dE.length / 10)] || 0).toFixed(1), 13)} ${pad(share(dE, (v) => v < 15) + '%', 9)} ${pad(share(dE, (v) => v < 20) + '%', 9)} ${pad(share(all, (r) => r.pixels < 6) + '%', 13)}`);
    }
    const seen = rows.filter((r) => r.k === k && r.pixels >= 6);
    console.log(`  in all: mean ${mean(seen.map((r) => r.dE)).toFixed(1)}, under 15 in ${share(seen, (r) => r.dE < 15)}%, under 20 in ${share(seen, (r) => r.dE < 20)}%; lighter than what is behind it in ${share(seen, (r) => r.dL > 0)}%`);
    const lanes = [...new Set(seen.map((r) => r.lane))];
    console.log('  by lane: ' + lanes.map((lane) => {
      const r = seen.filter((x) => x.lane === lane);
      return `${lane} ${mean(r.map((x) => x.dE)).toFixed(0)} (under 20 in ${share(r, (x) => x.dE < 20)}% of ${r.length})`;
    }).join(', '));
  }
  const worst = rows.filter((r) => r.pixels >= 6 && r.dist < 240).sort((x, y) => x.dE - y.dE).slice(0, 8);
  console.log('\nThe moments at which a dragon stood out least (within 240 m):');
  for (const r of worst) console.log(`  ${pad(r.t, 5)} s  ${names[r.k].padEnd(12)} on '${r.lane}', ${Math.round(r.dist)} m off, ${Math.round(r.up)} degrees up, ${r.pixels} pixels: ${r.dE.toFixed(1)}`);
} finally {
  if (browser) await browser.close();
  server.close();
}
