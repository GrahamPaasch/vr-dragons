#!/usr/bin/env node
/**
 * Plays fetch without drawing anything: picks the ball up, holds it a moment, throws it, and
 * follows what the dragons do until the ball is back (at the viewer's feet, or held out on the
 * spire and taken). For tuning and for the tests.
 *
 *   node tools/fetchsim.mjs                         a set of throws in both modes, a line each
 *   node tools/fetchsim.mjs 12 0 exercise -v        one throw: hand speed (m/s), direction (degrees
 *                                                  left of straight ahead), mode; -v: every event
 *   FETCH_SEED=7 node tools/fetchsim.mjs ...
 */
import { Director } from '../src/flight.js';
import { DRAGONS } from '../src/dragonGeometry.js';
import { Fetch, REST_SPOT, BALL_RADIUS } from '../src/fetch.js';
import { ground } from '../src/world.js';

const DT = 1 / 60;
const HEAD = [0, 1.62, 0];

/**
 * One throw. Returns what happened: { ok, seconds, winner, how ('air' | 'water' | 'land' |
 * 'pluck'), back ('feet' | 'jaws'), events, nearest (closest any dragon's body came to the head
 * while flying), problems }.
 */
export function playOne(options) {
  const o = Object.assign({ hand: 10, yaw: 0, up: 34, mode: 'exercise', seed: 11, warm: 30, hold: 4, limit: 90, verbose: false }, options);
  const director = new Director(DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale })), o.seed);
  const game = new Fetch(director, DRAGONS);
  game.setHands(true);
  game.setHead(HEAD[0], HEAD[1], HEAD[2]);
  if (o.mode === 'perch') game.toggleMode();
  const log = [];
  let t = 0;
  const step = () => {
    director.step(DT);
    t += DT;
    for (const e of game.events) log.push([t, e]);
    game.events.length = 0;
    director.drain();
  };
  // The opening flies a while first.
  while (t < o.warm) step();
  // Pick it up from the rock, and hold it out.
  const b = game.ball;
  const hand = [b.x - 0.1, b.y + BALL_RADIUS * 0.7, b.z];
  if (!game.grab('right', hand[0], hand[1], hand[2])) return { ok: false, problems: ['could not pick the ball up from ' + b.state] };
  const holdUntil = t + o.hold;
  while (t < holdUntil) {
    game.hold('right', 0.3, 1.2, -0.3, 0, 0, 0);
    step();
  }
  // The throw.
  const yaw = (o.yaw * Math.PI) / 180;
  const up = (o.up * Math.PI) / 180;
  const v = [-Math.sin(yaw) * Math.cos(up) * o.hand, Math.sin(up) * o.hand, -Math.cos(yaw) * Math.cos(up) * o.hand];
  game.hold('right', 0.3, 1.5, -0.5, v[0], v[1], v[2]);
  game.release('right', v[0], v[1], v[2]);
  const thrownAt = t;
  let nearest = Infinity;
  let nearestWhat = '';
  let landedAt = null;
  let where = null;
  let back = null;
  let problems = [];
  let lastState = '';
  const phases = [[], []];
  while (t - thrownAt < o.limit) {
    step();
    const bs = game.ball.state;
    if (bs !== lastState) {
      if (o.verbose) log.push([t, { type: 'ball', state: bs, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1) }]);
      lastState = bs;
      if (!landedAt && (bs === 'ground' || bs === 'floating' || bs === 'rolling')) {
        landedAt = t - thrownAt;
        where = [b.x, b.y, b.z];
      }
    }
    for (let i = 0; i < 2; i++) {
      const f = director.flyers[i];
      if (!Number.isFinite(f.x + f.y + f.z)) problems.push('dragon ' + i + ' is not a number');
      const job = director.jobs[i];
      const phase = game.d[i].script ? 'script:' + game.d[i].script.moves[game.d[i].script.k].name : job ? (job.kind ? job.phase : 'pass:' + job.phase) : game.eager ? 'ring' : 'lanes';
      if (phases[i][phases[i].length - 1] !== phase) {
        phases[i].push(phase);
        if (o.verbose) log.push([t, { type: 'phase', dragon: i, phase, at: [f.x.toFixed(0), f.y.toFixed(0), f.z.toFixed(0)].join(',') }]);
      }
      // How close a flying body comes (a perched one is close on purpose).
      if (!game.d[i].script) {
        const dd = Math.hypot(f.x - HEAD[0], f.y - HEAD[1], f.z - HEAD[2]);
        if (dd < nearest) {
          nearest = dd;
          nearestWhat = DRAGONS[i].name + ' ' + phase + ' at ' + [f.x, f.y, f.z].map((x) => x.toFixed(1)).join(',') + ' t+' + (t - thrownAt).toFixed(1) + ' ball ' + bs;
        }
      }
    }
    if (bs === 'rest') {
      // On the ledge: at the feet, or somewhere else on the rock (where a hand can reach it too).
      back = Math.hypot(b.x - HEAD[0], b.z - (HEAD[2] - 0.45)) < 0.6 ? 'feet' : 'ledge';
      break;
    }
    if (bs === 'offered') {
      // Take it from the jaws.
      if (game.grab('right', b.x, b.y, b.z)) {
        back = 'jaws';
        break;
      }
      problems.push('offered but out of reach');
      break;
    }
    if (bs === 'held') {
      back = 'fresh';
      break;
    }
  }
  const catches = log.filter(([, e]) => e.type === 'catch');
  const scenes = log.filter(([, e]) => e.type === 'scene' && e.kind !== 'perch');
  const first = catches.find(([at]) => at > thrownAt);
  const scene = scenes.find(([at]) => at > thrownAt);
  if (first && first[1].air) where = [first[1].x, first[1].y, first[1].z];
  return {
    ok: back === 'feet' || back === 'jaws' || (back === 'ledge' && !o.strict),
    seconds: t - thrownAt,
    winner: first ? DRAGONS[first[1].dragon].name : '-',
    how: first ? (first[1].air ? 'air' : scene ? scene[1].kind : '?') : '-',
    landedAt,
    where,
    back,
    nearest,
    nearestWhat,
    offerMiss: game.offerMiss,
    phases,
    problems,
    log,
    throwSpeed: Math.hypot(...v),
  };
}

