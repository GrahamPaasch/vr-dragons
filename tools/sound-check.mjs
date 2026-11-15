#!/usr/bin/env node
/**
 * Renders the sounds without a sound card and measures them, because a headless test cannot
 * listen: how loud each one is, where its energy lies, and whether a dragon passing by is heard
 * to come, pass and go. The numbers are what the levels in src/audio.js were set from.
 *
 *   node tools/sound-check.mjs            print the table
 *   node tools/sound-check.mjs --wav      also write test-results/sound/*.wav to listen to
 *
 * The page's own audio.js builds the graph, on an OfflineAudioContext in headless Chromium.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { listen } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'sound');
const wantWav = process.argv.includes('--wav');

/** Runs in the page. Returns one row of measurements per scene (and the samples, if asked). */
async function renderAll(wantSamples) {
  const A = await import('./src/audio.js');
  const rate = 48000;
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);

  // An in-place radix-2 FFT, for the spectrum.
  function spectrum(samples, start, size) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      re[i] = (samples[start + i] || 0) * w;
    }
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const t = re[i];
        re[i] = re[j];
        re[j] = t;
      }
    }
    for (let len = 2; len <= size; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < size; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k];
          const ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr;
          im[i + k + len / 2] = ui - vi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
    const power = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    return power;
  }

  function measure(buffer, from, to) {
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);
    const a = Math.floor((from || 0) * rate);
    const b = Math.min(Math.floor((to || buffer.duration) * rate), L.length);
    let peak = 0;
    let sumL = 0;
    let sumR = 0;
    let bad = 0;
    const mono = new Float32Array(b - a);
    for (let i = a; i < b; i++) {
      if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad++;
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      sumL += L[i] * L[i];
      sumR += R[i] * R[i];
      mono[i - a] = 0.5 * (L[i] + R[i]);
    }
    const n = Math.max(b - a, 1);
    // Loudest 0.4 s (so that a short call in a long silence is not averaged away).
    const win = Math.floor(0.4 * rate);
    let best = 0;
    let bestAt = a;
    let run = 0;
    for (let i = a; i < b; i++) {
      run += L[i] * L[i] + R[i] * R[i];
      if (i - a >= win) run -= L[i - win] * L[i - win] + R[i - win] * R[i - win];
      if (run > best) {
        best = run;
        bestAt = Math.max(a, i - win + 1);
      }
    }
    // Where the energy is, around the loudest moment.
    const size = 16384;
    const power = spectrum(mono, Math.max(0, Math.min(bestAt - a, mono.length - size)), size);
    const hz = rate / size;
    const bands = [0, 150, 500, 2000, 6000, 24000];
    const energy = [0, 0, 0, 0, 0];
    let total = 0;
    let top = 0;
    let topHz = 0;
    let centroid = 0;
    for (let i = 1; i < power.length; i++) {
      const f = i * hz;
      total += power[i];
      centroid += power[i] * f;
      if (power[i] > top) {
        top = power[i];
        topHz = f;
      }
      for (let k = 0; k < 5; k++) if (f >= bands[k] && f < bands[k + 1]) energy[k] += power[i];
    }
    return {
      peak: db(peak),
      rms: db(Math.sqrt((sumL + sumR) / (2 * n))),
      loud: db(Math.sqrt(best / (2 * win))),
      left: db(Math.sqrt(sumL / n)),
      right: db(Math.sqrt(sumR / n)),
      bands: energy.map((e) => Math.round((100 * e) / (total || 1))),
      topHz: Math.round(topHz),
      centroid: Math.round(centroid / (total || 1)),
      bad,
    };
  }

  async function scene(name, seconds, setup, windows, note) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const board = new A.Soundscape({ hrtf: true, reverb: true, seed: 3 });
    board.attach(ctx, [1, 0.78]);
    if (ctx.listener.positionY) ctx.listener.positionY.value = 1.62;
    // The air is always there; scenes that are about something else turn it off.
    const quiet = () => {
      board.blow(0, 0, 0.01);
      for (const g of board.windGains) g.gain.setValueAtTime(0, 0);
      board.forestGain.gain.setValueAtTime(0, 0);
      board.mapleGain.gain.setValueAtTime(0, 0);
    };
    setup(board, quiet, ctx);
    const buffer = await ctx.startRendering();
    const row = { name, seconds, all: measure(buffer) };
    if (note) row.note = note(board);
    if (windows) row.windows = windows.map(([from, to, label]) => Object.assign({ label }, measure(buffer, from, to)));
    if (wantSamples) {
      // 16-bit stereo, as a base64 string.
      const L = buffer.getChannelData(0);
      const R = buffer.getChannelData(1);
      const pcm = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) {
        pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767;
        pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
      }
      const bytes = new Uint8Array(pcm.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      row.pcm = btoa(s);
    }
    return row;
  }

  const rows = [];
  // The air alone: calm, a gust, calm again.
  rows.push(
    await scene('air: calm, gust, calm', 24, (b) => {
      b.blow(0.15, 0, 1);
      b.blow(1, 8, 3);
      b.blow(0.2, 16, 3);
    }, [[4, 8, 'calm'], [12, 16, 'gust'], [20, 24, 'calm again']])
  );
  const still = (b, i, x, y, z) => b.dragons[i].move(x, y, z, 12, 0, Math.hypot(x, y - 1.62, z), 0, 0.01);
  for (const [label, x, y, z] of [['15 m ahead', 0, 5, -15], ['60 m ahead', 0, 5, -60], ['200 m ahead', 0, -10, -200]]) {
    rows.push(
      await scene('wingbeats, big dragon, ' + label, 6, (b, quiet) => {
        quiet();
        still(b, 0, x, y, z);
        for (let t = 0.3; t < 5; t += 0.95) b.dragons[0].beat(1, t);
      })
    );
  }
  rows.push(
    await scene('wingbeats, small dragon, 15 m ahead', 6, (b, quiet) => {
      quiet();
      still(b, 1, 0, 5, -15);
      for (let t = 0.3; t < 5; t += 0.75) b.dragons[1].beat(1, t);
    })
  );
  rows.push(
    await scene('glide, big dragon, 25 m/s at 15 m', 4, (b, quiet) => {
      quiet();
      b.dragons[0].move(0, 5, -15, 25, 0, 15, 0, 0.01);
    })
  );
  for (const [label, kind, i, x, y, z] of [['far roar, big, 200 m', 'far', 0, -30, -10, -200], ['far roar, small, 120 m', 'far', 1, 80, 10, -90], ['called roar, big, 70 m', 'call', 0, 20, 5, -68], ['called roar, small, 40 m', 'call', 1, 10, 8, -38]]) {
    rows.push(
      await scene(label, 7, (b, quiet) => {
        quiet();
        still(b, i, x, y, z);
        b.dragons[i].roar(kind, 0.3, 1.9);
      }, [[0.3, 3, 'the roar'], [3.2, 7, 'what comes back']])
    );
  }
  for (const kind of A.BIRD_KINDS) {
    rows.push(
      await scene('bird: ' + kind, 6, (b, quiet) => {
        quiet();
        b.bird(kind, A.birdPlace(kind, b.rng), 0.2);
      })
    );
  }
  // A dragon flies past: from the left, 12 m in front and above, to the right, beating all the way.
  rows.push(
    await scene('a pass: left to right, 12 m off, 16 m/s', 14, (b, quiet) => {
      quiet();
      const v = 16;
      const voice = b.dragons[0];
      const dt = 1 / 72;
      for (let t = 0; t < 14; t += dt) {
        const x = -112 + v * t;
        const distance = Math.hypot(x, 8 - 1.62, -9);
        voice.move(x, 8, -9, v, (x * v) / distance, distance, t, dt);
      }
      // Beats must be scheduled after the moves that say how far off it is.
      for (let t = 0.2; t < 13.5; t += 0.95) {
        const x = -112 + v * t;
        voice.distance = Math.hypot(x, 8 - 1.62, -9);
        voice.doppler = A.dopplerRatio((x * v) / voice.distance);
        voice.beat(1, t);
      }
    }, [[0, 2, 'far left'], [5, 6.5, 'coming'], [6.6, 7.4, 'overhead'], [7.6, 9, 'going'], [12, 14, 'far right']])
  );
  // The real thing: the director flies, and the page's own per-frame code drives the sound, 72
  // times a second, with the listener on the ledge facing the lake.
  const F = await import('./src/flight.js');
  const G = await import('./src/dragonGeometry.js');
  const builds = G.DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale }));
  const flight = (name, seconds, skip, callAt, windows) =>
    scene(
      name,
      seconds,
      (b, quiet, ctx) => {
        const director = new F.Director(builds, 20261115);
        const dt = 1 / 72;
        for (let t = 0; t < skip; t += dt) director.step(dt);
        director.drain();
        const listener = { position: [0, 1.62, 0], forward: [0, 0, -1], up: [0, 1, 0] };
        const movers = [{}, {}];
        let called = false;
        b.nearestSeen = Infinity;
        for (let k = 1; k * dt < seconds; k++) {
          ctx.suspend(k * dt).then(() => {
            if (callAt !== null && !called && k * dt >= callAt) {
              called = true;
              b.whistle();
              director.call();
            }
            director.step(dt);
            for (const e of director.drain()) {
              if (e.type === 'beat') b.beat(e.dragon, e.strength);
              else if (e.type === 'roar') b.roar(e.dragon, e.kind, F.ROAR_SECONDS);
            }
            director.flyers.forEach((f, i) => {
              const flat = Math.cos(f.gamma) * f.speed;
              Object.assign(movers[i], { x: f.x, y: f.y, z: f.z, vx: flat * Math.sin(f.heading), vy: Math.sin(f.gamma) * f.speed, vz: flat * Math.cos(f.heading), speed: f.speed });
            });
            b.update(dt, listener, movers);
            b.nearestSeen = Math.min(b.nearestSeen, b.nearest);
            ctx.resume();
          });
        }
      },
      windows,
      (b) => `wingbeats ${b.stats.beats}, roars ${b.stats.roars}, bird calls ${b.stats.birds}, gusts ${b.stats.gusts}, whistles ${b.stats.whistles || 0}; nearest dragon ${b.nearestSeen.toFixed(0)} m`
    );
  rows.push(await flight('the opening as flown: 50 s from the start', 50, 0, null, [[0, 7, 'far off, coming'], [10, 18, 'the eight, first loop'], [22, 32, 'the eight, second loop'], [42, 50, 'gone round the lake']]));
  rows.push(await flight('a call, as flown: whistle at 3 s', 26, 95, 3, [[0, 3, 'before'], [3, 4, 'the whistle'], [4, 22, 'it comes and goes by'], [22, 26, 'after']]));
  return rows;
}

