import test from 'node:test';
import assert from 'node:assert/strict';
import { BONE, BONE_COUNT, makeSkeleton, poseSkeleton, restPose, heave, skinPoint } from '../src/rig.js';
import { buildDragon, buildFlame, DRAGONS, FLAME_GLOW } from '../src/dragonGeometry.js';
import { ROAR_SECONDS } from '../src/flight.js';
import { makeRng } from '../src/rng.js';

const colours = (spec) => spec.colors;

/** Every vertex of a built dragon where the pose puts it (what the vertex shader does). */
function posed(built, pose) {
  const world = new Float32Array(BONE_COUNT * 12);
  const skin = new Float32Array(BONE_COUNT * 12);
  poseSkeleton(built.skeleton, pose, world, skin);
  const a = built.arrays;
  const out = new Float32Array(a.vertices * 3);
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const r = [0, 0, 0];
  for (let i = 0; i < a.vertices; i++) {
    p[0] = a.position[i * 3];
    p[1] = a.position[i * 3 + 1];
    p[2] = a.position[i * 3 + 2];
    const w = a.aux[i * 4 + 2];
    skinPoint(skin, a.aux[i * 4], p, q);
    skinPoint(skin, a.aux[i * 4 + 1], p, r);
    out[i * 3] = q[0] * w + r[0] * (1 - w);
    out[i * 3 + 1] = q[1] * w + r[1] * (1 - w);
    out[i * 3 + 2] = q[2] * w + r[2] * (1 - w);
  }
  return out;
}

test('the two dragons: low-poly, every vertex on a real bone, and different from each other', () => {
  assert.equal(DRAGONS.length, 2);
  const built = DRAGONS.map((d) => buildDragon(d.build, colours(d)));
  for (const b of built) {
    const a = b.arrays;
    assert.ok(a.triangles > 400 && a.triangles < 1500, 'triangles: ' + a.triangles);
    assert.equal(a.position.length, a.triangles * 9);
    let membrane = 0;
    let glow = 0;
    for (let i = 0; i < a.vertices; i++) {
      const b0 = a.aux[i * 4];
      const b1 = a.aux[i * 4 + 1];
      const w = a.aux[i * 4 + 2];
      const kind = a.aux[i * 4 + 3];
      assert.ok(Number.isInteger(b0) && b0 >= 0 && b0 < BONE_COUNT, 'bone ' + b0);
      assert.ok(Number.isInteger(b1) && b1 >= 0 && b1 < BONE_COUNT, 'bone ' + b1);
      assert.ok(w >= 0 && w <= 1, 'weight ' + w);
      assert.ok(kind === 0 || kind === 1 || kind === 2);
      if (kind === 1) membrane++;
      if (kind === 2) glow++;
      const n = Math.hypot(a.normal[i * 3], a.normal[i * 3 + 1], a.normal[i * 3 + 2]);
      assert.ok(Math.abs(n - 1) < 1e-4, 'unit normal');
      for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(a.position[i * 3 + k]) && a.color[i * 3 + k] >= 0);
    }
    assert.ok(membrane > 100, 'wings have membranes');
    assert.equal(glow, 6, 'two eyes');
  }
  assert.ok(DRAGONS[0].build.scale > DRAGONS[1].build.scale, 'one is bigger');
  assert.ok(DRAGONS[1].beat > DRAGONS[0].beat, 'and the smaller one beats faster');
  assert.notDeepEqual(DRAGONS[0].colors.side, DRAGONS[1].colors.side);
});

test('at rest nothing moves: the rest pose leaves every vertex where it was modelled', () => {
  const built = buildDragon(DRAGONS[0].build, colours(DRAGONS[0]));
  const world = new Float32Array(BONE_COUNT * 12);
  const skin = new Float32Array(BONE_COUNT * 12);
  // A pose with every angle at zero (the named rest pose keeps a little glide dihedral and idle sway).
  const sk = built.skeleton;
  const zero = { flap: Math.PI / 2, power: 0, tuck: 0, brake: 0, turn: 0, arch: 0, lookYaw: 0, lookPitch: 0, jaw: 0, time: 0 };
  poseSkeleton(sk, zero, world, skin);
  const p = [0.3, -0.2, 1.1];
  const q = [0, 0, 0];
  for (const bone of [BONE.chest, BONE.hips, BONE.jaw]) {
    skinPoint(skin, bone, p, q);
    assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.2, 'the body barely moves at rest');
  }
  // The rest pose is a glide: wings out to both sides and a little raised, 19 m and more from
  // tip to tip for the big one (19.7 m with the wings flat out: the span of a small airliner).
  const v = posed(built, restPose());
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    minX = Math.min(minX, v[i]);
    maxX = Math.max(maxX, v[i]);
    minZ = Math.min(minZ, v[i + 2]);
    maxZ = Math.max(maxZ, v[i + 2]);
  }
  assert.ok(maxX - minX > 18.5 && maxX - minX < 20.5, 'wingspan ' + (maxX - minX).toFixed(1) + ' m');
  assert.ok(Math.abs(maxX + minX) < 0.2, 'the same on both sides');
  assert.ok(maxZ - minZ > 17 && maxZ - minZ < 23, 'nose to tail ' + (maxZ - minZ).toFixed(1) + ' m');
  // The smaller one is still a big animal: 15 m across.
  const small = posed(buildDragon(DRAGONS[1].build, colours(DRAGONS[1])), restPose());
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < small.length; i += 3) {
    lo = Math.min(lo, small[i]);
    hi = Math.max(hi, small[i]);
  }
  assert.ok(hi - lo > 14 && hi - lo < 17, 'the smaller one: ' + (hi - lo).toFixed(1) + ' m');
});

