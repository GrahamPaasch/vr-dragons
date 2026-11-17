import test from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../src/flight.js';
import { DRAGONS } from '../src/dragonGeometry.js';
import { Fetch, Ball, throwSpeed, predict, BALL_RADIUS, REST_SPOT, SPIRE, BORED_SECONDS, SAFETY_SECONDS } from '../src/fetch.js';
import { ground, LAKE_LEVEL } from '../src/world.js';
import { playOne } from '../tools/fetchsim.mjs';

const DT = 1 / 60;
const make = (seed) => {
  const director = new Director(DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale })), seed || 5);
  const game = new Fetch(director, DRAGONS);
  game.setHands(true);
  const run = (seconds, each) => {
    for (let t = 0; t < seconds; t += DT) {
      director.step(DT);
      director.drain();
      if (each && each(t) === false) return t;
    }
    return seconds;
  };
  return { director, game, run };
};

test('a throw is about four times as fast as the hand, less for the hardest', () => {
  for (const h of [2, 3, 4, 5]) assert.ok(throwSpeed(h) / h > 3.4 && throwSpeed(h) / h <= 4, 'about four times at ' + h + ' m/s: ' + (throwSpeed(h) / h).toFixed(2));
  assert.ok(throwSpeed(6) / 6 > 3.2, 'still more than three times at 6 m/s');
  assert.ok(throwSpeed(20) <= 32 && throwSpeed(20) > 28, 'the hardest anybody makes standing: ' + throwSpeed(20).toFixed(1));
  for (let h = 0.5; h < 25; h += 0.5) assert.ok(throwSpeed(h) >= throwSpeed(h - 0.5), 'harder is never shorter');
  assert.equal(throwSpeed(0), 0);
});

test('where a throw comes down: a lob close in, a hard throw 80 to 100 m out in the lake', () => {
  const out = Array.from({ length: 200 }, () => [0, 0, 0, 0, 0]);
  const land = (hand) => {
    const v = throwSpeed(hand);
    const up = (34 * Math.PI) / 180;
    const n = predict([0.3, 1.5, -0.5], [0, Math.sin(up) * v, -Math.cos(up) * v], out, 12, 0.05);
    const s = out[n - 1];
    return { far: Math.hypot(s[1], s[3]), how: s[4] };
  };
  assert.ok(land(2).far < 40, 'a lob drops close: ' + land(2).far.toFixed(0) + ' m');
  for (const h of [8, 10]) {
    const hard = land(h);
    assert.ok(hard.far > 78 && hard.far < 110, 'a hard throw (' + h + ' m/s at the hand): ' + hard.far.toFixed(0) + ' m');
    assert.equal(hard.how, 2, 'into the lake');
  }
  const hard = land(10);
  assert.equal(hard.how, 2, 'into the lake');
});

test('the ball rolls downhill, comes to rest, and floats on the lake', () => {
  const b = new Ball();
  assert.equal(b.state, 'rest');
  assert.ok(Math.abs(b.y - (ground(REST_SPOT[0], REST_SPOT[1]) + BALL_RADIUS)) < 1e-6, 'it sits on the rock');
  // Dropped onto the talus below the ledge: it goes down, never up.
  b.x = 2;
  b.z = -24;
  b.y = ground(2, -24) + 3;
  b.vx = b.vy = b.vz = 0;
  b.set('flying');
  const ev = [];
  let highest = b.y;
  for (let t = 0; t < 40 && b.state !== 'ground' && b.state !== 'floating'; t += DT) {
    b.step(DT, ev);
    if (b.state === 'rolling') highest = Math.max(highest, b.y);
    assert.ok(Number.isFinite(b.x + b.y + b.z));
  }
  assert.ok(b.state === 'ground' || b.state === 'floating', 'it came to rest: ' + b.state);
  assert.ok(b.y < -24 && highest <= ground(2, -24) + 3 + 0.01, 'downhill only (ended at ' + b.y.toFixed(1) + ')');
  // On the water.
  const w = new Ball();
  w.x = 0;
  w.z = -110;
  w.y = LAKE_LEVEL + 10;
  w.set('flying');
  for (let t = 0; t < 5 && w.state === 'flying'; t += DT) w.step(DT, ev);
  assert.equal(w.state, 'floating');
  assert.ok(ev.some((e) => e.type === 'splash'), 'with a splash');
  for (let t = 0; t < 5; t += DT) w.step(DT, ev);
  assert.ok(Math.abs(w.y - LAKE_LEVEL) < 0.3, 'it floats');
});