const { server, url } = await listen({});
let browser;
try {
  try {
    browser = await chromium.launch();
  } catch (err) {
    browser = await chromium.launch({ channel: 'chrome' });
  }
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text());
  });
  await page.goto(url + '?shots=1', { waitUntil: 'load' });
  const rows = await page.evaluate(renderAll, wantWav);
  const pad = (v, n) => String(v).padStart(n);
  const line = (label, m) =>
    `${label.padEnd(44)} peak ${pad(m.peak.toFixed(1), 6)}  loudest 0.4 s ${pad(m.loud.toFixed(1), 6)}  L ${pad(m.left.toFixed(1), 6)} R ${pad(m.right.toFixed(1), 6)}  ` +
    `bands <150/500/2k/6k/+ ${m.bands.map((b) => pad(b, 3)).join(' ')}%  top ${pad(m.topHz, 5)} Hz  centre ${pad(m.centroid, 5)} Hz${m.bad ? '  NOT FINITE: ' + m.bad : ''}`;
  console.log('Levels are dB relative to full scale, after the limiter.\n');
  for (const row of rows) {
    console.log(line(row.name, row.all));
    for (const w of row.windows || []) console.log(line('    ' + w.label, w));
    if (row.note) console.log('    ' + row.note);
    if (row.all.bad) problems.push(row.name + ': ' + row.all.bad + ' samples are not finite');
    if (row.all.peak > -0.1) problems.push(row.name + ': clips (peak ' + row.all.peak.toFixed(1) + ' dB)');
    if (row.all.loud < -70) problems.push(row.name + ': silent');
  }
  if (wantWav) {
    await mkdir(OUT, { recursive: true });
    for (const row of rows) {
      const pcm = Buffer.from(row.pcm, 'base64');
      const head = Buffer.alloc(44);
      head.write('RIFF', 0);
      head.writeUInt32LE(36 + pcm.length, 4);
      head.write('WAVEfmt ', 8);
      head.writeUInt32LE(16, 16);
      head.writeUInt16LE(1, 20);
      head.writeUInt16LE(2, 22);
      head.writeUInt32LE(48000, 24);
      head.writeUInt32LE(48000 * 4, 28);
      head.writeUInt16LE(4, 32);
      head.writeUInt16LE(16, 34);
      head.write('data', 36);
      head.writeUInt32LE(pcm.length, 40);
      const file = path.join(OUT, row.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '.wav');
      await writeFile(file, Buffer.concat([head, pcm]));
    }
    console.log('\nWrote ' + rows.length + ' files to ' + path.relative(ROOT, OUT) + '/');
  }
  if (problems.length) {
    console.log('\nPROBLEMS:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
