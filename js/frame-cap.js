// Saves battery by capping how often the orb and bear redraw. Phones refresh at up to 120 Hz, but
// the animations look the same at 30 fps, and almost nothing moves while idle. Loaded before orb.js
// and bear.js so their requestAnimationFrame loops are throttled without changing those files.

const FPS = { idle: 8, choosing: 30, listening: 30, thinking: 30 };

// Wraps `raf` so a callback runs at most `fpsFor()` times a second; skipped frames re-queue.
function createFrameCap({ raf, now, fpsFor }) {
  let last = -Infinity;
  return function cappedRaf(cb) {
    const tick = (t) => {
      const interval = 1000 / (fpsFor() || 30);
      const time = now();
      const elapsed = time - last;
      // 1 ms of slack so a frame due between two refreshes isn't pushed back a whole refresh.
      if (elapsed < interval - 1) return raf(tick);
      // Keep to a steady schedule; after a long gap (first frame, tab was hidden) start afresh.
      last = elapsed > 2 * interval ? time : last + interval;
      cb(t);
    };
    return raf(tick);
  };
}

const frameCapApi = { createFrameCap, FPS };
if (typeof module !== 'undefined' && module.exports) module.exports = frameCapApi;
if (typeof window !== 'undefined') {
  window.VoiceFrameCap = frameCapApi;
  if (window.requestAnimationFrame && typeof performance !== 'undefined') {
    window.requestAnimationFrame = createFrameCap({
      raf: window.requestAnimationFrame.bind(window),
      now: () => performance.now(),
      fpsFor: () => FPS[document.body && document.body.dataset.state] || 30,
    });
  }
}