test('fetch, both ways home, from lobs to hard throws in every direction: the ball always comes back', () => {
  let n = 0;
  for (const mode of ['exercise', 'perch']) {
    for (const [hand, yaw, seed] of [[2.5, 0, 3], [5, -30, 4], [8, 20, 5], [12, 0, 6], [15, -10, 7]]) {
      const r = playOne({ hand, yaw, seed, mode, warm: 28, limit: 90 });
      assert.ok(r.ok, mode + ', hand ' + hand + ', yaw ' + yaw + ': ' + (r.back || 'not back') + ' ' + r.problems.join('; '));
      assert.equal(r.back, mode === 'perch' ? 'jaws' : r.back === 'ledge' ? 'ledge' : 'feet');
      assert.ok(r.nearest > 11, 'no flying body within 11 m of the head: ' + r.nearest.toFixed(1) + ' (' + r.nearestWhat + ')');
      assert.deepEqual(r.problems, []);
      n++;
    }
  }
  assert.equal(n, 10);
});

test('a lob is picked up from the ground with fire for joy; a long throw is often taken in the air', () => {
  const lob = playOne({ hand: 3, yaw: 0, seed: 2, warm: 37 });
  assert.equal(lob.how, 'land');
  assert.ok(lob.log.some(([, e]) => e.type === 'roar' && e.kind === 'joy'), 'it breathes fire when it lands');
  let air = 0;
  for (let seed = 1; seed <= 6; seed++) if (playOne({ hand: 12, yaw: 0, seed, warm: 30 }).how === 'air') air++;
  assert.ok(air >= 3, 'caught in the air ' + air + ' times in 6');
});

test('a swing that is not let go of: both lunge after nothing, then look back', () => {
  const { director, game, run } = make(9);
  run(25);
  const b = game.ball;
  assert.ok(game.grab('right', b.x, b.y + 0.3, b.z));
  for (let k = 0; k < 120; k++) {
    game.hold('right', 0.3, 1.3, -0.3, 0, 0, 0);
    run(DT);
  }
  // Fast, out over the valley, then still: the ball is still in the hand.
  for (let k = 0; k < 8; k++) {
    game.hold('right', 0.3, 1.5, -0.5 - 0.1 * k, 0, 2, -9);
    run(DT);
  }
  for (let k = 0; k < 30; k++) {
    game.hold('right', 0.3, 1.5, -1.3, 0, 0, 0);
    run(DT);
  }
  const lunged = director.jobs.filter((j) => j && j.kind === 'fetch' && (j.phase === 'lunge' || j.phase === 'betrayed')).length;
  assert.equal(lunged, 2, 'both went: ' + JSON.stringify(director.jobs.map((j) => j && j.phase)));
  assert.equal(b.state, 'held');
  let looked = false;
  run(4, () => {
    if (game.events.some((e) => e.type === 'betrayed')) looked = true;
  });
  assert.ok(looked || game.events.some((e) => e.type === 'betrayed'), 'and turned to look back');
});

test('left too long, they lose interest; picked up again, they are back', () => {
  const { game, run } = make(4);
  run(10);
  const b = game.ball;
  game.grab('right', b.x, b.y + 0.3, b.z);
  game.release('right', 0, 0, 0); // put down, not thrown
  run(3);
  assert.equal(game.eager, true);
  run(BORED_SECONDS + 3);
  assert.equal(game.eager, false, 'bored');
  assert.ok(game.events.some((e) => e.type === 'bored'));
  const c = game.ball;
  assert.ok(game.grab('right', c.x, c.y + 0.2, c.z));
  assert.equal(game.eager, true, 'interested again');
});

test('the safety net: a ball nobody can fetch is replaced in the hand after twenty seconds', () => {
  const { director, game, run } = make(6);
  run(5);
  const b = game.ball;
  // Somewhere nobody will go for it (and keep the dragons off it).
  b.x = 300;
  b.z = 300;
  b.y = ground(300, 300) + BALL_RADIUS;
  b.set('ground');
  game.handAt = [0.3, 1.2, -0.3];
  let fresh = -1;
  run(SAFETY_SECONDS + 4, (t) => {
    director.jobs[0] = director.jobs[1] = null;
    game.claim = -1;
    if (game.events.some((e) => e.type === 'fresh')) {
      fresh = t;
      return false;
    }
  });
  assert.ok(fresh > SAFETY_SECONDS - 1 && fresh < SAFETY_SECONDS + 1, 'after ' + fresh.toFixed(1) + ' s');
  assert.equal(game.ball.state, 'held', 'in the hand');
});

test('perched on the spire, either dragon can bring the ball to the viewer\'s chest', () => {
  const { game } = make(3);
  for (const i of [0, 1]) {
    const s = game.sizes[i];
    const toViewer = Math.atan2(-SPIRE.x, -SPIRE.z);
    const feet = [SPIRE.x + Math.sin(toViewer) * SPIRE.radius * 0.35, SPIRE.top, SPIRE.z + Math.cos(toViewer) * SPIRE.radius * 0.35];
    const p = game.solveOffer(i, toViewer, [feet[0] + Math.sin(toViewer) * 0.7 * s, 0, feet[2] + Math.cos(toViewer) * 0.7 * s]);
    assert.ok(p.miss < 0.2, DRAGONS[i].name + ' holds it within ' + p.miss.toFixed(2) + ' m of where a hand takes it');
  }
});
