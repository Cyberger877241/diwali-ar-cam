// Page wiring both cams share: webcam + tracker start-up, the toast, the
// status panel, keyboard shortcuts and the frame loop. A cam supplies
// what's specific to it through the callbacks below.

import * as THREE from 'three';
import { createWebcam } from './webcam.js';
import { loadHandTracker } from './hands.js';
import { createRecorder } from './recorder.js';

export function runCam({ stage, feed, recordLayers, filePrefix, keys = {}, onHands, onFrame, status }) {
  const video = document.querySelector('video.source');
  const toast = document.getElementById('toast');
  const panel = document.getElementById('status');
  const hint = document.getElementById('hint');
  const state = { tracker: null, trackerNote: 'loading…', handsSeen: 0, panelOpen: false };

  let toastTimer = 0;
  function say(text) {
    toast.textContent = text;
    toast.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = 0; }, 5000);
  }

  const webcam = createWebcam(video, feed);

  async function boot() {
    try {
      await webcam.start();
    } catch (error) {
      state.trackerNote = `no camera (${error?.name || 'error'})`;
      hint.innerHTML = `camera blocked (${error?.name || 'error'})<br>open this page from http://localhost and allow the camera`;
      return;
    }
    stage.attachVideo(video);
    hint.remove();
    say(`${webcam.description}  ·  C to switch camera`);
    try {
      state.tracker = await loadHandTracker();
      state.trackerNote = `ready (${state.tracker.delegate})`;
    } catch (error) {
      state.trackerNote = `failed: ${String(error?.message || error).slice(0, 60)}`;
      console.error('hand tracker failed to load', error);
    }
  }
  boot();

  const recorder = createRecorder({ layers: recordLayers, filePrefix, indicator: document.getElementById('rec') });

  const shortcuts = {
    ' ': () => recorder.toggle(),
    c: async () => say(await webcam.next()),
    h: () => { state.panelOpen = !state.panelOpen; panel.style.display = state.panelOpen ? 'block' : 'none'; },
    ArrowLeft: () => stage.nudgeShift(-0.02),
    ArrowRight: () => stage.nudgeShift(0.02),
    ArrowDown: () => stage.resetShift(),
    ...keys,
  };
  window.addEventListener('keydown', (event) => {
    const action = shortcuts[event.key] ?? shortcuts[event.key.toLowerCase()];
    if (!action) return;
    if (event.key === ' ') event.preventDefault();
    action();
  });

  const clock = new THREE.Clock();
  let nextHandRead = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.5);
    const time = clock.elapsedTime;

    // ~30 reads a second is plenty and leaves the GPU for rendering
    if (time >= nextHandRead) {
      nextHandRead = time + 1 / 30;
      let found = { hands: [], labels: [] };
      if (state.tracker && video.readyState >= 2) {
        try {
          found = state.tracker.detect(video);
        } catch (error) {
          state.trackerNote = `detect error: ${String(error?.message || '').slice(0, 40)}`;
        }
      }
      state.handsSeen = found.hands.length;
      onHands(found, time);
    }

    onFrame(dt, time);
    stage.render();
    recorder.capture();

    if (state.panelOpen) {
      panel.textContent = [
        ...status(),
        `hands: ${state.handsSeen}/2   tracker: ${state.trackerNote}`,
        `camera: ${webcam.description || '—'}`,
        `[space] record  [C] camera  [←/→] move  [↓] reset  [H] hide`,
      ].join('\n');
    }
  }
  frame();

  return { video };
}

// eases toward a target at a framerate-independent speed
export function follow(current, target, dt, seconds) {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(seconds, 1e-4)));
}

// small fast deterministic PRNG (splitmix32), so layouts are the same every load
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}
