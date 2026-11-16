import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/audio.js';
import { Governor, QUALITY, QUALITY_WORDS, nextSession } from '../src/governor.js';
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

test('when frames keep coming late it does less, one step at a time, and never puts it back', () => {
  const g = new Governor();
  // A headset running at half rate: every frame takes two.
  const first = run(g, 4, 36, 1 / 72);
  assert.equal(first, 0, 'not in the first seconds: things are still settling');
  const more = run(g, 4, 36, 1 / 72);
  assert.equal(more, 1, 'then it steps down: within eight seconds, however slow the frames are');
  assert.equal(g.level, 1);
  run(g, 30, 36, 1 / 72);
  assert.equal(g.level, QUALITY.length - 1, 'the last step is reached within forty seconds, and that is as far as it goes');
  const level = g.level;
  run(g, 120, 72, 1 / 72);
  assert.equal(g.level, level, 'and it does not step back up');
  g.reset();
  assert.equal(g.level, 0, 'until the next session');
  // It is time that is judged, not a number of frames: a third of the rate gets no longer.
  const slow = new Governor();
  let seconds = 0;
  while (slow.level === 0 && seconds < 60) {
    slow.frame(3 / 72, 1 / 72);
    seconds += 3 / 72;
  }
  assert.ok(seconds < 8.5, 'at 24 frames a second the first step comes after ' + seconds.toFixed(1) + ' s');
});

test('one frame in ten late is enough, even if the average looks fine; one in fifty is not', () => {
  const late = (every) => {
    const g = new Governor();
    for (let i = 0; i < 72 * 30; i++) g.frame(i % every === 0 ? 2 / 72 : 0.9 / 72, 1 / 72);
    return g.level;
  };
  assert.ok(late(5) >= 1, 'one in five');
  assert.ok(late(10) >= 1, 'one in ten: seven stutters a second');
  assert.equal(late(50), 0, 'one in fifty is a hitch now and then, not a reason');
});

test('each step does less than the one before, and the first costs the processor less, not the picture', () => {
  for (let i = 1; i < QUALITY.length; i++) {
    assert.ok(QUALITY[i].forest < QUALITY[i - 1].forest);
    assert.ok(QUALITY[i].leaves < QUALITY[i - 1].leaves);
    assert.equal(QUALITY[i].sound, 'lite', 'the cheaper sound from the first step on');
  }
  assert.deepEqual(QUALITY[0], { forest: 1, leaves: 1, mirror: true, sound: 'full' });
  assert.ok(QUALITY[QUALITY.length - 1].forest >= 0.4, 'the valley is still a forest at the last step');
  assert.equal(QUALITY_WORDS.length, QUALITY.length, 'every step can be put into words');
  assert.ok(new Governor().frame(NaN, 1 / 72) === false);
});

test('a session that could not keep up makes the next one cheaper in pixels, a step at a time', () => {
  const good = { seconds: 300, fps: 71, target: 72, late: 0.01, level: 0 };
  const poor = { seconds: 300, fps: 48, target: 72, late: 0.3, level: 3 };
  const fresh = { scale: 1, aa: true };
  // A good session changes nothing, and neither does one too short to tell.
  assert.deepEqual(nextSession(fresh, good), { scale: 1, aa: true, change: '', words: '' });
  assert.equal(nextSession(fresh, Object.assign({}, poor, { seconds: 8 })).change, '');
  assert.equal(nextSession(fresh, null).change, '');
  // A poor one: first a smaller picture, then no anti-aliasing, then smaller again, then nothing.
  const first = nextSession(fresh, poor);
  assert.equal(first.scale, 0.8);
  assert.equal(first.aa, true);
  assert.match(first.words, /0\.8 of full size/);
  const second = nextSession(first, poor);
  assert.equal(second.scale, 0.8);
  assert.equal(second.aa, false);
  assert.match(second.words, /anti-aliasing/);
  const third = nextSession(second, poor);
  assert.equal(third.scale, 0.65);
  assert.equal(third.aa, false);
  const last = nextSession(third, poor);
  assert.equal(last.change, '');
  assert.equal(last.scale, 0.65);
  assert.match(last.words, /nothing left/);
  // Each of the ways a session can be poor counts on its own.
  assert.equal(nextSession(fresh, Object.assign({}, good, { level: 2 })).change, 'scale', 'two steps down');
  assert.equal(nextSession(fresh, Object.assign({}, good, { late: 0.12 })).change, 'scale', 'a tenth of the frames late');
  assert.equal(nextSession(fresh, Object.assign({}, good, { fps: 58 })).change, 'scale', 'under 85% of the rate');
  // Nothing is ever put back by a good session.
  assert.equal(nextSession(third, good).scale, 0.65);
  // And nothing remembered at all is the same as a first visit.
  assert.equal(nextSession(null, poor).scale, 0.8);
});

test('the rush of a dragon grows as it comes close, and stands back while it beats its wings', () => {
  assert.equal(A.rushLevel(4, 20), 0, 'none when it is hardly moving');
  assert.ok(A.rushLevel(16, 15) > 3 * A.rushLevel(16, 80), 'at 15 m ' + A.rushLevel(16, 15).toFixed(2) + ', at 80 m ' + A.rushLevel(16, 80).toFixed(2));
  assert.equal(A.rushLevel(16, 80), A.rushLevel(16, 300), 'beyond 45 m only its speed counts');
  assert.ok(A.rushLevel(25, 15) > A.rushLevel(15, 15), 'faster is louder');
  let last = 0;
  for (const d of [60, 40, 30, 20, 12]) {
    const level = A.rushLevel(16, d);
    assert.ok(level >= last, 'never quieter for being nearer: ' + d + ' m');
    last = level;
  }
  assert.ok(A.rushLevel(16, 15, 0.6) < 0.5 * A.rushLevel(16, 15, 0), 'behind the wingbeats');
  assert.ok(A.rushLevel(16, 15, 0.6) > 0, 'but not gone');
});
