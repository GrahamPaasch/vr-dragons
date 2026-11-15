/**
 * main.js: wiring. (Second cut: the dragons fly; no sound, no VR yet.)
 */
import { Stage, THREE, WORLD_SEED } from './scene.js';
import { FlatView } from './view.js';
import { DragonView } from './dragons.js';
import { DRAGONS } from './dragonGeometry.js';
import { Director } from './flight.js';

let stage;
let view;
const state = { time: 0 };

function start() {
  const canvas = document.getElementById('stage');
  const t0 = performance.now();
  stage = new Stage(canvas, {});
  view = new FlatView(stage);
  const dragons = [new DragonView(stage, 0), new DragonView(stage, 1)];
  const director = new Director(DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale })), WORLD_SEED);
  const target = { x: 0, y: 0, z: -100 };

  const advance = (dt) => {
    // Long frames are flown in several short steps, so the flight does not depend on the frame rate.
    const n = Math.max(1, Math.ceil(dt / (1 / 45)));
    for (let i = 0; i < n; i++) director.step(dt / n);
    director.drain();
    state.time += dt;
  };
  const pose = (dt) => {
    dragons.forEach((d, i) => d.update(director.flyers[i], state.time, dt));
    // Look at the nearer dragon, mostly.
    const f = director.flyers;
    const d0 = Math.hypot(f[0].x, f[0].y, f[0].z);
    const d1 = Math.hypot(f[1].x, f[1].y, f[1].z);
    const w = (1 / (d0 * d0)) / (1 / (d0 * d0) + 1 / (d1 * d1));
    target.x = f[0].x * w + f[1].x * (1 - w);
    target.y = f[0].y * w + f[1].y * (1 - w);
    target.z = f[0].z * w + f[1].z * (1 - w);
  };
  /** Jump to a time in the flight (for pictures and tests). */
  const seek = (t) => {
    director.reset();
    state.time = 0;
    const dt = 1 / 72;
    while (state.time < t) advance(dt);
    pose(dt);
    stage.update(state.time);
  };

  const layout = () => stage.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', layout);
  layout();
  let last = performance.now();
  let paused = false;
  stage.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) {
      advance(dt);
      pose(dt);
      view.update(dt, target);
    }
    view.apply();
    stage.update(state.time);
    stage.render();
  });
  window.__dragons = {
    stage, view, state, THREE, dragons, director, seek, ready: true, buildMs: performance.now() - t0,
    setFlatShot: () => {
      paused = true;
    },
  };
}

start();
