// Blue energy blob. State changes its look:
//   idle      slow breathing
//   choosing  breathing with a soft ring (waiting for you to pick a mode)
//   listening ripples that expand with your voice level
//   thinking  violet, with orbiting sparks (draft being written)
(function () {
  const canvas = document.getElementById('blob');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const C = W / 2;
  const api = { level: 0, state: 'idle' };
  let smooth = 0;

  const COLORS = {
    idle: ['#bfe0ff', '#4da3ff', '#1f5fd6', '77,163,255'],
    choosing: ['#bfe0ff', '#4da3ff', '#1f5fd6', '77,163,255'],
    listening: ['#c9ffe3', '#4da3ff', '#1f5fd6', '77,163,255'],
    thinking: ['#e3d6ff', '#9a7bff', '#5a3fd6', '154,123,255'],
  };

  function frame(t) {
    smooth += (api.level - smooth) * 0.2;
    const s = api.state;
    const col = COLORS[s] || COLORS.idle;
    const voice = s === 'listening' ? Math.min(smooth * 6, 1) : 0;
    const energy = s === 'idle' ? 0.08 : s === 'thinking' ? 0.35 : 0.2 + voice;
    const base = W * 0.26 * (1 + energy * 0.3);
    ctx.clearRect(0, 0, W, W);

    const glow = ctx.createRadialGradient(C, C, base * 0.4, C, C, W * 0.5);
    glow.addColorStop(0, `rgba(${col[3]},${0.55 + energy * 0.3})`);
    glow.addColorStop(1, `rgba(${col[3]},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, W);

    // Ripples while listening: three rings expanding outward, brighter when you speak louder.
    if (s === 'listening' || s === 'choosing') {
      for (let i = 0; i < 3; i++) {
        const p = ((t / 1400) + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(C, C, base + p * (W * 0.22), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${col[3]},${(1 - p) * (0.25 + voice * 0.6)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.1) {
      const wob = Math.sin(a * 3 + t / 400) * 4 + Math.sin(a * 5 - t / 300) * 3;
      const r = base + wob * (0.5 + energy * 2);
      const x = C + Math.cos(a) * r;
      const y = C + Math.sin(a) * r;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const fill = ctx.createRadialGradient(C - 8, C - 8, 2, C, C, base * 1.4);
    fill.addColorStop(0, col[0]);
    fill.addColorStop(0.5, col[1]);
    fill.addColorStop(1, col[2]);
    ctx.fillStyle = fill;
    ctx.fill();

    // Orbiting sparks while the draft is being written.
    if (s === 'thinking') {
      for (let i = 0; i < 5; i++) {
        const a = t / 500 + (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(C + Math.cos(a) * base * 1.55, C + Math.sin(a) * base * 1.55, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e3d6ff';
        ctx.fill();
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.blob = api;
})();
