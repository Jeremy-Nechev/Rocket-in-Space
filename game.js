/* Rocket in Space — a modern port of the Trinket.io turtle game.
   World coordinates match the original: centred origin, x right, y up, edges at +/-400. */

'use strict';

// ---------------------------------------------------------------------------
// Tuning. The values marked "original" are lifted straight from the turtle
// version, so the flight feel is preserved.
// ---------------------------------------------------------------------------
const CFG = {
  BOUND: 400,          // original: off-screen past +/-400
  THRUST: 0.075,         // original: velocity added per thrust frame
  TURN_DEG: 4,         // original turned 10 deg per keypress; 4 deg/frame while
                       // held is the same feel at a steady 60 Hz
  COIN_DRIFT: 1,       // original: coinx / coiny
  HOLE_DRIFT: 2,       // original: blackholex / blackholey
  COIN_HIT: 40,        // original: abs(dx) < 40 and abs(dy) < 40
  HOLE_HIT: 50,        // original: abs(dx) < 50 and abs(dy) < 50
  WIN_SCORE: 20,
  COIN_POINTS: 3,
  HOLE_POINTS: -5,
  EDGE_POINTS: -2,
  STOP_POINTS: -1,
  STEP: 1000 / 60      // fixed simulation step
};

// Optional art. Everything is drawn with canvas vectors by default, so no image
// files are needed. To use your own sprites, drop them in beside index.html and
// fill in the filenames below; anything left empty keeps the vector version.
const ASSETS = {
  ship: '',   // e.g. 'rocketship.png'  — 48px, nose pointing right
  coin: '',   // e.g. 'coin1.png'       — 36px
  hole: '',   // e.g. 'blackhole.png'   — 100px
  bg: ''      // e.g. 'space.jpg'       — square, 800x800 or larger
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const SIZE = 800;

const el = {
  score: document.getElementById('score'),
  time: document.getElementById('time'),
  best: document.getElementById('best'),
  bar: document.getElementById('bar'),
  log: document.getElementById('log'),
  flash: document.getElementById('flash'),
  intro: document.getElementById('overlay'),
  pause: document.getElementById('pauseOverlay'),
  win: document.getElementById('winOverlay'),
  mute: document.getElementById('mute'),
  winTitle: document.getElementById('winTitle'),
  winStats: document.getElementById('winStats'),
  winNote: document.getElementById('winNote')
};

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = SIZE * dpr;
  cv.height = SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
addEventListener('resize', fitCanvas);

const img = {};
for (const [key, src] of Object.entries(ASSETS)) {
  if (!src) continue;
  const i = new Image();
  i.onload = () => { img[key] = i; };
  i.src = src;
}

const rand = (a, b) => a + Math.random() * (b - a);
const toScreen = (x, y) => [SIZE / 2 + x, SIZE / 2 - y];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = 'intro';   // intro | playing | paused | over
let ship, coin, hole, score, elapsed, particles, pops, shake, acc, last;

function spawn() {
  return { x: rand(-CFG.BOUND, CFG.BOUND), y: rand(-CFG.BOUND, CFG.BOUND) };
}

function reset() {
  ship = { x: 0, y: 0, vx: 0, vy: 0, heading: 90, thrusting: false };
  coin = Object.assign(spawn(), { vx: CFG.COIN_DRIFT, vy: CFG.COIN_DRIFT, spin: 0 });
  hole = Object.assign(spawn(), { vx: CFG.HOLE_DRIFT, vy: CFG.HOLE_DRIFT, spin: 0 });
  score = 0;
  elapsed = 0;
  particles = [];
  pops = [];
  shake = 0;
  acc = 0;
  last = 0;
  paintHud(0);
  el.log.innerHTML = 'Thrust with <b>W</b>. Remember: nothing slows you down out here.';
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
const CODES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyS: 'stop', ArrowDown: 'stop'
};

addEventListener('keydown', e => {
  Sound.unlock();   // audio can only start from a real interaction
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyR') { startGame(); return; }
  if (e.code === 'Space' || e.code === 'Enter') {
    if (state === 'intro' || state === 'over') { startGame(); e.preventDefault(); }
    return;
  }
  const act = CODES[e.code];
  if (!act) return;
  e.preventDefault();
  if (act === 'stop') { if (!keys.has('stop')) fullStop(); }
  keys.add(act);
});

addEventListener('keyup', e => {
  const act = CODES[e.code];
  if (act) keys.delete(act);
});

// leaving the tab: drop the keys and kill the engine loop, or it keeps roaring
// in the background while requestAnimationFrame is parked
addEventListener('blur', () => { keys.clear(); Sound.thrust(false); });
addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); Sound.thrust(false); }
  Sound.music(!document.hidden);
});

