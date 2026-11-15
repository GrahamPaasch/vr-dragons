import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/world.js';
import * as F from '../src/flight.js';
import { DRAGONS } from '../src/dragonGeometry.js';
import { makeRng } from '../src/rng.js';

const DEG = Math.PI / 180;
const builds = DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale }));
const head = (f) => Math.hypot(f.x - F.VIEWER[0], f.y - F.VIEWER[1], f.z - F.VIEWER[2]);

test('the flight floor: over water, over bare ground, over forest, and the dome round the viewer', () => {
  // Low over the middle of the lake.
  const lake = F.flightFloor(W.LAKE.cx, W.LAKE.cz);
  assert.ok(lake > W.LAKE_LEVEL + 2 && lake < W.LAKE_LEVEL + 4, 'over the lake: ' + (lake - W.LAKE_LEVEL).toFixed(1) + ' m above the water');
  // Over forest: above the tallest tree that could stand there.
  const trees = W.placeForest(20261115, 1);
  for (let i = 0; i < trees.length; i += 7) {
    const t = trees[i];
    if (Math.hypot(t.x, t.z) > 440) continue;
    assert.ok(F.flightFloor(t.x, t.z) > t.y + t.height + 2, 'clear of the tree at ' + t.x.toFixed(0) + ', ' + t.z.toFixed(0));
  }
  // Nothing may come within KEEP_OUT of the viewer's head from above.
  for (const [x, z] of [[0, 0], [3, -2], [-5, 4], [6, 6]]) {
    const y = F.flightFloor(x, z);
    assert.ok(Math.hypot(x, y - F.VIEWER[1], z) >= F.KEEP_OUT, 'the floor at ' + x + ', ' + z + ' is outside the keep-out');
  }
  // Over each tree by the ledge, and for a wing's length round it.
  for (const t of W.HERO_TREES) {
    assert.ok(F.flightFloor(t.x, t.z) >= t.height + 3 - 1e-9, 'over the ' + t.kind);
    assert.ok(F.flightFloor(t.x + t.radius + 4, t.z) >= t.height + 3 - 1e-9, 'and beside it');
  }
});

test('every lane keeps the rules: above the floor, clear of the viewer, no turn or climb too hard', () => {
  assert.ok(F.LANES.length >= 12);
  const p = [0, 0, 0];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (const lane of F.LANES) {
    assert.ok(lane.length > 200 && lane.length < 1200, lane.name + ' length ' + lane.length.toFixed(0));
    assert.ok(lane.tightest >= 17.5, lane.name + ': tightest turn ' + lane.tightest.toFixed(1) + ' m');
    let worst = Infinity;
    let near = Infinity;
    for (let s = 0; s <= lane.length; s += 2) {
      lane.pointAt(s, p);
      worst = Math.min(worst, p[1] - F.flightFloor(p[0], p[2]));
      near = Math.min(near, Math.hypot(p[0] - F.VIEWER[0], p[1] - F.VIEWER[1], p[2] - F.VIEWER[2]));
      const v = lane.speedAt(s);
      assert.ok(v >= 12 && v <= 26, lane.name + ' speed ' + v.toFixed(1));
      if (s >= 8 && s + 8 <= lane.length) {
        lane.pointAt(s - 8, a);
        lane.pointAt(s + 8, b);
        let dh = Math.atan2(b[0] - p[0], b[2] - p[2]) - Math.atan2(p[0] - a[0], p[2] - a[2]);
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const flat = (Math.hypot(p[0] - a[0], p[2] - a[2]) + Math.hypot(b[0] - p[0], b[2] - p[2])) / 2;
        const bank = Math.atan((v * v * Math.abs(dh)) / (flat * 9.81)) / DEG;
        assert.ok(bank <= 47, lane.name + ' needs a ' + bank.toFixed(0) + ' degree bank at ' + s + ' m');
        const climb = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])) / DEG;
        assert.ok(climb <= 35, lane.name + ' climbs at ' + climb.toFixed(0) + ' degrees');
      }
    }
    assert.ok(worst >= 0, lane.name + ' is ' + (-worst).toFixed(1) + ' m under the flight floor');
    assert.ok(near >= F.KEEP_OUT, lane.name + ' comes within ' + near.toFixed(1) + ' m of the viewer');
  }
});