if (process.argv[1] && process.argv[1].endsWith('fetchsim.mjs')) {
  const args = process.argv.slice(2).filter((a) => a !== '-v');
  const verbose = process.argv.includes('-v');
  const seed = Number(process.env.FETCH_SEED || 11);
  const runs = args.length
    ? [{ hand: Number(args[0]), yaw: Number(args[1] || 0), mode: args[2] || 'exercise' }]
    : [2, 4, 6, 8, 10, 12, 15].flatMap((hand) => [-30, 0, 25].flatMap((yaw) => ['exercise', 'perch'].map((mode) => ({ hand, yaw, mode }))));
  if (process.env.FETCH_STATS) {
    // Many seeds and moments: who wins what, how often in the air, how long a fetch takes.
    const rows = {};
    let n = 0;
    let bad = 0;
    for (let seed = 1; seed <= Number(process.env.FETCH_STATS); seed++) {
      for (const hand of [2, 3, 5, 8, 11, 15]) {
        for (const yaw of [-35, -10, 10, 30]) {
          const res = playOne({ hand, yaw, seed, warm: 25 + (seed % 7) * 6, mode: seed % 2 ? 'exercise' : 'perch' });
          n++;
          if (!res.ok) bad++;
          const band = hand <= 3 ? 'lob' : hand <= 8 ? 'mid' : 'long';
          const r = (rows[band] = rows[band] || { n: 0, Ember: 0, Tarn: 0, air: 0, water: 0, land: 0, pluck: 0, secs: [], nearest: Infinity });
          r.n++;
          if (res.winner !== '-') r[res.winner]++;
          if (res.how in r) r[res.how]++;
          r.secs.push(res.seconds);
          r.nearest = Math.min(r.nearest, res.nearest);
          if (res.nearest < 11) console.log('  CLOSE', res.nearest.toFixed(1), 'm:', res.nearestWhat, '| hand', hand, 'yaw', yaw, 'seed', seed);
          if (!res.ok) console.log('  FAILED', res.back, res.problems.join(';'), '| hand', hand, 'yaw', yaw, 'seed', seed, 'warm', 25 + (seed % 7) * 6, seed % 2 ? 'exercise' : 'perch', '|', res.phases.map((p) => p.slice(-6).join('>')).join(' || '));
        }
      }
    }
    for (const [band, r] of Object.entries(rows)) {
      r.secs.sort((a, b) => a - b);
      console.log(band.padEnd(5), 'n', r.n, '| Ember', r.Ember, 'Tarn', r.Tarn, '| air', r.air, 'water', r.water, 'land', r.land, 'pluck', r.pluck, '| median', r.secs[r.secs.length >> 1].toFixed(0), 's, worst', r.secs[r.secs.length - 1].toFixed(0), 's | nearest flying body', r.nearest.toFixed(1), 'm');
    }
    console.log(n - bad, 'of', n, 'came back');
    process.exit(bad ? 1 : 0);
  }
  let fails = 0;
  for (const r of runs) {
    const res = playOne(Object.assign({ seed, verbose }, r));
    if (!res.ok) fails++;
    const land = res.where ? Math.hypot(res.where[0], res.where[2]).toFixed(0) + ' m out' : '';
    console.log(
      [
        ('hand ' + r.hand + ' m/s').padEnd(13), ('yaw ' + r.yaw).padEnd(8), r.mode.padEnd(9),
        (res.ok ? 'back ' + res.back : 'FAILED ' + (res.back || '')).padEnd(14),
        (res.seconds ? res.seconds.toFixed(1) + ' s' : '').padEnd(8),
        res.winner.padEnd(6), res.how.padEnd(6), land.padEnd(10),
        'nearest ' + (res.nearest === undefined ? '-' : res.nearest.toFixed(1)),
        res.offerMiss !== undefined && r.mode === 'perch' ? 'offer miss ' + res.offerMiss.toFixed(2) : '',
        res.problems.length ? 'PROBLEMS ' + res.problems.slice(0, 3).join('; ') : '',
      ].join(' ')
    );
    if (verbose || runs.length === 1) {
      for (const [t, e] of res.log) console.log('   ' + t.toFixed(2).padStart(7) + '  ' + JSON.stringify(e));
      console.log('   phases: ' + res.phases.map((p, i) => DRAGONS[i].name + ': ' + p.join(' > ')).join('\n           '));
    }
  }
  if (runs.length > 1) console.log('\n' + (runs.length - fails) + ' of ' + runs.length + ' came back');
}