// Touch: left third turns left, right third turns right, middle thrusts.
const touches = new Map();
function zoneOf(clientX) {
  const r = cv.getBoundingClientRect();
  const t = (clientX - r.left) / r.width;
  return t < 0.33 ? 'left' : t > 0.67 ? 'right' : 'up';
}
cv.addEventListener('pointerdown', e => {
  Sound.unlock();
  if (state === 'intro' || state === 'over') return;
  cv.setPointerCapture(e.pointerId);
  const z = zoneOf(e.clientX);
  touches.set(e.pointerId, z);
  keys.add(z);
});
function endTouch(e) {
  const z = touches.get(e.pointerId);
  if (!z) return;
  touches.delete(e.pointerId);
  if (![...touches.values()].includes(z)) keys.delete(z);
}
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);

document.getElementById('start').onclick = startGame;
document.getElementById('again').onclick = startGame;
document.getElementById('resume').onclick = togglePause;
el.mute.onclick = toggleMute;

function toggleMute() {
  Sound.unlock();
  paintMute(Sound.toggleMute());
}

function paintMute(m) {
  el.mute.textContent = m ? '\u{1F507}' : '\u{1F50A}';
  el.mute.classList.toggle('off', m);
  el.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------
function addScore(n, message, x = ship.x, y = ship.y) {
  score += n;
  paintHud(n);
  pop(n, x, y);
  el.log.innerHTML = message;
  el.flash.className = n > 0 ? 'good' : 'bad';
  setTimeout(() => { el.flash.className = ''; }, 260);
}

// A floating "+3" / "-2" that rises from where the points changed. Kept a little
// way inside the arena so a hit on the very edge is still readable.
function pop(n, x, y) {
  const m = CFG.BOUND - 46;
  pops.push({
    text: (n > 0 ? '+' : '−') + Math.abs(n),
    color: n > 0 ? '#ffd257' : '#ff6b7f',
    x: Math.max(-m, Math.min(m, x)),
    y: Math.max(-m, Math.min(m, y)) + 38,   // above the rocket
    life: 0,
    span: 78
  });
}

function paintHud(delta) {
  el.score.textContent = score;
  el.bar.style.width = Math.max(0, Math.min(100, (score / CFG.WIN_SCORE) * 100)) + '%';
  if (delta) {
    el.score.className = 'value pop ' + (delta > 0 ? 'up' : 'down');
    setTimeout(() => { el.score.className = 'value'; }, 260);
  }
}

function fullStop() {
  if (state !== 'playing') return;
  ship.vx = 0;
  ship.vy = 0;
  for (let i = 0; i < 18; i++) puff(ship.x, ship.y, rand(0, 360), 2.5, '#9fc0ff');
  addScore(CFG.STOP_POINTS, 'Retro-burn completed, stopped, <span class="bad">&minus;1</span>.');
}

// ---------------------------------------------------------------------------
// Simulation — one fixed step
// ---------------------------------------------------------------------------
function step() {
  // rotation (original: turtle.left(+/-10))
  if (keys.has('left')) ship.heading += CFG.TURN_DEG;
  if (keys.has('right')) ship.heading -= CFG.TURN_DEG;

  // thrust (original: updatevelocity)
  ship.thrusting = keys.has('up');
  Sound.thrust(ship.thrusting);
  if (ship.thrusting) {
    const a = ship.heading * Math.PI / 180;
    ship.vx += Math.cos(a) * CFG.THRUST;
    ship.vy += Math.sin(a) * CFG.THRUST;
    if (Math.random() < 0.9) {
      puff(ship.x - Math.cos(a) * 20, ship.y - Math.sin(a) * 20,
           ship.heading + 180 + rand(-22, 22), rand(1.5, 3.6), '#ffb347');
    }
  }

  ship.x += ship.vx;
  ship.y += ship.vy;

  drift(coin);
  drift(hole);
  coin.spin += 0.06;
  hole.spin += 0.02;

  // off the edge (original: -2 and recentre)
  if (Math.abs(ship.x) > CFG.BOUND || Math.abs(ship.y) > CFG.BOUND) {
    const hitX = ship.x, hitY = ship.y;   // mark the exit point, not the respawn
    ship.x = 0; ship.y = 0; ship.vx = 0; ship.vy = 0;
    shake = 10;
    Sound.bong();
    addScore(CFG.EDGE_POINTS, 'Lost to the void. Towed back to the center of space, <span class="bad">&minus;2</span>.',
             hitX, hitY);
  }

  // coin pickup — also relocates the black hole, as in the original
  if (Math.abs(coin.x - ship.x) < CFG.COIN_HIT && Math.abs(coin.y - ship.y) < CFG.COIN_HIT) {
    for (let i = 0; i < 26; i++) puff(coin.x, coin.y, rand(0, 360), rand(1, 4.5), '#ffd257');
    Object.assign(coin, spawn());
    Object.assign(hole, spawn());
    Sound.coin();
    addScore(CFG.COIN_POINTS, 'Coin collected, <span class="good">+3</span>.');
  }

  // black hole
  if (Math.abs(hole.x - ship.x) < CFG.HOLE_HIT && Math.abs(hole.y - ship.y) < CFG.HOLE_HIT) {
    for (let i = 0; i < 30; i++) puff(hole.x, hole.y, rand(0, 360), rand(1, 5), '#c07bff');
    Object.assign(hole, spawn());
    shake = 16;
    Sound.woosh();
    addScore(CFG.HOLE_POINTS, 'Swallowed. <span class="bad">&minus;5</span>.');
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= 1;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.y += 0.65;
    if (++p.life >= p.span) pops.splice(i, 1);
  }
  if (shake > 0) shake *= 0.88;

  if (score >= CFG.WIN_SCORE) finish();
}

// bounce off the walls (original flipped the drift sign past +/-400)
function drift(o) {
  if (o.x > CFG.BOUND || o.x < -CFG.BOUND) o.vx *= -1;
  if (o.y > CFG.BOUND || o.y < -CFG.BOUND) o.vy *= -1;
  o.x += o.vx;
  o.y += o.vy;
}

function puff(x, y, deg, speed, color) {
  const a = deg * Math.PI / 180;
  particles.push({
    x, y, color,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    life: rand(16, 34),
    max: 34
  });
}

// ---------------------------------------------------------------------------
// Background — drawn once, then blitted
// ---------------------------------------------------------------------------
const bg = document.createElement('canvas');
bg.width = bg.height = SIZE;
const stars = [];
(function paintBackground() {
  const b = bg.getContext('2d');
  b.fillStyle = '#05060f';
  b.fillRect(0, 0, SIZE, SIZE);

  const clouds = [
    [180, 140, 300, 'rgba(96,60,190,0.30)'],
    [640, 690, 340, 'rgba(20,120,170,0.24)'],
    [700, 180, 220, 'rgba(180,60,140,0.16)']
  ];
  for (const [x, y, r, c] of clouds) {
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'transparent');
    b.fillStyle = g;
    b.fillRect(0, 0, SIZE, SIZE);
  }

  for (let i = 0; i < 420; i++) {
    const x = rand(0, SIZE), y = rand(0, SIZE), r = rand(0.3, 1.5);
    b.globalAlpha = rand(0.25, 0.9);
    b.fillStyle = Math.random() < 0.12 ? '#9fc4ff' : '#ffffff';
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  }
  b.globalAlpha = 1;

  for (let i = 0; i < 40; i++) {
    stars.push({ x: rand(0, SIZE), y: rand(0, SIZE), r: rand(0.8, 2), phase: rand(0, 6.28) });
  }
})();

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function draw(t) {
  ctx.save();
  if (shake > 0.5) ctx.translate(rand(-shake, shake), rand(-shake, shake));

  if (img.bg) ctx.drawImage(img.bg, 0, 0, SIZE, SIZE);
  else ctx.drawImage(bg, 0, 0);

  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t / 900 + s.phase));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // arena edge — the line that costs you 2 points
  ctx.strokeStyle = 'rgba(255,107,127,0.22)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);
  ctx.setLineDash([]);

  for (const p of particles) {
    const [px, py] = toScreen(p.x, p.y);
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(px, py, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawHole(t);
  drawCoin(t);
  drawVelocity();
  drawShip();
  drawPops();

  ctx.restore();
}

function drawPops() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const p of pops) {
    const k = p.life / p.span;
    const [px, py] = toScreen(p.x, p.y);
    // quick scale-up on arrival, then fade over the last third
    const grow = k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : 1.1 - Math.min(0.1, (k - 0.12) * 0.3);
    ctx.globalAlpha = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(grow, grow);
    ctx.font = '700 27px ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(4,6,16,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHole(t) {
  const [x, y] = toScreen(hole.x, hole.y);
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, 62);
  halo.addColorStop(0, 'rgba(190,120,255,0.55)');
  halo.addColorStop(0.5, 'rgba(120,80,220,0.22)');
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fill();

  if (img.hole) {
    ctx.drawImage(img.hole, -50, -50, 100, 100);
    ctx.restore();
    return;
  }

  // accretion disk: a few tilted, rotating arcs
  ctx.rotate(hole.spin);
  ctx.scale(1, 0.42);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 30 + i * 8, i * 1.6, i * 1.6 + 4.4);
    ctx.strokeStyle = ['rgba(255,190,120,0.85)', 'rgba(200,130,255,0.6)', 'rgba(120,190,255,0.45)'][i];
    ctx.lineWidth = 5 - i;
    ctx.stroke();
  }
  ctx.restore();

  // event horizon, drawn unskewed on top of the disk
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,180,0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function drawCoin(t) {
  const [x, y] = toScreen(coin.x, coin.y);
  const w = Math.abs(Math.cos(coin.spin));       // spinning-disc foreshortening
  ctx.save();
  ctx.translate(x, y);

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
  glow.addColorStop(0, 'rgba(255,210,87,0.45)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();

  if (img.coin) {
    ctx.drawImage(img.coin, -18, -18, 36, 36);
    ctx.restore();
    return;
  }

  ctx.scale(Math.max(0.3, w), 1);   // never fully edge-on, so it stays findable
  const face = ctx.createLinearGradient(-16, -16, 16, 16);
  face.addColorStop(0, '#fff2bd');
  face.addColorStop(0.5, '#ffd257');
  face.addColorStop(1, '#c9902a');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,10,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Velocity vector: points where the rocket is actually drifting, not where it is
// aimed, and its length scales with speed. The two often disagree — that is the
// whole game.
function drawVelocity() {
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed < 0.3) return;

  // Accelerating straight from the centre, the rocket reaches roughly
  // sqrt(2 * THRUST * BOUND) before it runs out of arena, so scale against that.
  const top = Math.sqrt(2 * CFG.THRUST * CFG.BOUND);
  const len = Math.min(118, 12 + (speed / top) * 100);
  const heat = Math.min(1, speed / top);                 // calm blue -> hot red
  const color = `hsl(${200 - heat * 190}, 100%, ${64 + heat * 6}%)`;
  const [x, y] = toScreen(ship.x, ship.y);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-ship.vy, ship.vx));   // screen y is flipped
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;

  const head = 9 + heat * 4;
  ctx.beginPath();
  ctx.moveTo(24, 0);                            // start clear of the hull
  ctx.lineTo(24 + len - head, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(24 + len, 0);
  ctx.lineTo(24 + len - head, -head * 0.62);
  ctx.lineTo(24 + len - head, head * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawShip() {
  const [x, y] = toScreen(ship.x, ship.y);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-ship.heading * Math.PI / 180);   // screen y is flipped

  if (ship.thrusting) {
    const len = 16 + Math.random() * 14;
    const fl = ctx.createLinearGradient(-14, 0, -14 - len, 0);
    fl.addColorStop(0, 'rgba(255,240,180,0.95)');
    fl.addColorStop(0.5, 'rgba(255,150,60,0.7)');
    fl.addColorStop(1, 'transparent');
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.moveTo(-13, -7);
    ctx.lineTo(-13 - len, 0);
    ctx.lineTo(-13, 7);
    ctx.closePath();
    ctx.fill();
  }

  if (img.ship) {
    ctx.drawImage(img.ship, -24, -24, 48, 48);
    ctx.restore();
    return;
  }

  // fins
  ctx.fillStyle = '#e05a6a';
  ctx.beginPath();
  ctx.moveTo(-10, -8); ctx.lineTo(-20, -16); ctx.lineTo(-14, -6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 8); ctx.lineTo(-20, 16); ctx.lineTo(-14, 6); ctx.closePath();
  ctx.fill();

  // hull
  const hull = ctx.createLinearGradient(0, -9, 0, 9);
  hull.addColorStop(0, '#ffffff');
  hull.addColorStop(0.55, '#cdd6f2');
  hull.addColorStop(1, '#8f9ab8');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.quadraticCurveTo(6, -9, -14, -8);
  ctx.lineTo(-14, 8);
  ctx.quadraticCurveTo(6, 9, 22, 0);
  ctx.closePath();
  ctx.fill();

  // window
  ctx.fillStyle = '#4ec3ff';
  ctx.beginPath();
  ctx.arc(6, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
function frame(now) {
  if (state === 'playing') {
    if (!last) last = now;
    const dt = Math.min(now - last, 200);   // don't fast-forward a hidden tab
    last = now;
    elapsed += dt;
    acc += dt;
    while (acc >= CFG.STEP && state === 'playing') {
      step();
      acc -= CFG.STEP;
    }
    el.time.textContent = (elapsed / 1000).toFixed(1) + 's';
  } else {
    last = 0;
    Sound.thrust(false);   // covers pause, win and the intro screen
  }
  draw(now);
  requestAnimationFrame(frame);
}

function startGame() {
  Sound.unlock();
  reset();
  state = 'playing';
  el.intro.classList.add('hidden');
  el.pause.classList.add('hidden');
  el.win.classList.add('hidden');
  cv.focus();
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    keys.clear();
    el.pause.classList.remove('hidden');
  } else if (state === 'paused') {
    state = 'playing';
    el.pause.classList.add('hidden');
  }
}

function finish() {
  state = 'over';
  const secs = elapsed / 1000;
  const best = parseFloat(localStorage.getItem('rocket.best') || '0');
  const isBest = !best || secs < best;
  if (isBest) localStorage.setItem('rocket.best', secs.toFixed(1));

  el.winTitle.textContent = 'Score is above 20. You win!';
  el.winStats.innerHTML = `Final score <b>${score}</b> in <b>${secs.toFixed(1)}s</b>`;
  el.winNote.textContent = isBest ? 'New personal best.' : `Your best is ${best.toFixed(1)}s.`;
  el.win.classList.remove('hidden');
  showBest();
}

function showBest() {
  const best = localStorage.getItem('rocket.best');
  el.best.textContent = best ? `best ${best}s` : 'best —';
}

paintMute(Sound.muted);
showBest();
reset();
state = 'intro';
requestAnimationFrame(frame);
