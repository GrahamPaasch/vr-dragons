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

  const FRAME = 1 / 72;
  /**
   * Drive a scene the way the page does: `each(t, dt)` is called 72 times a second of the
   * rendering, with the audio clock stopped at t. (The page sets positions and steps filters
   * once a frame; nothing of that can be scheduled ahead.)
   */
  function drive(ctx, seconds, each) {
    for (let k = 1; k * FRAME < seconds; k++) {
      ctx.suspend(k * FRAME).then(() => {
        each(k * FRAME, FRAME);
        ctx.resume();
      });
    }
  }
  const EARS = { position: [0, 1.62, 0], forward: [0, 0, -1], up: [0, 1, 0] };

  /**
   * No wind, no forest, no maple, no birds: only what the scene itself makes. (What blow() has
   * already asked for is cancelled first: the forest and the maple are told a moment later
   * than the wind, and a zero written at the start would otherwise be overruled.)
   */
  function hush(board) {
    board.blow(0, 0, 0.01);
    for (const g of [...board.windGains, board.forestGain, board.mapleGain]) {
      g.gain.cancelScheduledValues(0);
      g.gain.setValueAtTime(0, 0);
    }
    board.nextGust = Infinity;
    board.nextBird = Infinity;
  }

  /**
   * Does placing a dragon in steps put clicks on a close pass? A pure tone is put where the
   * dragon is and flown past the ledge, 12 m off at 16 m/s, placed by the page's own update()
   * 72 times a second. Whatever comes out that is not the tone (more than 12 Hz from it) is
   * what the stepping adds: it is given in dB below the tone, and it must stay 30 dB down.
   * (A dragon's own sounds are noise and a growl, which hide far more than that.)
   */
  async function probe(name, hrtf) {
    const seconds = 9;
    const tone = 1000;
    const ctx = new OfflineAudioContext(2, seconds * rate, rate);
    const board = new A.Soundscape({ hrtf, reverb: false, seed: 3 });
    board.attach(ctx, [1, 0.78]);
    hush(board);
    const osc = ctx.createOscillator();
    osc.frequency.value = tone;
    const level = ctx.createGain();
    level.gain.value = 0.2;
    osc.connect(level).connect(board.dragons[0].panner);
    osc.start();
    // (At no speed: its own rush of air is not wanted here.)
    const movers = [{ x: 0, y: 8.8, z: -9.6, vx: 0, vy: 0, vz: 0, speed: 0, beating: 0 }, { x: 300, y: 50, z: -300, vx: 0, vy: 0, vz: 0, speed: 0, beating: 0 }];
    drive(ctx, seconds, (t, dt) => {
      movers[0].x = 16 * (t - 4.5);
      board.update(dt, EARS, movers);
    });
    const buffer = await ctx.startRendering();
    const size = 131072;
    const hz = rate / size;
    let worst = -Infinity;
    for (let c = 0; c < 2; c++) {
      const power = spectrum(buffer.getChannelData(c), Math.round(4.5 * rate - size / 2), size);
      let inTone = 0;
      let rest = 0;
      for (let i = 1; i < power.length; i++) {
        if (Math.abs(i * hz - tone) <= 12) inTone += power[i];
        else rest += power[i];
      }
      worst = Math.max(worst, 10 * Math.log10(rest / inTone + 1e-20));
    }
    const row = { name, seconds, all: measure(buffer), note: `everything that is not the tone: ${worst.toFixed(1)} dB relative to it` };
    if (!(worst < -30)) row.problem = `${name}: placing it in steps is heard (${worst.toFixed(1)} dB relative to the tone; -30 wanted)`;
    return row;
  }

  async function scene(name, seconds, setup, windows, note) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const board = new A.Soundscape({ hrtf: true, reverb: true, seed: 3 });
    board.attach(ctx, [1, 0.78]);
    if (ctx.listener.positionY) ctx.listener.positionY.value = 1.62;
    // The air is always there; scenes that are about something else turn it off, and the
    // birds with it.
    const quiet = () => hush(board);
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
  // The air alone: calm, a gust, calm again. (Driven frame by frame: the wind's filters are
  // stepped by update().)
  rows.push(
    await scene('air: calm, gust, calm', 24, (b, quiet, ctx) => {
      b.nextGust = Infinity;
      b.nextBird = Infinity;
      b.blow(0.15, 0, 1);
      b.blow(1, 8, 3);
      b.blow(0.2, 16, 3);
      drive(ctx, 24, (t, dt) => b.update(dt, EARS, []));
    }, [[4, 8, 'calm'], [12, 16, 'gust'], [20, 24, 'calm again']])
  );
  // (Beating: the rush of its passage stands back behind the beats.)
  const still = (b, i, x, y, z) => b.dragons[i].move(x, y, z, 12, 0, Math.hypot(x, y - 1.62, z), 0, 0.6);
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
  for (const [label, speed, distance] of [['25 m/s at 15 m', 25, 15], ['16 m/s at 15 m', 16, 15], ['16 m/s at 80 m', 16, 80]]) {
    rows.push(
      await scene('glide, big dragon, ' + label, 4, (b, quiet) => {
        quiet();
        b.dragons[0].move(0, 5, -distance, speed, 0, distance, 0);
      })
    );
  }
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
  for (const [label, kind, i, x, y, z] of [['answering call, big, 150 m', 'answer', 0, -20, -8, -150], ['answering call, small, 60 m', 'answer', 1, 30, 4, -52], ['"on my way" grunts, big, 90 m', 'busy', 0, 10, 0, -90]]) {
    rows.push(
      await scene(label, 4, (b, quiet) => {
        quiet();
        still(b, i, x, y, z);
        b.dragons[i].cry(kind, 0.3);
      })
    );
  }
  // A dragon flies past: from the left, 12 m in front and above, to the right, beating all the way.
  rows.push(
    await scene('a pass: left to right, 12 m off, 16 m/s', 14, (b, quiet, ctx) => {
      quiet();
      const v = 16;
      const voice = b.dragons[0];
      let nextBeat = 0.2;
      drive(ctx, 14, (t) => {
        const x = -112 + v * t;
        const distance = Math.hypot(x, 8 - 1.62, -9);
        voice.move(x, 8, -9, v, (x * v) / distance, distance, t, 0.6);
        if (t >= nextBeat && t < 13.5) {
          nextBeat += 0.95;
          voice.beat(1, t);
        }
      });
    }, [[0, 2, 'far left'], [5, 6.5, 'coming'], [6.6, 7.4, 'overhead'], [7.6, 9, 'going'], [12, 14, 'far right']])
  );
  // The same pass with a pure tone in place of the dragon: is the stepping of its place heard?
  rows.push(await probe('a tone flown past 12 m off, placed as the page places it', true));
  rows.push(await probe('the same, with the cheaper placing (plain left and right)', false));
  // The real thing: the director flies, and the page's own per-frame code drives the sound, 72
  // times a second, with the listener on the ledge facing the lake.
  const F = await import('./src/flight.js');
  const G = await import('./src/dragonGeometry.js');
  const builds = G.DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale }));
  /**
   * `seconds` of a flight from `skip` seconds into it. only: 'dragons' (no wind, no birds),
   * 'air' (the wind as it blows, no dragons, no birds) or nothing (everything).
   * opening: lanes to fly first, instead of the usual opening.
   */
  const flight = (name, seconds, skip, callAt, windows, only, opening) =>
    scene(
      name,
      seconds,
      (b, quiet, ctx) => {
        const director = new F.Director(builds, 20261115, opening ? { opening } : undefined);
        const dt = FRAME;
        for (let t = 0; t < skip; t += dt) director.step(dt);
        director.drain();
        const movers = [{}, {}];
        let called = false;
        b.nearestSeen = Infinity;
        if (only === 'dragons') quiet();
        if (only === 'air') b.nextBird = Infinity;
        drive(ctx, seconds, (t) => {
          if (callAt !== null && !called && t >= callAt) {
            called = true;
            b.whistle();
            director.call();
          }
          director.step(dt);
          for (const e of director.drain()) {
            if (only === 'air') continue;
            if (e.type === 'beat') b.beat(e.dragon, e.strength);
            else if (e.type === 'roar') b.roar(e.dragon, e.kind, F.ROAR_SECONDS);
            else if (e.type === 'call') b.cry(e.dragon, 'answer');
            else if (e.type === 'busy') b.cry(e.dragon, 'busy');
          }
          director.flyers.forEach((f, i) => {
            const flat = Math.cos(f.gamma) * f.speed;
            Object.assign(movers[i], { x: f.x, y: f.y, z: f.z, vx: flat * Math.sin(f.heading), vy: Math.sin(f.gamma) * f.speed, vz: flat * Math.cos(f.heading), speed: f.speed, beating: f.power });
          });
          b.update(dt, EARS, only === 'air' ? [] : movers);
          if (only !== 'air') b.nearestSeen = Math.min(b.nearestSeen, b.nearest);
        });
      },
      windows,
      (b) => `wingbeats ${b.stats.beats}, roars ${b.stats.roars}, calls ${b.stats.cries || 0}, bird calls ${b.stats.birds}, gusts ${b.stats.gusts}, whistles ${b.stats.whistles || 0}` + (only === 'air' ? '' : `; nearest dragon ${b.nearestSeen.toFixed(0)} m`)
    );
  rows.push(await flight('the opening as flown: 50 s from the start', 50, 0, null, [[0, 7, 'far off, coming'], [10, 18, 'the eight, first loop'], [22, 32, 'the eight, second loop'], [42, 50, 'gone round the lake']]));
  rows.push(await flight('a call, as flown: whistle at 3 s', 26, 130, 3, [[0, 3, 'before'], [3, 4.5, 'the whistle and the answer'], [4.5, 22, 'it comes and goes by'], [22, 26, 'after']]));

  // The near passes as they are really flown: is a dragon heard to come? Each is rendered
  // with the dragons alone, and at their nearest they must stand 6 dB clear of the wind as it
  // blows over 16 s (rendered alone, once), and 6 dB over themselves 80 m out. (They once did
  // not: the nearer they came, the slower they flew, the less they beat and the less they
  // were heard.)
  const air = await flight('16 s of the wind alone, as it blows', 16, 0, null, null, 'air');
  rows.push(air);
  for (const lane of ['cross', 'shoulder', 'narrows']) {
    // Where in the flight is the nearest moment of this lane?
    const director = new F.Director(builds, 20261115, { opening: ['far turn', lane] });
    let nearest = Infinity;
    let at = 0;
    for (let t = 0; t < 70; t += FRAME) {
      director.step(FRAME);
      director.drain();
      if (director.find(director.center).lane.name !== lane) continue;
      for (const f of director.flyers) {
        const d = Math.hypot(f.x, f.y - 1.62, f.z);
        if (d < nearest) {
          nearest = d;
          at = t;
        }
      }
    }
    const skip = Math.max(at - 9, 0);
    const from = at - skip;
    const windows = [[Math.max(from - 8, 0), from - 5, '80 m or so out'], [from - 1.2, from + 1.2, 'at its nearest'], [from + 4, from + 7, 'gone by']];
    const alone = await flight(`'${lane}' as flown, the dragons alone (nearest ${nearest.toFixed(0)} m)`, 16, skip, null, windows, 'dragons', ['far turn', lane]);
    const clear = alone.windows[1].loud - air.all.rms;
    alone.note += `; at its nearest ${clear.toFixed(1)} dB over the wind (${air.all.rms.toFixed(1)} dB)`;
    if (clear < 6) alone.problem = `the dragons are only ${clear.toFixed(1)} dB over the wind at their nearest on '${lane}' (6 dB wanted)`;
    if (alone.windows[1].loud < alone.windows[0].loud + 6) alone.problem = `a dragon on '${lane}' is not heard to come: ${alone.windows[0].loud.toFixed(1)} dB far out, ${alone.windows[1].loud.toFixed(1)} dB at its nearest`;
    rows.push(alone);
  }
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
    if (row.problem) problems.push(row.problem);
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
