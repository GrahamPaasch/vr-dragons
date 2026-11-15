import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/world.js';
import * as F from '../src/flight.js';
import { buildTerrain } from '../src/terrain.js';
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
  // Over each tree by the ledge, and for a wing's length round it; the big trees by the creek too.
  for (const t of [...W.HERO_TREES, ...W.GROVE]) {
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
    assert.ok(lane.length > 150 && lane.length < 1200, lane.name + ' length ' + lane.length.toFixed(0));
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
  for (const want of ['eight', 'cross', 'shoulder', 'meadow', 'gorge', 'narrows', 'skim', 'rise']) assert.ok(names.includes(want), want);
  // Every lane that leaves the node in front of the ledge comes close to the viewer, sooner or
  // later; the ones that do not are the ways round over the lake, and one of those is short.
  for (const lane of F.LANES.filter((l) => l.from === 'in')) assert.ok(lane.visits, lane.name + ' comes within ' + F.NEAR_RANGE + ' m');
  const ways = F.LANES.filter((l) => l.from === 'out' && l.to === 'in').map((l) => l.time);
  assert.ok(Math.min(...ways) < 11, 'the shortest way round takes ' + Math.min(...ways).toFixed(1) + ' s');
});

test('the narrows: between the big trees by the creek, behind one crown and out from behind the next', () => {
  const lane = F.LANES.find((l) => l.name === 'narrows');
  const eye = F.VIEWER;
  const p = [0, 0, 0];
  let seen = '';
  let nearest = Infinity;
  let far = 0;
  let low = Infinity;
  let high = -Infinity;
  for (let s = 0; s <= lane.length; s += 2) {
    if (lane.tightAt(s) < 0.5) continue;
    lane.pointAt(s, p);
    const range = Math.hypot(p[0] - eye[0], p[2] - eye[2]);
    far = Math.max(far, range);
    const down = Math.atan2(eye[1] - p[1], range) / DEG;
    low = Math.min(low, down);
    high = Math.max(high, down);
    // Is the line from the eye to this point of the lane inside the leaves of a tree?
    let hidden = false;
    for (const t of W.GROVE) {
      nearest = Math.min(nearest, Math.hypot(p[0] - t.x, p[2] - t.z) - t.radius);
      const dx = p[0] - eye[0];
      const dz = p[2] - eye[2];
      const k = ((t.x - eye[0]) * dx + (t.z - eye[2]) * dz) / (dx * dx + dz * dz);
      if (k <= 0 || k >= 1) continue;
      const aside = Math.hypot(eye[0] + dx * k - t.x, eye[2] + dz * k - t.z);
      const y = eye[1] + (p[1] - eye[1]) * k;
      if (aside < 0.85 * t.radius && y < t.height - 0.5 && y > t.height - 2.2 * t.radius + 1) hidden = true;
    }
    seen += hidden ? '#' : '.';
  }
  // Half a wingspan is 6.8 m: the leaves are well clear of the wings on both sides.
  assert.ok(nearest > 11, 'the nearest crown is ' + nearest.toFixed(1) + ' m from the lane');
  // Close enough to watch, and below eye level but well above the rim of the ledge.
  assert.ok(far < 115, 'no further than ' + far.toFixed(0) + ' m');
  assert.ok(low >= 5 && high <= 19, 'between ' + low.toFixed(0) + ' and ' + high.toFixed(0) + ' degrees below eye level');
  const share = seen.split('#').length - 1;
  assert.ok(share / seen.length > 0.3 && share / seen.length < 0.65, 'hidden for ' + ((100 * share) / seen.length).toFixed(0) + '% of it: ' + seen);
  // In the open first, then hidden and out again at least twice, each time for 8 m or more.
  assert.match(seen, /^\.{10,}#{4,}\.{4,}#{4,}\.{4,}/, seen);
  // The trees stand on land, clear of the view straight ahead, and nothing of the forest is planted against them.
  for (const t of W.GROVE) {
    assert.ok(W.lakeDistance(t.x, t.z) > 2, t.kind + ' is not in the lake');
    assert.ok(Math.abs(t.x) > 9 + 0.22 * -t.z || t.z < -82, t.kind + ' is out of the line to the lake');
    assert.ok(t.height <= -5, t.kind + ' tops out below the ledge');
    assert.ok(t.height - W.ground(t.x, t.z) > 26 && t.height - W.ground(t.x, t.z) < 40, t.kind + ' is ' + (t.height - W.ground(t.x, t.z)).toFixed(0) + ' m tall');
  }
  for (const t of W.placeForest(20261115, 1)) assert.ok(W.groveDistance(t.x, t.z) > 4, 'a tree of the forest at ' + t.x.toFixed(0) + ', ' + t.z.toFixed(0));
});

test('nothing that flies close is hidden by the rim of the ledge', () => {
  // The sight line over the rim, from the drawn rock: for every 5 degrees round, the least
  // angle below the horizon at which the eye sees past everything within 12 m.
  const heights = new W.HeightGrid(W.canopyHeight, 600, 96);
  const mesh = buildTerrain(W.buildSunHeight(heights, 600, 96));
  const eye = F.VIEWER;
  const rim = new Float64Array(72).fill(-90);
  const pos = mesh.position;
  for (let i = 0; i < pos.length; i += 9) {
    if (Math.hypot((pos[i] + pos[i + 3] + pos[i + 6]) / 3, (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3) > 12) continue;
    for (let u = 0; u <= 6; u++) {
      for (let v = 0; v <= 6 - u; v++) {
        const w = 6 - u - v;
        const x = (pos[i] * u + pos[i + 3] * v + pos[i + 6] * w) / 6;
        const y = (pos[i + 1] * u + pos[i + 4] * v + pos[i + 7] * w) / 6;
        const z = (pos[i + 2] * u + pos[i + 5] * v + pos[i + 8] * w) / 6;
        const d = Math.hypot(x, z);
        if (d < 0.8) continue;
        let az = Math.atan2(x, -z) / DEG;
        if (az < 0) az += 360;
        const k = Math.floor(az / 5) % 72;
        rim[k] = Math.max(rim[k], Math.atan2(y - eye[1], d) / DEG);
      }
    }
  }
  // Straight ahead and to both sides the valley floor is in view: 35 degrees down or more.
  for (const az of [0, 30, 60, 90, 270, 300, 330]) assert.ok(rim[az / 5] < -35, 'looking ' + az + ' degrees round, the rim hides everything below ' + (-rim[az / 5]).toFixed(0) + ' degrees');
  const p = [0, 0, 0];
  for (const lane of F.LANES.filter((l) => l.near)) {
    for (let s = 0; s <= lane.length; s += 2) {
      lane.pointAt(s, p);
      const d = Math.hypot(p[0] - eye[0], p[2] - eye[2]);
      if (Math.hypot(d, p[1] - eye[1]) > 60) continue;
      let az = Math.atan2(p[0], -p[2]) / DEG;
      if (az < 0) az += 360;
      const k = Math.floor(az / 5) % 72;
      const edge = Math.max(rim[(k + 71) % 72], rim[k], rim[(k + 1) % 72]);
      const at = Math.atan2(p[1] - eye[1], d) / DEG;
      assert.ok(at > edge + 5, lane.name + ' at ' + p.map((c) => c.toFixed(0)).join(', ') + ' is ' + (-at).toFixed(0) + ' degrees down, and the rim hides below ' + (-edge).toFixed(0));
    }
  }
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

test('the opening: in from the far end of the lake, the figure of eight in front of the ledge, then through the big trees', () => {
  const d = new F.Director(builds, 99);
  assert.deepEqual(d.program().slice(0, 2), ['far turn', 'eight']);
  const flown = [];
  const again = new F.Director(builds, 99);
  for (let i = 0; i < 72 * 70; i++) {
    again.step(1 / 72);
    const name = again.find(again.center).lane.name;
    if (flown[flown.length - 1] !== name) flown.push(name);
  }
  assert.deepEqual(flown, ['far turn', 'eight', 'turn', 'narrows'], 'the first minute and a bit');
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

test('pacing: the first six minutes of a visit have no minute with both dragons far away', () => {
  const dt = 1 / 72;
  const longest = [];
  let far130 = 0;
  let total = 0;
  for (let visit = 0; visit < 24; visit++) {
    const d = new F.Director(builds, 1000 + visit * 37);
    let lull = 0;
    let most = 0;
    for (let n = 0; n < 72 * 360; n++) {
      d.step(dt);
      d.drain();
      const near = Math.min(head(d.flyers[0]), head(d.flyers[1]));
      if (near > F.NEAR_RANGE) {
        lull += dt;
        most = Math.max(most, lull);
      } else {
        lull = 0;
      }
      total++;
      if (near > 130) far130++;
    }
    longest.push(most);
  }
  longest.sort((a, b) => a - b);
  assert.ok(longest[longest.length - 1] < 66, 'the longest wait for a dragon within ' + F.NEAR_RANGE + ' m, of 24 visits: ' + longest[longest.length - 1].toFixed(0) + ' s');
  assert.ok(longest[longest.length >> 1] < 45, 'and in half of them no longer than ' + longest[longest.length >> 1].toFixed(0) + ' s');
  assert.ok(far130 / total < 0.42, 'the nearer one is beyond 130 m ' + ((100 * far130) / total).toFixed(0) + '% of the time');
});

test('close to the viewer the two fly figures, and beat their wings', () => {
  const dt = 1 / 72;
  let close = 0;
  let file = 0;
  let within = 0;
  let beating = 0;
  for (const seed of [5, 6]) {
    const d = new F.Director(builds, seed);
    for (let n = 0; n < 72 * 60 * 20; n++) {
      d.step(dt);
      d.drain();
      const h = [head(d.flyers[0]), head(d.flyers[1])];
      if (Math.min(h[0], h[1]) < 40) {
        close++;
        if (d.mode.name === 'trail') file++;
      }
      for (let i = 0; i < 2; i++) {
        if (h[i] > 20) continue;
        within++;
        if (d.flyers[i].power > 0.2) beating++;
      }
    }
  }
  assert.ok(close > 72 * 60, 'they are close for more than a minute in forty');
  // One behind the other is for the tight places; in the open in front of the ledge they
  // fly side by side, one above the other, or round each other.
  assert.ok(file / close < 0.45, 'in single file ' + ((100 * file) / close).toFixed(0) + '% of the time they are within 40 m');
  // A big animal flying slowly has to work at it: inside 20 m they are mostly beating.
  assert.ok(beating / within > 0.4, 'beating ' + ((100 * beating) / within).toFixed(0) + '% of the time inside 20 m');
});

test('calling: a dragon answers, comes, passes close where it can be watched, roars, and goes back', () => {
  for (const seed of [1, 2]) {
    const d = new F.Director(builds, seed);
    const rng = makeRng(seed + 5);
    const dt = 1 / 72;
    let nextCall = 25;
    let made = 0;
    let passes = 0;
    let callRoars = 0;
    let answers = 0;
    let refusals = 0;
    let minViewer = Infinity;
    const nearest = [];
    const up = [];
    const waits = [];
    const best = [Infinity, Infinity];
    const angle = [0, 0];
    const called = [0, 0];
    for (let n = 0; n < 72 * 60 * 25; n++) {
      if (d.time > nextCall) {
        const who = d.call();
        if (who >= 0) {
          made++;
          best[who] = Infinity;
          called[who] = d.time;
          assert.ok(d.flyers[who].cry > 0, 'it opens its mouth to answer');
          assert.equal(d.call(), -1, 'a second call straight away is not answered');
        }
        nextCall = d.time + 16 + rng() * 30;
      }
      d.step(dt);
      for (const e of d.drain()) {
        if (e.type === 'pass') {
          passes++;
          waits.push(d.time - called[e.dragon]);
        }
        if (e.type === 'roar' && e.kind === 'call') {
          callRoars++;
          // The head is turned for the fire, so that it is seen from the side.
          assert.ok(Math.abs(d.flyers[e.dragon].roarYaw) > 20 * DEG, 'head turned ' + (d.flyers[e.dragon].roarYaw / DEG).toFixed(0) + ' degrees');
        }
        if (e.type === 'call') answers++;
        if (e.type === 'busy') refusals++;
      }
      for (let i = 0; i < 2; i++) {
        const f = d.flyers[i];
        const v = head(f);
        minViewer = Math.min(minViewer, v);
        // (Counted once it is coming: one that is called while it happens to be close goes out first.)
        if (d.jobs[i] && d.jobs[i].phase !== 'out') {
          if (v < best[i]) {
            best[i] = v;
            angle[i] = Math.atan2(f.y - F.VIEWER[1], Math.hypot(f.x - F.VIEWER[0], f.z - F.VIEWER[2])) / DEG;
          }
        } else if (!d.jobs[i] && best[i] < Infinity) {
          nearest.push(best[i]);
          up.push(angle[i]);
          best[i] = Infinity;
        }
      }
    }
    assert.equal(answers, made, 'every call that is taken is answered aloud at once');
    assert.ok(refusals >= made - 2, 'and one that cannot be taken is answered too: ' + refusals);
    up.sort((a, b) => a - b);
    waits.sort((a, b) => a - b);
    // Low enough to be watched as it goes by, high enough to go over the rim: nine in ten
    // between 18 and 40 degrees above eye level, none overhead.
    assert.ok(up[Math.floor(up.length * 0.05)] > 18 && up[Math.floor(up.length * 0.95)] < 40, 'how high they pass: ' + up.map((a) => a.toFixed(0)).join(' '));
    assert.ok(up[up.length - 1] < 60, 'the highest: ' + up[up.length - 1].toFixed(0) + ' degrees');
    assert.ok(waits[waits.length >> 1] < 14.5, 'from call to pass: ' + waits[waits.length >> 1].toFixed(1) + ' s for half of them');
    assert.ok(waits[waits.length - 1] < 28, 'and never longer than ' + waits[waits.length - 1].toFixed(1) + ' s');
    assert.ok(made >= 30, 'calls answered: ' + made);
    assert.ok(passes >= made - 1, 'every one came past: ' + passes + ' of ' + made);
    assert.ok(callRoars >= made - 1, 'and roared on the way in: ' + callRoars);
    assert.ok(minViewer >= F.KEEP_OUT, 'never nearer than ' + F.KEEP_OUT + ' m: ' + minViewer.toFixed(1));
    nearest.sort((a, b) => a - b);
    const median = nearest[nearest.length >> 1];
    assert.ok(median < 14, 'half of them pass within ' + median.toFixed(1) + ' m');
    assert.ok(nearest[nearest.length - 1] < 20, 'and the widest at ' + nearest[nearest.length - 1].toFixed(1) + ' m');
    assert.ok(!d.jobs[0] || !d.jobs[1], 'the two are never both away');
    assert.equal(d.flyers[0].floorHits + d.flyers[1].floorHits, 0, 'no emergency pull-ups');
  }
});

test('a called pass is planned clear of the trees by the ledge, and where it can be watched', () => {
  // Whichever way a dragon came from, the plan would keep it outside the keep-out and above the floor.
  for (let deg = -180; deg < 180; deg += 15) {
    const a = deg * DEG;
    const ux = -Math.sin(a);
    const uz = Math.cos(a);
    for (const size of [1, 0.78]) {
      const plan = F.planPass(ux, uz, size);
      const p = plan.point;
      assert.ok(plan.near >= F.KEEP_OUT + 1.5, 'from ' + deg + ' degrees: ' + plan.near.toFixed(1) + ' m from the head');
      assert.ok(plan.near < 30, 'from ' + deg + ' degrees it still comes close: ' + plan.near.toFixed(1) + ' m');
      assert.ok(p[1] >= F.flightFloor(p[0], p[2]), 'the point is above the flight floor');
      assert.ok(Math.abs(plan.turn) <= 40 * DEG + 1e-9);
    }
  }
  // The lines a called dragon really comes in along, over the near end of the lake: it goes by
  // on the viewer's right, a wing's length off, and low enough to be watched all the way.
  assert.ok(F.CALL_LINES.length >= 3);
  for (const from of F.CALL_LINES) {
    assert.ok(Math.abs(from) < 20 * DEG, 'in from over the lake');
    for (const size of [1, 0.78]) {
      const plan = F.planPass(-Math.sin(from), Math.cos(from), size);
      const where = 'coming from ' + (from / DEG).toFixed(0) + ' degrees: ';
      assert.ok(plan.point[0] > 8, where + 'on the right, ' + plan.point[0].toFixed(1) + ' m out');
      assert.ok(plan.near > 10.6 && plan.near < 14, where + plan.near.toFixed(1) + ' m from the head');
      assert.ok(plan.elevation > 20 * DEG && plan.elevation < 34 * DEG, where + (plan.elevation / DEG).toFixed(0) + ' degrees up');
      assert.ok(plan.point[1] - F.VIEWER[1] >= 4, where + (plan.point[1] - F.VIEWER[1]).toFixed(1) + ' m above the head');
    }
  }
});
