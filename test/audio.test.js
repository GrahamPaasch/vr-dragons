import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/audio.js';
import { Governor, QUALITY } from '../src/governor.js';
import { makeRng } from '../src/rng.js';
import { KEEP_OUT } from '../src/flight.js';

test('sound takes time to arrive, and a distant wingbeat is late but never by a second', () => {
  assert.equal(A.soundDelay(0), 0);
  assert.ok(Math.abs(A.soundDelay(34.3) - 0.1) < 1e-9);
  assert.ok(A.soundDelay(200) > 0.5);
  assert.equal(A.soundDelay(5000), 0.9);
  assert.equal(A.soundDelay(-3), 0);
});

test('a dragon coming sounds higher than one going, by a few percent', () => {
  assert.equal(A.dopplerRatio(0), 1);
  const coming = A.dopplerRatio(-20);
  const going = A.dopplerRatio(20);
  assert.ok(coming > 1.04 && coming < 1.08, 'coming at 20 m/s: ' + coming.toFixed(3));
  assert.ok(going < 0.96 && going > 0.92, 'going: ' + going.toFixed(3));
  assert.ok(Number.isFinite(A.dopplerRatio(-1000)), 'whatever the speed');
});

test('distance dulls and quietens; a roar carries further than a wingbeat', () => {
  let last = Infinity;
  for (const d of [5, 20, 60, 150, 400]) {
    const c = A.airCutoff(d);
    assert.ok(c < last && c > 500, 'cutoff at ' + d + ' m: ' + c.toFixed(0) + ' Hz');
    last = c;
  }
  const fall = { ref: 14, rolloff: 1.1 };
  assert.equal(A.falloffGain(5, fall), 1, 'full strength inside the reference distance');
  assert.ok(A.falloffGain(60, fall) < 0.25 && A.falloffGain(200, fall) < 0.08);
  // A roar from across the lake is still a good part of one heard close.
  const far = A.roarReach(200) * A.falloffGain(200, fall);
  const near = A.roarReach(KEEP_OUT + 3) * A.falloffGain(KEEP_OUT + 3, fall);
  assert.ok(far / near > 0.25 && far / near < 1, 'far against near: ' + (far / near).toFixed(2));
  // While a wingbeat from there is a small fraction.
  assert.ok(A.falloffGain(200, fall) / A.falloffGain(12, fall) < 0.08);
});

test('every bird has a call: notes in order, in the voice of the bird', () => {
  const rng = makeRng(9);
  const range = { chickadeeSong: [3000, 4500], sparrow: [2500, 4200], crow: [350, 800], jay: [2000, 3200], woodpecker: [800, 1500] };
  for (const kind of A.BIRD_KINDS) {
    for (let n = 0; n < 20; n++) {
      const notes = A.birdNotes(kind, rng);
      assert.ok(notes.length >= 2, kind + ' has ' + notes.length + ' notes');
      const length = A.notesLength(notes);
      assert.ok(length > 0.3 && length < 4.5, kind + ' lasts ' + length.toFixed(2) + ' s');
      let last = -1;
      for (const note of notes) {
        assert.ok(note.t >= last, 'notes in order');
        last = note.t;
        assert.ok(note.d > 0.005 && note.d < 0.8);
        assert.ok(note.gain > 0 && note.gain <= 1);
        assert.ok(['tone', 'buzz', 'knock'].includes(note.kind));
        if (range[kind]) assert.ok(note.f0 >= range[kind][0] && note.f0 <= range[kind][1], kind + ' at ' + note.f0 + ' Hz');
      }
    }
  }
  assert.equal(A.birdNotes('nothing', rng).length, 0);
  // The chickadee's song: the second whistle a step below the first.
  const song = A.birdNotes('chickadeeSong', makeRng(1));
  assert.ok(song[1].f0 < song[0].f0 * 0.92 && song[1].f0 > song[0].f0 * 0.8);
});

test('birds sing from where they would be: chickadees close, crows far, nothing on top of the viewer', () => {
  const rng = makeRng(4);
  for (const kind of A.BIRD_KINDS) {
    for (let n = 0; n < 40; n++) {
      const p = A.birdPlace(kind, rng);
      const d = Math.hypot(p[0], p[1] - 1.6, p[2]);
      assert.ok(d > 3, kind + ' at ' + d.toFixed(1) + ' m');
      if (kind.startsWith('chickadee')) assert.ok(d < 45, 'a chickadee in the trees by the ledge: ' + d.toFixed(0) + ' m');
      if (kind === 'crow') assert.ok(d > 150, 'crows far off: ' + d.toFixed(0) + ' m');
    }
  }
});

test('the levels are sane numbers', () => {
  for (const [name, v] of Object.entries(A.LEVEL)) assert.ok(v > 0 && v < 10, name + ' = ' + v);
  assert.ok(A.LEVEL.master <= 1);
});

// ---------------------------------------------------------------------------------------------

const run = (g, seconds, fps, nominal) => {
  let changes = 0;
  for (let i = 0; i < seconds * fps; i++) if (g.frame(1 / fps, nominal)) changes++;
  return changes;
};

test('the governor leaves a picture that keeps up alone', () => {
  const g = new Governor();
  assert.equal(run(g, 120, 72, 1 / 72), 0);
  assert.equal(g.level, 0);
  // A single long hitch (a shader compiling, the system menu) is not a reason either.
  for (let i = 0; i < 400; i++) g.frame(i === 200 ? 0.4 : 1 / 72, 1 / 72);
  assert.equal(g.level, 0);
  // Nor is a page left in the background, where frames come once a second or are capped at a tenth.
  for (let i = 0; i < 2000; i++) g.frame(i % 2 ? 1 : 0.1, 1 / 72);
  assert.equal(g.level, 0, 'pauses are not slow frames');
});

test('when frames keep coming late it thins the picture one step at a time, and never puts it back', () => {
  const g = new Governor();
  // A headset running at half rate: every frame takes two.
  const first = run(g, 4, 36, 1 / 72);
  assert.equal(first, 0, 'not in the first seconds: things are still settling');
  const more = run(g, 8, 36, 1 / 72);
  assert.ok(more >= 1, 'then it steps down');
  assert.ok(g.level >= 1);
  run(g, 120, 36, 1 / 72);
  assert.equal(g.level, QUALITY.length - 1, 'as far as the last step, no further');
  const level = g.level;
  run(g, 120, 72, 1 / 72);
  assert.equal(g.level, level, 'and it does not step back up');
  g.reset();
  assert.equal(g.level, 0, 'until the next session');
});

test('one frame in five late is enough, even if the average looks fine', () => {
  const g = new Governor();
  let changed = false;
  for (let i = 0; i < 72 * 30; i++) if (g.frame(i % 5 === 0 ? 2 / 72 : 0.8 / 72, 1 / 72)) changed = true;
  assert.ok(changed);
});

test('each step draws less than the one before', () => {
  for (let i = 1; i < QUALITY.length; i++) {
    assert.ok(QUALITY[i].forest < QUALITY[i - 1].forest);
    assert.ok(QUALITY[i].leaves < QUALITY[i - 1].leaves);
  }
  assert.deepEqual(QUALITY[0], { forest: 1, leaves: 1, mirror: true });
  assert.ok(QUALITY[QUALITY.length - 1].forest >= 0.4, 'the valley is still a forest at the last step');
  assert.ok(new Governor().frame(NaN, 1 / 72) === false);
});
