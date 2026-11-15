/**
 * main.js: wiring. (First cut: the scene and the flat view.)
 */
import { Stage, THREE } from './scene.js';
import { FlatView } from './view.js';
import { DragonView } from './dragons.js';

let stage;
let view;
const state = { time: 0 };

function start() {
  const canvas = document.getElementById('stage');
  const t0 = performance.now();
  stage = new Stage(canvas, {});
  view = new FlatView(stage);
  view.follow = false;
  const dragons = [new DragonView(stage, 0), new DragonView(stage, 1)];
  const flyers = [
    { x: -6, y: 3, z: -22, heading: 1.9, pitch: 0.05, bank: 0.25, flap: 1.2, power: 1, tuck: 0, brake: 0, turn: 0.3, arch: 0, lookYaw: 0.4, lookPitch: 0, jaw: 0 },
    { x: 14, y: 7, z: -30, heading: -1.0, pitch: 0.1, bank: -0.5, flap: 4.2, power: 1, tuck: 0, brake: 0, turn: -0.5, arch: 0.2, lookYaw: 0, lookPitch: 0, jaw: 0.6 },
  ];
  const layout = () => stage.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', layout);
  layout();
  let last = performance.now();
  stage.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    state.time += dt;
    view.apply();
    dragons.forEach((d, i) => d.update(flyers[i], state.time, dt));
    stage.update(state.time);
    stage.render();
  });
  window.__dragons = { stage, view, state, THREE, dragons, flyers, ready: true, buildMs: performance.now() - t0 };
}

start();