test('a wingbeat: tips high at the top, low at the bottom, folded on the way up, and both wings alike', () => {
  const built = buildDragon(DRAGONS[0].build, colours(DRAGONS[0]));
  const sk = built.skeleton;
  const world = new Float32Array(BONE_COUNT * 12);
  const skin = new Float32Array(BONE_COUNT * 12);
  const tip = (flap, side) => {
    const pose = Object.assign(restPose(), { flap, power: 1 });
    poseSkeleton(sk, pose, world, skin);
    const wing = side > 0 ? sk.wingL : sk.wingR;
    return skinPoint(skin, side > 0 ? BONE.handL : BONE.handR, wing.tip1, [0, 0, 0]);
  };
  const top = tip(0, 1);
  const bottom = tip(Math.PI, 1);
  assert.ok(top[1] > 4.5, 'tip at the top of the stroke: ' + top[1].toFixed(1) + ' m up');
  assert.ok(bottom[1] < -2.2, 'tip at the bottom: ' + bottom[1].toFixed(1) + ' m');
  // Left and right mirror each other at every point of the beat.
  for (let flap = 0; flap < 6.3; flap += 0.4) {
    const l = tip(flap, 1);
    const r = tip(flap, -1);
    assert.ok(Math.abs(l[0] + r[0]) < 1e-3 && Math.abs(l[1] - r[1]) < 1e-3 && Math.abs(l[2] - r[2]) < 1e-3, 'mirrored at ' + flap.toFixed(1));
  }
  // The wing reaches further out going down than coming up (it folds on the upstroke).
  const down = tip(Math.PI / 2, 1);
  const up = tip((3 * Math.PI) / 2, 1);
  assert.ok(Math.hypot(down[0], down[2]) > Math.hypot(up[0], up[2]) + 1.2, 'spread ' + down[0].toFixed(1) + ' m against ' + up[0].toFixed(1) + ' m folded');
  // The body rides up and down a little with the beat.
  let lo = Infinity;
  let hi = -Infinity;
  for (let flap = 0; flap < 6.3; flap += 0.1) {
    const h = heave({ flap, power: 1 });
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  assert.ok(hi - lo > 0.3 && hi - lo < 1, 'heave ' + (hi - lo).toFixed(2) + ' m');
  assert.ok(Math.abs(heave({ flap: 1, power: 0 })) === 0, 'no heave in a glide');
});

test('whatever the pose, the dragon stays inside the sphere it is culled by, and nothing is NaN', () => {
  const rng = makeRng(5);
  for (const spec of DRAGONS) {
    const built = buildDragon(spec.build, colours(spec));
    const s = built.skeleton.build.scale;
    // The sphere dragons.js gives three.js: if a vertex could leave it, the dragon could vanish at the edge of view.
    const centre = [0, 0, -1.5 * s];
    const radius = 10.5 * s;
    let far = 0;
    for (let n = 0; n < 400; n++) {
      const pose = {
        flap: rng() * 6.283, power: rng(), tuck: rng() < 0.3 ? rng() : 0, brake: rng() < 0.3 ? rng() : 0,
        turn: rng() * 2 - 1, arch: rng() * 2 - 1, lookYaw: (rng() * 2 - 1) * 1.22, lookPitch: (rng() * 2 - 1) * 0.75, jaw: rng(), time: rng() * 500,
      };
      const v = posed(built, pose);
      for (let i = 0; i < v.length; i += 3) {
        assert.ok(Number.isFinite(v[i] + v[i + 1] + v[i + 2]), 'finite');
        const d = Math.hypot(v[i] - centre[0], v[i + 1] - centre[1] - heave(pose) * s, v[i + 2] - centre[2]);
        if (d > far) far = d;
      }
    }
    assert.ok(far < radius, spec.name + ': furthest vertex ' + far.toFixed(2) + ' m from the centre, sphere ' + radius.toFixed(2) + ' m');
  }
});

test('the skeleton: 24 bones, parents before children, and the head turns to look', () => {
  const sk = makeSkeleton(DRAGONS[0].build);
  assert.equal(sk.pos.length, BONE_COUNT);
  assert.equal(BONE_COUNT, 24);
  const world = new Float32Array(BONE_COUNT * 12);
  const skin = new Float32Array(BONE_COUNT * 12);
  // (Places on the animal are given for a dragon of size 1, and grow with it.)
  const k = sk.build.scale;
  const nose = [0, (0.25 + 0.4) * k, (1.7 + 4.05) * k];
  const at = (pose) => skinPoint(poseSkeleton(sk, Object.assign(restPose(), pose), world, skin), BONE.head, nose, [0, 0, 0]);
  const ahead = at({});
  const left = at({ lookYaw: 1 });
  const up = at({ lookPitch: 0.6 });
  assert.ok(left[0] > ahead[0] + 1 * k, 'looking left moves the nose to its left (+x): ' + left[0].toFixed(2));
  assert.ok(up[1] > ahead[1] + 0.5 * k, 'looking up lifts it: ' + up[1].toFixed(2));
  // The jaw drops when it opens.
  const chin = [0, 0.3 * k, (1.7 + 3.9) * k];
  const shut = skinPoint(poseSkeleton(sk, restPose(), world, skin), BONE.jaw, chin, [0, 0, 0]);
  const open = skinPoint(poseSkeleton(sk, Object.assign(restPose(), { jaw: 1 }), world, skin), BONE.jaw, chin, [0, 0, 0]);
  assert.ok(open[1] < shut[1] - 0.3 * k, 'the chin drops ' + (shut[1] - open[1]).toFixed(2) + ' m');
});

test('fire: a spray of tongues from the mouth, pointing the way the snout does, and three discs of glow', () => {
  for (const spec of DRAGONS) {
    const f = buildFlame(spec.build);
    const s = spec.build.scale;
    assert.ok(f.tongues >= 40 && f.tongues <= 120, 'triangles in the tongues: ' + f.tongues);
    assert.ok(f.triangles <= 200, 'triangles in all, the glow with them: ' + f.triangles);
    assert.equal(f.position.length, f.vertices * 3);
    assert.equal(f.dir.length, f.vertices * 3);
    assert.equal(f.flame.length, f.vertices * 3);
    assert.equal(f.glow.length, f.vertices * 4);
    assert.ok(Math.abs(f.length - 9.5 * s) < 1e-6);
    // It starts where the mouth is: in front of the head joint, on the midline.
    const sk = makeSkeleton(spec.build);
    const head = sk.pos[BONE.head];
    for (let i = 0; i < f.vertices; i++) {
      const x = f.position[i * 3];
      const y = f.position[i * 3 + 1];
      const z = f.position[i * 3 + 2];
      assert.ok(Math.abs(x) < 0.6 * s && Math.abs(y - head[1]) < 0.8 * s, 'at the mouth');
      assert.ok(z > head[2] + 0.8 * s && z < head[2] + 2.2 * s, 'in front of the head: ' + (z - head[2]).toFixed(2));
      const d = [f.dir[i * 3], f.dir[i * 3 + 1], f.dir[i * 3 + 2]];
      assert.ok(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-5, 'unit direction');
      assert.ok(d[2] > 0.93, 'forward, inside a narrow cone');
      assert.ok(f.flame[i * 3] >= 0 && f.flame[i * 3] <= 1);
    }
    // Every tongue has a tip that travels.
    let tips = 0;
    for (let i = 0; i < f.tongues * 3; i++) if (f.flame[i * 3] > 0.5) tips++;
    assert.equal(tips, f.tongues, 'one travelling corner per triangle');
    // The glow: the tongues have none; each disc is bright in its middle and nothing at its
    // rim, so that it has no edge; and none is bigger than the dragon is long.
    for (let i = 0; i < f.tongues * 3; i++) assert.equal(f.glow[i * 4 + 2], 0, 'a tongue is not a disc');
    const discs = new Map();
    for (let i = f.tongues * 3; i < f.vertices; i++) {
      const [x, y, radius, bright] = [f.glow[i * 4], f.glow[i * 4 + 1], f.glow[i * 4 + 2], f.glow[i * 4 + 3]];
      assert.ok(radius > 0.5 * s && radius < 8 * s, 'a disc of ' + radius.toFixed(1) + ' m');
      const out = Math.hypot(x, y);
      assert.ok(out <= 1 + 1e-6);
      if (out > 0.999) assert.equal(bright, 0, 'nothing at the rim');
      if (out < 1e-6) assert.ok(bright > 0.1 && bright <= 0.7, 'the middle is added light, not white: ' + bright);
      const disc = discs.get(radius) || { most: 0, n: 0 };
      disc.most = Math.max(disc.most, bright);
      disc.n++;
      discs.set(radius, disc);
    }
    assert.equal(discs.size, FLAME_GLOW.length, 'three discs');
    // The bigger the disc, the dimmer: the hot one is small and at the mouth.
    const order = [...discs.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1].most);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] < order[i - 1], 'wider is dimmer');
  }
});