test('lanes join end to end: each starts and ends on a node, and every node has a way on', () => {
  const p = [0, 0, 0];
  for (const lane of F.LANES) {
    const from = F.NODES[lane.from];
    const to = F.NODES[lane.to];
    lane.pointAt(0, p);
    assert.ok(Math.hypot(p[0] - from.p[0], p[1] - from.p[1], p[2] - from.p[2]) < 0.01, lane.name + ' starts at ' + lane.from);
    lane.pointAt(lane.length, p);
    assert.ok(Math.hypot(p[0] - to.p[0], p[1] - to.p[1], p[2] - to.p[2]) < 0.01, lane.name + ' ends at ' + lane.to);
  }
  for (const node of Object.keys(F.NODES)) {
    const ways = F.LANES.filter((l) => l.from === node);
    assert.ok(ways.length >= 1, 'a lane leaves ' + node);
    // After any lane into this node there is another lane to take (the same one is never repeated).
    for (const into of F.LANES.filter((l) => l.to === node)) assert.ok(ways.some((l) => l.name !== into.name), 'after ' + into.name + ' there is a way on');
  }
  // What the brief asks for is all there.
  const names = F.LANES.map((l) => l.name);
  for (const want of ['eight', 'cross', 'shoulder', 'meadow', 'gorge', 'skim', 'rise']) assert.ok(names.includes(want), want);
});

