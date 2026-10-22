const test = require('node:test');
const assert = require('node:assert');
const { createFrameCap, FPS } = require('../js/frame-cap');

// A stand-in for requestAnimationFrame on a display that refreshes every `stepMs`.
function fakeDisplay() {
  let clock = 0;
  let queue = [];
  return {
    now: () => clock,
    raf: (cb) => queue.push(cb),
    // Runs the display for `ms`, one refresh every `stepMs`.
    run(ms, stepMs = 8) {
      for (const end = clock + ms; clock < end; ) {
        clock += stepMs;
        const due = queue;
        queue = [];
        due.forEach((cb) => cb(clock));
      }
    },
  };
}

// Counts how often an endless animation loop (like orb.js) actually draws.
function animate(raf) {
  const counter = { frames: 0 };
  const frame = () => {
    counter.frames++;
    raf(frame);
  };
  raf(frame);
  return counter;
}

test('delivers at most fps frames per second', () => {
  const d = fakeDisplay();
  const loop = animate(createFrameCap({ raf: d.raf, now: d.now, fpsFor: () => 30 }));
  d.run(1000);
  assert.ok(loop.frames >= 29 && loop.frames <= 31, `got ${loop.frames} frames`);
});

test('idle runs slower', () => {
  const d = fakeDisplay();
  const loop = animate(createFrameCap({ raf: d.raf, now: d.now, fpsFor: () => FPS.idle }));
  d.run(1000);
  assert.ok(loop.frames >= 7 && loop.frames <= 9, `got ${loop.frames} frames`);
});

test('changing state takes effect on the next frame', () => {
  const d = fakeDisplay();
  let fps = 8;
  const loop = animate(createFrameCap({ raf: d.raf, now: d.now, fpsFor: () => fps }));
  d.run(1000);
  const firstHalf = loop.frames;
  fps = 30;
  d.run(1000);
  assert.ok(loop.frames - firstHalf > firstHalf, `${firstHalf} then ${loop.frames - firstHalf}`);
});
