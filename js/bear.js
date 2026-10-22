// A long, lean, huggable polar bear beside the orb, with a soft ice-blue glow. Each state is
// its own little scene, and scenes cross-fade when the state changes (window.blob.state):
//   idle      HAMMOCK: lounging in a swaying hammock in sunglasses, dozing, and every few
//             seconds sipping a mocktail through a straw ("slurp~"); it gets refilled
//   choosing  STAND: on all fours, head up toward the orb, tail wagging
//   listening STAND: rotates between dancing (music notes), nodding along, and holding an
//             old brass ear trumpet up to the orb; ears and glow react to your voice
//   thinking  TYPEWRITER: a court stenographer in a powdered wig and half-moon glasses,
//             hammering a typewriter, letters flying, "DING!" at every carriage return
(function () {
  const out = document.getElementById('bear-canvas');
  const outCtx = out.getContext('2d');
  const W = out.width;
  const H = out.height;
  // Scenes draw into a buffer first so a whole scene can be faded as one picture.
  const buf = document.createElement('canvas');
  buf.width = W;
  buf.height = H;
  const ctx = buf.getContext('2d');

  const FUR = '#fbfdff';
  const SHADE = '#c3d3e8';
  const FAR = '#a9bcd6'; // limbs on the far side, a touch darker
  const FAR_EDGE = '#8fa4c2';
  const LINE = 'rgba(70,95,140,0.7)';
  const DARK = '#151b27';
  const GLOW = '120,205,255';

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => x * x * (3 - 2 * x);

  // ---- fur drawing: shapes merge into one silhouette with a single outline ----
  let glowNow = 0;
  let batch = null;
  function fur(draw, cx, cy, r, base = FUR, edge = SHADE) {
    const shape = { draw, cx, cy, r, base, edge, m: ctx.getTransform() };
    if (batch) batch.push(shape);
    else silhouette([shape]);
  }
  function silhouette(shapes) {
    ctx.save();
    ctx.shadowColor = `rgba(${GLOW},${glowNow})`;
    ctx.shadowBlur = 6 + glowNow * 18;
    ctx.strokeStyle = LINE;
    ctx.fillStyle = LINE;
    ctx.lineWidth = 3.2;
    for (const s of shapes) {
      ctx.setTransform(s.m);
      ctx.beginPath();
      s.draw();
      ctx.stroke();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const s of shapes) {
      ctx.setTransform(s.m);
      ctx.beginPath();
      s.draw();
      const g = ctx.createRadialGradient(s.cx - s.r * 0.3, s.cy - s.r * 0.5, 2, s.cx, s.cy, s.r * 1.2);
      g.addColorStop(0, s.base);
      g.addColorStop(1, s.edge);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }
  function group(fn) {
    batch = [];
    fn();
    const shapes = batch;
    batch = null;
    silhouette(shapes);
  }
  const oval = (x, y, rx, ry, rot = 0, base, edge) =>
    fur(() => ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), x, y, Math.max(rx, ry), base, edge);

  // A limb from (ax,ay) to (bx,by) ending in a paw.
  function limb(ax, ay, bx, by, r, far) {
    const base = far ? FAR : FUR;
    const edge = far ? FAR_EDGE : SHADE;
    oval((ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay) / 2 + r * 0.5, r, Math.atan2(by - ay, bx - ax), base, edge);
    oval(bx, by, r * 0.95, r * 0.8, 0, base, edge);
  }

  // A standing leg: a column tapering down to a padded paw. lift/reach move the paw up/forward.
  function leg(x, top, bottom, far, lift = 0, reach = 0) {
    const base = far ? FAR : FUR;
    const edge = far ? FAR_EDGE : SHADE;
    const px = x + reach;
    const py = bottom - lift;
    fur(
      () => {
        ctx.moveTo(x - 12, top);
        ctx.quadraticCurveTo(x - 12, (top + py) / 2, px - 9, py - 6);
        ctx.lineTo(px + 9, py - 6);
        ctx.quadraticCurveTo(x + 12, (top + py) / 2, x + 12, top);
        ctx.closePath();
      },
      x,
      (top + py) / 2,
      22,
      base,
      edge
    );
    oval(px + 3, py - 3, 12, 6, 0, base, edge);
  }

  function sparkle(x, y, s, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(220,245,255,${a})`;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.lineTo(0, -s);
      ctx.lineTo(s * 0.25, -s * 0.25);
    }
    ctx.fill();
    ctx.restore();
  }

  function label(text, x, y, color, size = 13, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${size}px "Segoe UI", sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,14,24,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function groundShadow(x, w) {
    ctx.beginPath();
    ctx.ellipse(x, 184, w, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();
  }

  // ================= HAMMOCK (idle) =================
  function drawHammock(t) {
    glowNow = 0.22 + Math.sin(t / 1400) * 0.08;

    // Sip cycle: rest on belly, raise to mouth, slurp, lower. Refilled every 4 sips.
    const SIP = 5600;
    const c = (t % SIP) / SIP;
    const sipK = c < 0.55 ? 0 : c < 0.68 ? ease((c - 0.55) / 0.13) : c < 0.86 ? 1 : c < 0.96 ? 1 - ease((c - 0.86) / 0.1) : 0;
    const sipNo = Math.floor(t / SIP) % 4;
    const level = clamp01(1 - sipNo * 0.24 - (c > 0.68 && c < 0.86 ? ((c - 0.68) / 0.18) * 0.24 : c >= 0.86 ? 0.24 : 0));

    // Posts stay put; the hammock and bear swing between them.
    for (const px of [10, 190]) {
      ctx.fillStyle = '#7a5236';
      ctx.strokeStyle = '#3e2818';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(px - 3, 66, 6, 120);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, 66, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    groundShadow(100, 70);

    const swing = Math.sin(t / 1300) * 0.05;
    ctx.save();
    ctx.translate(100, 70);
    ctx.rotate(swing);
    ctx.translate(-100, -70);

    // ropes
    ctx.strokeStyle = '#d8c79a';
    ctx.lineWidth = 1.6;
    for (const [a, b] of [[[12, 70], [32, 118]], [[188, 70], [168, 118]]]) {
      for (const dy of [-3, 3]) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1] + dy);
        ctx.stroke();
      }
    }

    // hammock fabric (back), striped
    const fabric = (top, sag, depth) => {
      ctx.beginPath();
      ctx.moveTo(32, top);
      ctx.quadraticCurveTo(100, sag, 168, top);
      ctx.lineTo(168, top + depth);
      ctx.quadraticCurveTo(100, sag + depth * 2, 32, top + depth);
      ctx.closePath();
    };
    const stripes = () => {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#2fa79a';
      ctx.fillRect(20, 100, 160, 100);
      ctx.strokeStyle = '#f3e2b0';
      ctx.lineWidth = 5;
      for (let x = 10; x < 200; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 100);
        ctx.lineTo(x + 30, 200);
        ctx.stroke();
      }
      ctx.restore();
    };
    fabric(116, 176, 6);
    stripes();

    // The bear, on its back: crossed feet up on the left, head on the right in sunglasses
    const head = { x: 148, y: 120 };
    const restPaw = { x: 114, y: 120 };
    const sipPaw = { x: 151, y: 104 };
    const paw = { x: lerp(restPaw.x, sipPaw.x, sipK), y: lerp(restPaw.y, sipPaw.y, sipK) };
    const toe = Math.sin(t / 700) * 2; // lazy toe-wiggle

    group(() => {
      limb(64, 138, 40, 146, 9, true); // far leg dangling over the edge
    });
    group(() => {
      oval(98, 132, 48, 19, -0.04); // body
      limb(66, 128, 42, 104 + toe, 9); // near leg, crossed, foot up
      oval(38, 101 + toe, 8, 6.5, 0.4); // foot pad
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(-0.35);
      oval(-12, -11, 5.5, 5.5, 0, FAR, FAR_EDGE); // far ear
      oval(-5, -15, 6, 6); // near ear
      oval(0, 0, 20, 16); // head
      oval(18, -6, 12, 8, -0.2); // snout
      ctx.restore();
      limb(128, 128, paw.x, paw.y, 7.5); // arm holding the drink
    });

    // face: sunglasses, nose, a smug smile
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(28, -9, 4.2, 3.4, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    for (const [lx, ly] of [[2, -6], [13, -8]]) {
      ctx.beginPath();
      ctx.ellipse(lx, ly, 5.6, 4.2, -0.1, 0, Math.PI * 2);
      const lg = ctx.createLinearGradient(lx - 5, ly - 4, lx + 5, ly + 4);
      lg.addColorStop(0, '#3a4a6a');
      lg.addColorStop(1, '#0b0f18');
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx - 2, ly - 1.6, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(7.5, -7);
    ctx.lineTo(8, -8);
    ctx.moveTo(-3, -6);
    ctx.lineTo(-12, -4);
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(18, 1, 5, 0.2 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // the mocktail: stem in paw, coupe of pink drink, straw, tiny umbrella
    const gx = paw.x + 2;
    const gy = paw.y - 6;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(lerp(0, -0.5, sipK));
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(0, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, -12);
    ctx.lineTo(9, -12);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(220,240,255,0.25)';
    ctx.fill();
    ctx.stroke();
    if (level > 0.02) {
      const ly = lerp(-3, -11, level);
      const half = ((ly + 2) / -10) * 9;
      ctx.beginPath();
      ctx.moveTo(-half, ly);
      ctx.lineTo(half, ly);
      ctx.lineTo(0, -2.5);
      ctx.closePath();
      ctx.fillStyle = '#ff7aa2';
      ctx.fill();
    }
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(3, -6);
    ctx.lineTo(8, -20); // straw
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(-9, -21);
    ctx.strokeStyle = '#c99a5a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-9, -21, 6, Math.PI, 2 * Math.PI);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, -21);
    ctx.arc(-9, -21, 6, Math.PI * 1.33, Math.PI * 1.66);
    ctx.fillStyle = '#ff5d8f';
    ctx.fill();
    ctx.restore();

    fabric(132, 168, 7); // front lip of the hammock, over the bear's back
    stripes();
    ctx.restore();

    // z's while dozing, "slurp~" while sipping, "refill!" when the glass runs dry
    if (sipK > 0.9) label('slurp~', 128, 76, '#ffb3c8', 13);
    else if (sipNo === 0 && c < 0.2) label('refill!', 120, 70, '#ffd23f', 12, 1 - c * 5);
    else {
      for (let i = 0; i < 3; i++) {
        const p = ((t / 2200) + i / 3) % 1;
        label('z', 158 + p * 18, 96 - p * 46, '#a8c8f0', 10 + p * 8, 1 - p);
      }
    }
  }

  // ================= STAND (choosing, listening) =================
  const pose = { headX: 0, headY: 0, tilt: 0, glow: 0.5, lift: 0, reach: 0 };
  function drawStand(t, state, voice) {
    const move = ['dance', 'nod', 'trumpet'][Math.floor(t / 3200) % 3];
    const target = { headX: 0, headY: 0, tilt: 0, glow: 0.5, lift: 0, reach: 0 };
    if (state === 'choosing') Object.assign(target, { headY: -8, tilt: -0.12, glow: 0.6 });
    if (state === 'listening') {
      target.glow = 0.45 + voice * 0.55;
      if (move === 'nod') target.headY = Math.abs(Math.sin(t / 230)) * 7;
      if (move === 'dance') Object.assign(target, { headY: Math.sin(t / 200) * 4 - voice * 4, tilt: Math.sin(t / 200) * 0.1 });
      if (move === 'trumpet') Object.assign(target, { headY: -2, tilt: -0.08, lift: 94, reach: 36 });
    }
    for (const k of Object.keys(pose)) pose[k] = lerp(pose[k], target[k], k === 'headY' || k === 'tilt' ? 0.25 : 0.1);
    glowNow = clamp01(pose.glow);

    const dancing = state === 'listening' && move === 'dance';
    const swayX = dancing ? Math.sin(t / 200) * 3 : 0;
    const hop = dancing ? Math.abs(Math.sin(t / 200)) * 4 : 0;
    const wag = state === 'choosing' || dancing ? Math.sin(t / 110) * 3 : 0;
    const breathe = Math.sin(t / 500) * 0.8;
    const hx = 158 + pose.headX;
    const hy = 96 + pose.headY;
    const flick = voice * 3;

    groundShadow(96, 80);
    ctx.save();
    ctx.translate(swayX, -hop);

    group(() => {
      leg(60, 134, 182, true, dancing ? Math.max(0, Math.sin(t / 200)) * 6 : 0);
      leg(134, 134, 182, true);
    });
    group(() => {
      oval(20, 116 + wag, 7, 6); // tail
      oval(44, 122 - breathe / 2, 28, 25 + breathe); // haunch
      oval(84, 124 - breathe / 2, 56, 24 + breathe); // long back
      oval(118, 116 - breathe / 2, 24, 23 + breathe / 2); // shoulder
      leg(40, 134, 182, false, dancing ? Math.max(0, -Math.sin(t / 200)) * 6 : 0);
      const sx = 116;
      const sy = 108;
      const nx = hx - 10;
      const ny = hy + 3;
      oval((sx + nx) / 2, (sy + ny) / 2, Math.hypot(nx - sx, ny - sy) / 2 + 10, 16, Math.atan2(ny - sy, nx - sx));
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(pose.tilt);
      oval(-9 + flick * 0.3, -15 - flick, 5.5, 5.5, 0, FAR, FAR_EDGE);
      oval(-1 + flick * 0.5, -17 - flick, 6, 6);
      oval(0, 0, 21, 17);
      oval(20, 5, 13, 8.5);
      ctx.restore();
      // near front leg last, so when raised (holding the ear trumpet) it's in front of the neck
      leg(116, 132, 182, false, pose.lift, pose.reach);
    });

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(pose.tilt);
    ctx.beginPath();
    ctx.arc(-1 + flick * 0.5, -17 - flick, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#7a8aa3';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(31, 2, 4.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = `rgba(${GLOW},${0.6 + voice * 0.4})`;
    ctx.shadowBlur = state === 'listening' ? 8 + voice * 8 : 0;
    ctx.beginPath();
    ctx.ellipse(7, -4, 3.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(8.2, -5.2, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    if (state === 'listening' && voice > 0.2) ctx.ellipse(23, 10, 2.5, 1.5 + voice * 2, 0, 0, Math.PI * 2);
    else ctx.arc(22, 7, 6, 0.25 * Math.PI, 0.7 * Math.PI);
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Brass ear trumpet: narrow end at the ear, bell pointing at the orb
    if (state === 'listening' && move === 'trumpet' && pose.lift > 50) {
      const g = ctx.createLinearGradient(0, -20, 40, -36);
      g.addColorStop(0, '#b8862b');
      g.addColorStop(1, '#f7d98a');
      ctx.beginPath();
      ctx.moveTo(-2, -18);
      ctx.quadraticCurveTo(14, -22, 32, -44);
      ctx.lineTo(44, -26);
      ctx.quadraticCurveTo(20, -18, 0, -14);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#7a5418';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(38, -35, 4, 11, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = '#5a3c10';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    // extras
    if (dancing) {
      for (let i = 0; i < 3; i++) {
        const p = ((t / 1500) + i / 3) % 1;
        label(i % 2 ? '♫' : '♪', 120 + i * 16 + Math.sin(p * 6) * 4, 70 - p * 50, '#9fd8ff', 13 + p * 4, 1 - p);
      }
    } else if (state === 'listening' && move === 'trumpet') {
      label('eh?', 132, 34, '#f7d98a', 12);
    }
    const n = state === 'choosing' ? 3 : Math.round(voice * 4);
    for (let i = 0; i < n; i++) {
      const p = ((t / 1600) + i / Math.max(n, 1)) % 1;
      sparkle(30 + ((i * 53) % 110), 90 - p * 40 + (i % 2) * 20, 3 + (1 - Math.abs(p - 0.5) * 2) * 3, 1 - Math.abs(p - 0.5) * 2);
    }
  }

  // ================= TYPEWRITER (thinking) =================
  const QUIPS = ['DING!', 'So noted.', 'DING!', '*clack clack*', 'DING!', 'Objection!'];
  function drawTypewriter(t) {
    glowNow = 0.65 + Math.sin(t / 220) * 0.15;
    const LINE_MS = 2600;
    const lineT = t % LINE_MS;
    const lineNo = Math.floor(t / LINE_MS);
    const carriage = (lineT / LINE_MS) * 24;

    // desk
    ctx.fillStyle = '#6b4a30';
    ctx.strokeStyle = '#3a2716';
    ctx.lineWidth = 1.5;
    ctx.fillRect(112, 150, 88, 8);
    ctx.strokeRect(112, 150, 88, 8);
    ctx.fillRect(122, 158, 6, 28);
    ctx.fillRect(188, 158, 6, 28);
    groundShadow(80, 60);

    // typewriter: paper first (it rises out of the roller), then the machine
    const paperH = 22 + (lineNo % 6) * 5;
    const px = 146 - carriage;
    ctx.fillStyle = '#fdfbf3';
    ctx.strokeStyle = '#b9b29c';
    ctx.lineWidth = 1;
    ctx.fillRect(px, 120 - paperH, 34, paperH + 4);
    ctx.strokeRect(px, 120 - paperH, 34, paperH + 4);
    ctx.strokeStyle = '#8a8574';
    for (let i = 0; i < Math.min(lineNo % 6, 5) + 1; i++) {
      const y = 116 - i * 5;
      const w = i === 0 ? (lineT / LINE_MS) * 26 : 26 - ((i * 7) % 9);
      ctx.beginPath();
      ctx.moveTo(px + 4, y);
      ctx.lineTo(px + 4 + w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#1d212b';
    ctx.fillRect(136 - carriage, 118, 58, 7); // roller
    ctx.beginPath();
    ctx.arc(136 - carriage, 121.5, 4.5, 0, Math.PI * 2);
    ctx.arc(194 - carriage, 121.5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, 150);
    ctx.lineTo(198, 150);
    ctx.lineTo(192, 126);
    ctx.lineTo(134, 126);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, 126, 0, 150);
    body.addColorStop(0, '#3d4456');
    body.addColorStop(1, '#232733');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = '#11141b';
    ctx.stroke();

    // which keys are being hit right now
    const nearKey = Math.floor(t / 110) % 5;
    const farKey = (Math.floor(t / 135) + 2) % 5;
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 7; k++) {
        const kx = 140 + k * 7.5 + row * 2;
        const ky = 132 + row * 6;
        const pressed = row === 1 && (k === nearKey || k === farKey + 1);
        ctx.beginPath();
        ctx.arc(kx, ky + (pressed ? 1 : 0), 2.4, 0, Math.PI * 2);
        ctx.fillStyle = pressed ? '#8f9ab3' : '#e9e4d4';
        ctx.fill();
      }
    }

    // the bear, seated, leaning in over the keys
    const hit1 = Math.abs(Math.sin(t / 55));
    const hit2 = Math.abs(Math.cos(t / 62));
    const near = { x: 142 + nearKey * 7.5, y: 132 - hit1 * 6 };
    const farP = { x: 142 + (farKey + 1) * 7.5, y: 131 - hit2 * 6 };
    const head = { x: 100, y: 80 + Math.sin(t / 110) * 1.2 };

    group(() => {
      limb(84, 110, farP.x, farP.y, 7.5, true);
    });
    group(() => {
      oval(22, 172, 7, 6); // tail
      oval(54, 162, 34, 22); // seated haunch
      oval(92, 182, 16, 6); // back foot under the desk
      oval(74, 128, 26, 34, 0.2); // upright torso, leaning forward
      oval(88, 100, 15, 14, 0.5); // neck
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(0.14);
      oval(-11, -13, 5.5, 5.5, 0, FAR, FAR_EDGE);
      oval(-3, -16, 6, 6);
      oval(0, 0, 21, 17);
      oval(19, 6, 13, 8.5);
      ctx.restore();
      limb(88, 112, near.x, near.y, 8); // near arm, hammering keys
    });

    // face: focused eye, half-moon glasses, tongue out in concentration
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(0.14);
    ctx.beginPath();
    ctx.ellipse(30, 3, 4.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -3, 2.8, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, -8);
    ctx.lineTo(13, -9); // furrowed brow
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, 1, 5, 0, Math.PI); // half-moon lens
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,230,255,0.35)';
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(9, 1);
    ctx.lineTo(-10, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(24, 13, 2.6, 3.4 + Math.sin(t / 300) * 0.6, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8fa3';
    ctx.fill();

    // powdered barrister's wig: a curly cap and rolled curls hanging behind
    ctx.fillStyle = '#f4f1e8';
    ctx.strokeStyle = '#a8a190';
    ctx.lineWidth = 1;
    const curl = (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    for (let i = 0; i < 6; i++) curl(-16 + i * 6, -16 - Math.sin((i / 5) * Math.PI) * 4, 4.6);
    for (let i = 0; i < 4; i++) curl(-20 - (i % 2), -9 + i * 7, 4.4);
    curl(-14, -7, 4.2);
    ctx.restore();

    // letters flying off the keys, and a quip at each carriage return
    for (let i = 0; i < 4; i++) {
      const p = ((t / 650) + i / 4) % 1;
      const ch = 'QWERTYUIOP?!&§¶#'[(Math.floor(t / 650) + i * 5) % 16];
      label(ch, 148 + i * 9 + p * 8, 124 - p * 34, '#e8f1ff', 10, 1 - p);
    }
    if (lineT < 520) label(QUIPS[lineNo % QUIPS.length], 112, 40, lineNo % 2 ? '#ffd23f' : '#ffe9a8', 13);
  }

  // ================= loop: cross-fade between scenes =================
  const SCENES = { hammock: drawHammock, stand: drawStand, typewriter: drawTypewriter };
  const fade = { hammock: 1, stand: 0, typewriter: 0 };
  let smooth = 0;

  function frame(t) {
    const blob = window.blob || { state: 'idle', level: 0 };
    const state = blob.state;
    smooth += (blob.level - smooth) * 0.25;
    const voice = state === 'listening' ? Math.min(smooth * 6, 1) : 0;
    const want = state === 'idle' ? 'hammock' : state === 'thinking' ? 'typewriter' : 'stand';

    outCtx.clearRect(0, 0, W, H);
    for (const name of Object.keys(SCENES)) {
      fade[name] = lerp(fade[name], name === want ? 1 : 0, 0.12);
      if (fade[name] < 0.02) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      SCENES[name](t, state, voice);
      outCtx.globalAlpha = fade[name];
      outCtx.drawImage(buf, 0, 0);
    }
    outCtx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