test('the same seed flies the same flight; another seed a different one', () => {
  const run = (seed) => {
    const d = new F.Director(builds, seed);
    for (let i = 0; i < 72 * 240; i++) d.step(1 / 72);
    return d.flyers.map((f) => [f.x, f.y, f.z, f.heading, f.beats]);
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
});

test('the opening: in from the far end of the lake, then the figure of eight in front of the ledge', () => {
  const d = new F.Director(builds, 99);
  assert.deepEqual(d.program().slice(0, 2), ['far turn', 'eight']);
  assert.ok(d.flyers.every((f) => head(f) > 150 && f.z < -150), 'they start far out over the lake');
  let firstNear = 0;
  let nearest = Infinity;
  for (let i = 0; i < 72 * 45; i++) {
    d.step(1 / 72);
    const n = Math.min(head(d.flyers[0]), head(d.flyers[1]));
    nearest = Math.min(nearest, n);
    if (!firstNear && n < 45) firstNear = d.time;
  }
  assert.ok(firstNear > 5 && firstNear < 25, 'within 45 m of the viewer ' + firstNear.toFixed(1) + ' s in');
  assert.ok(nearest < 35 && nearest > 12, 'nearest in the opening: ' + nearest.toFixed(1) + ' m');
});

for (const seed of [20261115, 3, 11]) {
  test('twenty minutes left alone (seed ' + seed + '): nobody hits anything, and there is plenty to see', () => {
    const d = new F.Director(builds, seed);
    const dt = 1 / 72;
    let minViewer = Infinity;
    let minSep = Infinity;
    let minGround = Infinity;
    let deepest = -Infinity;
    let near = 0;
    let passes = 0;
    let wasNear = false;
    let forward = 0;
    let glide = 0;
    let beats = 0;
    let roars = 0;
    const lanes = new Set();
    const modes = new Set();
    const steps = 72 * 60 * 20;
    for (let n = 0; n < steps; n++) {
      d.step(dt);
      for (const e of d.drain()) {
        if (e.type === 'beat') beats++;
        if (e.type === 'roar') roars++;
      }
      lanes.add(d.find(d.center).lane.name);
      modes.add(d.mode.name);
      minSep = Math.min(minSep, d.separation);
      let nearNow = false;
      for (const f of d.flyers) {
        const v = head(f);
        minViewer = Math.min(minViewer, v);
        const water = W.lakeDistance(f.x, f.z) < 0;
        if (n % 8 === 0) minGround = Math.min(minGround, f.y - (water ? W.LAKE_LEVEL : W.ground(f.x, f.z)));
        deepest = Math.max(deepest, F.flightFloor(f.x, f.z) - f.y);
        assert.ok(f.speed >= 9 && f.speed <= 38, 'speed ' + f.speed);
        assert.ok(Math.abs(f.bank) <= 59 * DEG, 'bank ' + f.bank / DEG);
        assert.ok(Number.isFinite(f.x + f.y + f.z + f.heading + f.gamma), 'finite');
        if (v < 40) {
          near += dt / 2;
          nearNow = true;
        }
        if (f.z < 0 && Math.abs(Math.atan2(f.x, -f.z)) < 0.9) forward += dt / 2;
        if (f.power < 0.2) glide += dt / 2;
      }
      if (nearNow && !wasNear) passes++;
      wasNear = nearNow;
    }
    const total = steps * dt;
    assert.ok(minViewer >= F.KEEP_OUT, 'nearest to the viewer ' + minViewer.toFixed(1) + ' m');
    assert.ok(minViewer < 16, 'and they do come close: ' + minViewer.toFixed(1) + ' m');
    assert.ok(minSep > 5, 'nearest to each other ' + minSep.toFixed(1) + ' m');
    assert.ok(minGround > 2, 'lowest over ground or water ' + minGround.toFixed(1) + ' m');
    assert.ok(deepest < 4.5, 'deepest under the flight floor ' + deepest.toFixed(1) + ' m');
    assert.equal(d.flyers[0].floorHits + d.flyers[1].floorHits, 0, 'no emergency pull-ups');
    assert.ok(passes >= 8, 'close passes in twenty minutes: ' + passes);
    assert.ok(near / total > 0.03, 'time within 40 m: ' + ((100 * near) / total).toFixed(1) + '%');
    assert.ok(forward / total > 0.45, 'time in the forward view: ' + ((100 * forward) / total).toFixed(0) + '%');
    assert.ok(glide / total > 0.2 && glide / total < 0.7, 'they glide as well as beat: ' + ((100 * glide) / total).toFixed(0) + '%');
    assert.ok(beats > 800, 'wingbeats: ' + beats);
    assert.ok(roars >= 8 && roars <= 40, 'a roar now and then: ' + roars);
    assert.ok(lanes.size >= 9, 'lanes flown: ' + [...lanes].join(', '));
    assert.ok(modes.size >= 5, 'ways of flying together: ' + [...modes].join(', '));
  });
}

test('calling: a dragon comes, passes close but not too close, roars, and goes back; the other carries on', () => {
  for (const seed of [1, 2]) {
    const d = new F.Director(builds, seed);
    const rng = makeRng(seed + 5);
    const dt = 1 / 72;
    let nextCall = 25;
    let made = 0;
    let passes = 0;
    let callRoars = 0;
    let minViewer = Infinity;
    const nearest = [];
    const best = [Infinity, Infinity];
    for (let n = 0; n < 72 * 60 * 25; n++) {
      if (d.time > nextCall) {
        const who = d.call();
        if (who >= 0) {
          made++;
          best[who] = Infinity;
          assert.equal(d.call(), -1, 'a second call straight away is not answered');
        }
        nextCall = d.time + 16 + rng() * 30;
      }
      d.step(dt);
      for (const e of d.drain()) {
        if (e.type === 'pass') passes++;
        if (e.type === 'roar' && e.kind === 'call') callRoars++;
      }
      for (let i = 0; i < 2; i++) {
        const v = head(d.flyers[i]);
        minViewer = Math.min(minViewer, v);
        if (d.jobs[i]) best[i] = Math.min(best[i], v);
        else if (best[i] < Infinity) {
          nearest.push(best[i]);
          best[i] = Infinity;
        }
      }
    }
    assert.ok(made >= 30, 'calls answered: ' + made);
    assert.ok(passes >= made - 1, 'every one came past: ' + passes + ' of ' + made);
    assert.ok(callRoars >= made - 1, 'and roared on the way in: ' + callRoars);
    assert.ok(minViewer >= F.KEEP_OUT, 'never nearer than ' + F.KEEP_OUT + ' m: ' + minViewer.toFixed(1));
    nearest.sort((a, b) => a - b);
    const median = nearest[nearest.length >> 1];
    assert.ok(median < 15.5, 'half of them pass within ' + median.toFixed(1) + ' m');
    assert.ok(nearest[nearest.length - 1] < 32, 'and the widest at ' + nearest[nearest.length - 1].toFixed(1) + ' m');
    assert.ok(!d.jobs[0] || !d.jobs[1], 'the two are never both away');
  }
});

test('a called pass is planned clear of the trees by the ledge, whichever way the dragon comes from', () => {
  for (let deg = -180; deg < 180; deg += 15) {
    const a = deg * DEG;
    const ux = -Math.sin(a);
    const uz = Math.cos(a);
    for (const size of [1, 0.78]) {
      const plan = F.planPass(ux, uz, size);
      const p = plan.point;
      assert.ok(plan.near >= F.KEEP_OUT, 'from ' + deg + ' degrees: ' + plan.near.toFixed(1) + ' m from the head');
      assert.ok(plan.near < 26, 'from ' + deg + ' degrees it still comes close: ' + plan.near.toFixed(1) + ' m');
      assert.ok(p[1] >= F.flightFloor(p[0], p[2]), 'the point is above the flight floor');
      assert.ok(Math.abs(plan.turn) <= 40 * DEG + 1e-9);
    }
  }
  // From out over the lake (where they mostly are) the pass is a wing's length overhead.
  for (const deg of [-40, -20, 0, 20]) {
    const a = deg * DEG;
    const plan = F.planPass(-Math.sin(a), Math.cos(a), 1);
    assert.ok(plan.near < 13, 'from ' + deg + ' degrees: ' + plan.near.toFixed(1) + ' m');
  }
});
