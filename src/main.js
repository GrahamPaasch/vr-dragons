/**
 * main.js: wiring. (First cut: the scene and the flat view.)
 */
import { Stage, THREE } from './scene.js';
import { FlatView } from './view.js';

let stage;
let view;
const state = { time: 0 };

function start() {
  const canvas = document.getElementById('stage');
  const t0 = performance.now();
  stage = new Stage(canvas, {});
  view = new FlatView(stage);
  view.follow = false;
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
    stage.update(state.time);
    stage.render();
  });
  window.__dragons = { stage, view, state, THREE, ready: true, buildMs: performance.now() - t0 };
}

start();
