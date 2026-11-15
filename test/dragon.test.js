import test from 'node:test';
import assert from 'node:assert/strict';
import { BONE, BONE_COUNT, makeSkeleton, poseSkeleton, restPose, heave, skinPoint } from '../src/rig.js';
import { buildDragon, DRAGONS } from '../src/dragonGeometry.js';
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
  // The rest pose is a glide: wings out to both sides, about 13.6 m from tip to tip for the big one.
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
  assert.ok(maxX - minX > 12 && maxX - minX < 15, 'wingspan ' + (maxX - minX).toFixed(1) + ' m');
  assert.ok(Math.abs(maxX + minX) < 0.2, 'the same on both sides');
  assert.ok(maxZ - minZ > 11 && maxZ - minZ < 16, 'nose to tail ' + (maxZ - minZ).toFixed(1) + ' m');
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
  assert.ok(top[1] > 3, 'tip at the top of the stroke: ' + top[1].toFixed(1) + ' m up');
  assert.ok(bottom[1] < -1.5, 'tip at the bottom: ' + bottom[1].toFixed(1) + ' m');
  // Left and right mirror each other at every point of the beat.
  for (let flap = 0; flap < 6.3; flap += 0.4) {
    const l = tip(flap, 1);
    const r = tip(flap, -1);
    assert.ok(Math.abs(l[0] + r[0]) < 1e-3 && Math.abs(l[1] - r[1]) < 1e-3 && Math.abs(l[2] - r[2]) < 1e-3, 'mirrored at ' + flap.toFixed(1));
  }
  // The wing reaches further out going down than coming up (it folds on the upstroke).
  const down = tip(Math.PI / 2, 1);
  const up = tip((3 * Math.PI) / 2, 1);
  assert.ok(Math.hypot(down[0], down[2]) > Math.hypot(up[0], up[2]) + 0.8, 'spread ' + down[0].toFixed(1) + ' m against ' + up[0].toFixed(1) + ' m folded');
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
  const nose = [0, 0.25 + 0.4, 1.7 + 4.05];
  const at = (pose) => skinPoint(poseSkeleton(sk, Object.assign(restPose(), pose), world, skin), BONE.head, nose, [0, 0, 0]);
  const ahead = at({});
  const left = at({ lookYaw: 1 });
  const up = at({ lookPitch: 0.6 });
  assert.ok(left[0] > ahead[0] + 1, 'looking left moves the nose to its left (+x): ' + left[0].toFixed(2));
  assert.ok(up[1] > ahead[1] + 0.5, 'looking up lifts it: ' + up[1].toFixed(2));
  // The jaw drops when it opens.
  const chin = [0, 0.3, 1.7 + 3.9];
  const shut = skinPoint(poseSkeleton(sk, restPose(), world, skin), BONE.jaw, chin, [0, 0, 0]);
  const open = skinPoint(poseSkeleton(sk, Object.assign(restPose(), { jaw: 1 }), world, skin), BONE.jaw, chin, [0, 0, 0]);
  assert.ok(open[1] < shut[1] - 0.3, 'the chin drops ' + (shut[1] - open[1]).toFixed(2) + ' m');
});
