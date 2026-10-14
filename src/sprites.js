// Every picture in the game is drawn here, in code: the six spirits, Gangcheori, goblin fire,
// yeopjeon and the charms. All sprites are drawn around the origin, facing right.
import { hsl } from './color.js';

const TAU = Math.PI * 2;
const GOLD = [44, 96, 60];
const RED = [4, 82, 52];
const INK = [230, 30, 8];

const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const oval = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); };

function eye(ctx, x, y, r = 2) {
  ctx.fillStyle = '#fff'; oval(ctx, x, y, r * 1.9, r * 1.4, 0.2);
  ctx.fillStyle = hsl(INK); dot(ctx, x + r * 0.6, y, r * 0.8);
}

function wing(ctx, flap, col, len = 26) {
  const wy = -4 - flap * 14;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-3, -2); ctx.quadraticCurveTo(-len * 0.65, wy - 5, -len, wy); ctx.quadraticCurveTo(-13, 3, -3, 5);
  ctx.fill();
}

function beak(ctx, x, y, len, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x, y - 2.6); ctx.lineTo(x + len, y + 0.6); ctx.lineTo(x, y + 2.8); ctx.fill();
}

// A plump bird body shared by the feathered spirits.
function plump(ctx, body, belly) {
  const grad = ctx.createLinearGradient(-14, -12, 14, 12);
  grad.addColorStop(0, hsl(body, 1, 14));
  grad.addColorStop(1, hsl(body, 1, -10));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(15, 0); ctx.quadraticCurveTo(6, -13, -9, -10); ctx.quadraticCurveTo(-17, 0, -9, 10); ctx.quadraticCurveTo(6, 13, 15, 0);
  ctx.fill();
  if (belly) { ctx.fillStyle = hsl(belly); oval(ctx, 2, 5, 8, 4.5, -0.15); }
}

// How strongly the scales shine gold at each imugi form (docs/STORY.md §3). The body itself stays
// jade until the dragon: a hue fade from jade to gold would pass through lime green.
const GILD = [0, 0, 0, 0.6, 0.85, 0.5];
const segX = i => -i * 5.6;
const segR = i => 8.6 - i * 0.82;

// Two small legs (near and far) hanging under a body segment, each ending in three claws.
function legs(ctx, x, y, col, clock, ph) {
  const kick = Math.sin(clock * 7 + ph) * 1.5;
  ctx.lineCap = 'round';
  for (const [dx, dl] of [[2.5, -14], [-1, 0]]) {
    const fx = x + dx - 4 + kick, fy = y + 12;
    ctx.strokeStyle = hsl(col, 1, dl - 6); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x + dx, y + 4); ctx.quadraticCurveTo(x + dx + 2, y + 9, fx, fy); ctx.stroke();
    ctx.strokeStyle = hsl([40, 40, 90], 1, dl); ctx.lineWidth = 1;
    ctx.beginPath();
    for (const a of [-0.5, 0.4, 1.3]) { ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * 3.4, fy + 1 + Math.sin(a) * 2.6); }
    ctx.stroke();
  }
}

// A flame-like tuft of mane swept back from the top of a segment.
function maneTuft(ctx, x, y, r, len) {
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.75);
  ctx.quadraticCurveTo(x - r * 0.2, y - r - len * 0.9, x - r * 0.4 - len * 0.7, y - r - len * 0.55);
  ctx.quadraticCurveTo(x - r * 0.3, y - r * 0.9, x - r * 0.6, y - r * 0.5);
  ctx.fill();
}

// The yeouiju pearl held under the chin.
function chinPearl(ctx, clock) {
  ctx.save();
  ctx.shadowColor = 'hsl(160,100%,70%)'; ctx.shadowBlur = 10 + Math.sin(clock * 5) * 4;
  ctx.fillStyle = 'hsl(166,80%,78%)'; dot(ctx, 9.5, 12.5, 4);
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; dot(ctx, 8.3, 11.2, 1.3);
  ctx.restore();
}

// Imugi: a serpent whose tail ripples behind the head. Its form (0…5) adds, in order, antler
// horns, whiskers and a red mane, four clawed legs with gilding scales, the yeouiju pearl and a
// faint glow, and finally the whole golden dragon.
function imugi(ctx, o) {
  const f = o.form, body = f >= 5 ? GOLD : o.body;
  const ys = [0];
  for (let i = 1; i <= 8; i++) ys[i] = Math.sin(o.clock * 9 - i * 0.75) * (1.5 + i * 0.55) - o.flap * i * 0.5;
  if (f >= 4) {
    ctx.fillStyle = hsl(GOLD, f >= 5 ? 0.2 : 0.13);
    oval(ctx, -16, ys[3] * 0.6, 34, 15);
  }
  if (f >= 3) { legs(ctx, segX(2), ys[2], body, o.clock, 0); legs(ctx, segX(6), ys[6], body, o.clock, 2); }
  if (f >= 5) { // a flame of mane at the tail tip
    ctx.fillStyle = hsl(RED, 0.95);
    maneTuft(ctx, segX(8) + 2, ys[8] + 6, 3, 9);
  }
  for (let i = 8; i >= 1; i--) {
    const x = segX(i), y = ys[i], r = segR(i);
    ctx.fillStyle = hsl(body, 1, -i * 1.6);
    dot(ctx, x, y, r);
    if (f >= 2) { ctx.fillStyle = hsl(RED, 0.92, f >= 5 ? 4 : 0); maneTuft(ctx, x, y, r, (f >= 5 ? 9 : 6) - i * 0.4); }
  }
  if (f >= 3) { // scales: small arcs catching the light
    ctx.strokeStyle = hsl(GOLD, GILD[f], 14); ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 1; i <= 7; i++) { const x = segX(i), y = ys[i], r = segR(i) * 0.55; ctx.moveTo(x + r, y + 1); ctx.arc(x, y + 1, r, 0, Math.PI, true); }
    ctx.stroke();
  }
  if (f >= 2) { ctx.fillStyle = hsl(RED, 0.92); maneTuft(ctx, -5, -2, 8, f >= 5 ? 10 : 7); }
  const head = ctx.createLinearGradient(-8, -10, 12, 10);
  head.addColorStop(0, hsl(body, 1, 16));
  head.addColorStop(1, hsl(body, 1, -8));
  ctx.fillStyle = head; oval(ctx, 3, 0, 11.5, 9.5);
  oval(ctx, 12, 2.5, 6.5, 5);
  ctx.fillStyle = hsl(f >= 5 ? [28, 100, 78] : f >= 3 ? [48, 70, 80] : [70, 50, 78], 0.9); oval(ctx, 5, 5.5, 8, 3, -0.1);
  eye(ctx, 7, -3, 2.1);
  if (f === 0) { ctx.fillStyle = hsl(o.wing); dot(ctx, 0, -9, 2.2); return; }
  // antlers: two branching horns, longer and with an extra tine on the dragon
  const big = f >= 5 ? 1.3 : 1;
  ctx.strokeStyle = hsl(f >= 5 ? [44, 80, 84] : [36, 70, 82]); ctx.lineWidth = f >= 5 ? 2.4 : 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1, -8); ctx.lineTo(1 - 6 * big, -8 - 11 * big); ctx.moveTo(1 - 3 * big, -8 - 6 * big); ctx.lineTo(1 - 10 * big, -8 - 7 * big);
  ctx.moveTo(6, -8); ctx.lineTo(6 - 2 * big, -8 - 10 * big);
  if (f >= 5) { ctx.moveTo(-3.5, -18); ctx.lineTo(-1, -23); ctx.moveTo(5, -15); ctx.lineTo(9, -19); }
  ctx.stroke();
  if (f >= 2) {
    const reach = f >= 5 ? 1.35 : 1;
    ctx.strokeStyle = f >= 5 ? hsl(RED, 0.95) : hsl([40, 60, 82], 0.9); ctx.lineWidth = f >= 5 ? 1.5 : 1.1;
    ctx.beginPath(); ctx.moveTo(16, 3); ctx.quadraticCurveTo(16 + 8 * reach, 6 + Math.sin(o.clock * 6) * 3, 16 + 11 * reach, 0);
    ctx.moveTo(15, 5); ctx.quadraticCurveTo(15 + 6 * reach, 13, 15 + 11 * reach, 11 + Math.sin(o.clock * 6 + 1) * 3); ctx.stroke();
  }
  if (f >= 4) chinPearl(ctx, o.clock);
}

// Each spirit's awakening light (HSL), and the tint of its awakened look (docs/STORY.md §6).
export const AWAKEN_COLORS = Object.freeze({
  imugi: [44, 96, 60], kkachi: [205, 85, 82], sotdae: [44, 90, 60], jebi: [48, 30, 96], hak: [176, 70, 64], haechi: [12, 92, 58],
});
// Obangsaek, the five cardinal colours, for the sacred pole's cloth strips. Black is lifted a
// little so it still reads against the night sky.
const OBANG = [[212, 74, 52], [4, 80, 52], [48, 94, 58], [0, 0, 96], [230, 24, 22]];

// A four-pointed star.
function sparkle(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, d = k % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.fill();
}

// A five-petal gourd flower (bakkkot).
function blossom(ctx, x, y, r) {
  ctx.fillStyle = hsl([60, 30, 97]);
  for (let k = 0; k < 5; k++) dot(ctx, x + Math.cos(k * 1.2566 - 1.57) * r, y + Math.sin(k * 1.2566 - 1.57) * r, r * 0.68);
  ctx.fillStyle = hsl([70, 70, 62]); dot(ctx, x, y, r * 0.42);
}

// A tongue of flame rising from (x, y) and bending back by `lean`.
function flame(ctx, x, y, r, len, lean) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.quadraticCurveTo(x + r * 0.5, y - len * 0.55, x - lean, y - len);
  ctx.quadraticCurveTo(x - r * 1.3, y - len * 0.35, x - r, y);
  ctx.arc(x, y, r, Math.PI, 0, true);
  ctx.fill();
}

function kkachi(ctx, o) {
  const star = AWAKEN_COLORS.kkachi;
  if (o.ascended) { // the Milky Way bridge: stars streaming off the tail
    for (let i = 0; i < 6; i++) {
      const tw = 0.6 + 0.4 * Math.sin(o.clock * 9 + i * 2.1);
      ctx.fillStyle = hsl(star, tw * (1 - i * 0.12), 10);
      sparkle(ctx, -36 - i * 5.5, -3.5 - o.flap * 2 + Math.sin(o.clock * 5 - i * 0.9) * 2.6, (4.2 - i * 0.4) * (0.75 + 0.25 * tw));
    }
  }
  ctx.fillStyle = hsl(o.body);
  ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-33, -7 - o.flap * 4); ctx.lineTo(-33, 0); ctx.lineTo(-9, 5); ctx.fill();
  plump(ctx, o.body, o.wing);
  wing(ctx, o.flap, hsl([212, 70, 36]), 24);
  if (o.ascended) { // glowing wing tip
    const wy = -4 - o.flap * 14, a = Math.atan2(wy + 2, -21);
    ctx.fillStyle = hsl(star, 1, 6); oval(ctx, -20, wy + 0.4, 4.6, 1.5, a);
    ctx.fillStyle = '#fff'; dot(ctx, -22.5, wy, 1);
  }
  ctx.fillStyle = hsl(o.wing); oval(ctx, -9, -1 - o.flap * 5, 5, 2.4, -0.4);
  beak(ctx, 13, -1, 8, hsl(INK, 1, 10));
  eye(ctx, 7, -4);
}

function sotdae(ctx, o) {
  const up = o.ascended, gilt = AWAKEN_COLORS.sotdae, wood = up ? [36, 64, 48] : o.body;
  ctx.strokeStyle = up ? hsl(gilt, 1, -16) : hsl(o.body, 1, -16); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-1, 9); ctx.lineTo(-3, 22); ctx.stroke();
  if (up) { // five cloth strips tied to the pole, fluttering back
    ctx.lineWidth = 1.7;
    OBANG.forEach((c, i) => {
      const w = Math.sin(o.clock * 10 - i * 0.9) * 1.6, y = 13 + i * 2, x = -1.3 - (y - 9) * 0.15;
      ctx.strokeStyle = hsl(c);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 5, y + w, x - 9 - i * 0.4, y + 1.5 - w); ctx.stroke();
    });
  }
  plump(ctx, wood, null);
  ctx.strokeStyle = up ? hsl(gilt, 1, 10) : hsl(o.body, 0.7, -20); ctx.lineWidth = up ? 1.3 : 1;
  ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, -6, 9, -2); ctx.moveTo(-11, 3); ctx.quadraticCurveTo(0, -1, 10, 3); ctx.stroke();
  wing(ctx, o.flap * 0.7, hsl(o.wing), 20);
  ctx.fillStyle = hsl(wood, 1, 8); oval(ctx, 11, -7, 6, 5);
  beak(ctx, 15, -6, 9, hsl(o.wing, 1, 8));
  ctx.fillStyle = hsl(INK); dot(ctx, 12, -8, 1.3);
}

function jebi(ctx, o) {
  ctx.fillStyle = hsl(o.body);
  ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-34, -11 - o.flap * 3); ctx.lineTo(-20, 0); ctx.lineTo(-34, 11 + o.flap * 3); ctx.lineTo(-8, 4); ctx.fill();
  plump(ctx, o.body, [40, 40, 92]);
  wing(ctx, o.flap, hsl(o.body, 1, 8), 30);
  if (o.ascended) { const wy = -4 - o.flap * 14; blossom(ctx, -15, wy * 0.5, 2.3); blossom(ctx, -23, wy * 0.76, 1.8); }
  ctx.fillStyle = hsl(o.wing); oval(ctx, 9, 3, 4, 2.6);
  beak(ctx, 14, -1, 6, hsl(INK, 1, 6));
  if (o.ascended) { // the golden gourd seed in the beak
    ctx.fillStyle = hsl(GOLD); oval(ctx, 20.5, 0.6, 3, 1.9, 0.35);
    ctx.fillStyle = hsl(GOLD, 1, 28); dot(ctx, 19.6, -0.1, 0.8);
  }
  eye(ctx, 7, -4, 1.8);
}

function hak(ctx, o) {
  const up = o.ascended, body = up ? [184, 48, 84] : o.body;
  if (up) { // the blue crane rides a trail of cloud
    for (let i = 0; i < 4; i++) {
      const k = (o.clock * 0.9 + i / 4) % 1, r = 4.6 - k * 2.6;
      const x = -22 - k * 28, y = 5 + Math.sin(o.clock * 3 + i * 1.7) * 2 + k * 2;
      ctx.fillStyle = hsl([186, 60, 96], 0.9 - k * 0.45);
      dot(ctx, x, y, r); dot(ctx, x - r * 0.9, y + r * 0.3, r * 0.75); dot(ctx, x + r * 0.7, y - r * 0.55, r * 0.6);
    }
  }
  ctx.strokeStyle = hsl(INK, 1, 14); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-30, 12); ctx.moveTo(-8, 8); ctx.lineTo(-29, 16); ctx.stroke();
  plump(ctx, body, null);
  wing(ctx, o.flap, hsl(body, 1, -6), 32);
  ctx.fillStyle = hsl(INK, 1, 8);
  ctx.beginPath(); ctx.moveTo(-18, -4 - o.flap * 12); ctx.lineTo(-32, -4 - o.flap * 14); ctx.lineTo(-24, 2 - o.flap * 8); ctx.fill();
  ctx.strokeStyle = hsl(body); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(10, -2); ctx.quadraticCurveTo(18, -8, 21, -15); ctx.stroke();
  ctx.fillStyle = hsl(body); oval(ctx, 22, -17, 5, 4);
  ctx.fillStyle = hsl(o.wing); oval(ctx, 21, -20.5, 3.4, 1.8);
  beak(ctx, 26, -17, 11, hsl([40, 30, 30]));
  ctx.fillStyle = hsl(INK); dot(ctx, 23.5, -17.5, 1.1);
}

function haechi(ctx, o) {
  const up = o.ascended;
  ctx.fillStyle = up ? hsl([18, 96, 50]) : hsl(o.wing);
  for (let i = 0; i < 4; i++) dot(ctx, -12 + Math.cos(i * 1.4) * 3, -6 + i * 4, 4.2);
  if (up) { // the mane burns: flickering tongues of flame, embers drifting off
    for (let i = 0; i < 4; i++) {
      const x = -12 + Math.cos(i * 1.4) * 3, y = -6 + i * 4;
      const len = 9 - i + Math.sin(o.clock * 13 + i * 1.9) * 2.5, lean = 4 + Math.sin(o.clock * 9 + i) * 1.6;
      ctx.fillStyle = hsl([8, 94, 52]); flame(ctx, x, y, 4, len, lean);
      ctx.fillStyle = hsl([42, 100, 64]); flame(ctx, x, y + 1, 2.2, len * 0.6, lean * 0.7);
    }
    for (let i = 0; i < 3; i++) {
      const k = (o.clock * 1.3 + i / 3) % 1;
      ctx.fillStyle = hsl([32, 100, 66], 1 - k);
      dot(ctx, -15 - k * 10 + Math.sin(o.clock * 7 + i * 2) * 1.5, -10 - k * 14, 1.4 - k * 0.6);
    }
  }
  plump(ctx, o.body, null);
  ctx.strokeStyle = hsl(o.body, 0.8, 20); ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 6, 2, 3.4, Math.PI, TAU); ctx.stroke(); }
  wing(ctx, o.flap, hsl(o.wing, 0.9), 20);
  ctx.fillStyle = hsl(o.body, 1, 6); oval(ctx, 9, -3, 8, 7.5);
  ctx.fillStyle = up ? hsl([48, 100, 86]) : hsl([36, 60, 88]);
  ctx.beginPath(); ctx.moveTo(8, -9); ctx.lineTo(11, -21); ctx.lineTo(13, -9);
  if (up) { // the horn shines: a pulsing rim of light
    ctx.strokeStyle = hsl([44, 100, 62], 0.55 + 0.3 * Math.sin(o.clock * 6)); ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.closePath(); ctx.stroke();
  }
  ctx.fill();
  ctx.fillStyle = hsl(GOLD); dot(ctx, 2, 9, 2.6);
  ctx.fillStyle = hsl(INK); dot(ctx, 16.5, -1, 1.5);
  eye(ctx, 10, -4, 2);
}

const UNIT_ART = { imugi, kkachi, sotdae, jebi, hak, haechi };

/**
 * @param {CanvasRenderingContext2D} ctx translated (and rotated) to the unit's centre
 * @param {{ id: string, body: number[], wing: number[] }} unit
 * @param {{ flap?: number, clock?: number, ascended?: boolean, form?: number }} pose  form 0…5 is
 *   the imugi's look; without one, an ascended imugi draws as the dragon. Any other spirit draws
 *   its awakened look (docs/STORY.md §6) when ascended.
 */
export function drawUnit(ctx, unit, { flap = 0, clock = 0, ascended = false, form } = {}) {
  const f = Math.max(0, Math.min(5, Math.floor(form ?? (ascended ? 5 : 0)))) || 0;
  (UNIT_ART[unit.id] || imugi)(ctx, { body: unit.body, wing: unit.wing, flap, clock, ascended, form: f });
}

/** Gangcheori's head and coiling body. `charge` 0…1 is the fire building in its mouth. */
export function drawBoss(ctx, { clock, charge, hurt, hpFrac }) {
  const iron = hurt ? [0, 0, 92] : [352, 26, 22 + (1 - hpFrac) * 6];
  for (let i = 9; i >= 1; i--) {
    const x = i * 13, y = Math.sin(clock * 3.2 + i * 0.7) * (5 + i * 2.2);
    ctx.fillStyle = hsl(iron, 1, -i * 0.8); dot(ctx, x, y, 25 - i * 1.9);
    ctx.fillStyle = hsl([18, 96, 54], 0.75);
    ctx.beginPath(); ctx.moveTo(x - 6, y - 20 + i * 1.7); ctx.lineTo(x + 2, y - 33 + i * 2.4); ctx.lineTo(x + 7, y - 19 + i * 1.7); ctx.fill();
  }
  ctx.shadowColor = hsl([14, 100, 55]); ctx.shadowBlur = 14 + charge * 26;
  ctx.fillStyle = hsl(iron, 1, 6); oval(ctx, 0, 0, 34, 28);
  ctx.shadowBlur = 0;
  ctx.fillStyle = hsl(iron, 1, 10); oval(ctx, -22, 8, 20, 14);
  ctx.strokeStyle = hsl([30, 30, 78]); ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, -24); ctx.lineTo(22, -46); ctx.moveTo(15, -36); ctx.lineTo(30, -36);
  ctx.moveTo(-6, -25); ctx.lineTo(-2, -44); ctx.stroke();
  ctx.fillStyle = hsl([14, 100, 50 + charge * 30]); oval(ctx, -30, 14, 8 + charge * 6, 4 + charge * 5);
  ctx.fillStyle = hsl([48, 100, 62]); oval(ctx, -8, -8, 8, 5.5, 0.3);
  ctx.fillStyle = hsl(INK); oval(ctx, -9.5, -8, 2.4, 5, 0.1);
  ctx.strokeStyle = hsl([14, 90, 60], 0.85); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-34, 4); ctx.quadraticCurveTo(-52, -4 + Math.sin(clock * 5) * 6, -60, 6);
  ctx.moveTo(-36, 10); ctx.quadraticCurveTo(-50, 22, -58, 18 + Math.sin(clock * 5 + 1) * 6); ctx.stroke();
}

/** Goblin fire: a blue will-o'-the-wisp. */
export function drawWisp(ctx, clock, phase) {
  const flick = Math.sin(clock * 11 + phase) * 2.2, pulse = 0.6 + 0.4 * Math.sin(clock * 7 + phase);
  ctx.shadowColor = 'hsl(196,100%,62%)'; ctx.shadowBlur = 18 * pulse;
  ctx.fillStyle = 'hsla(204,100%,60%,.9)';
  ctx.beginPath(); ctx.moveTo(0, -22 - flick); ctx.quadraticCurveTo(14, -4, 10, 6); ctx.arc(0, 6, 10, 0, Math.PI); ctx.quadraticCurveTo(-14, -4, 0, -22 - flick); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'hsla(176,100%,88%,.95)';
  ctx.beginPath(); ctx.moveTo(0, -10 - flick * 0.5); ctx.quadraticCurveTo(7, 0, 5, 6); ctx.arc(0, 6, 5, 0, Math.PI); ctx.quadraticCurveTo(-7, 0, 0, -10 - flick * 0.5); ctx.fill();
  ctx.fillStyle = hsl(INK); dot(ctx, -2.4, 5, 1.2); dot(ctx, 2.4, 5, 1.2);
}

/** How wide a spinning coin looks, 0.25…1 of its height. */
export const coinSquash = spin => Math.abs(Math.cos(spin)) * 0.75 + 0.25;

/** Yeopjeon: a brass coin with a square hole. */
export function drawCoin(ctx, spin) {
  drawCoinFace(ctx, coinSquash(spin));
}

export function drawCoinFace(ctx, squash) {
  ctx.shadowColor = 'hsl(44,100%,58%)'; ctx.shadowBlur = 12;
  ctx.fillStyle = 'hsl(42,92%,58%)'; oval(ctx, 0, 0, 8.5 * squash, 8.5);
  ctx.shadowBlur = 0; ctx.strokeStyle = 'hsl(36,80%,34%)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.6 * squash, 6.6, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'hsl(250,40%,12%)'; ctx.fillRect(-2.4 * squash, -2.4, 4.8 * squash, 4.8);
}

export function drawPearl(ctx, clock) {
  const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
  ctx.shadowColor = 'hsl(160,100%,70%)'; ctx.shadowBlur = 16 + pulse * 14;
  const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 14);
  g.addColorStop(0, '#fff'); g.addColorStop(0.5, 'hsl(160,90%,74%)'); g.addColorStop(1, 'hsl(196,90%,50%)');
  ctx.fillStyle = g; dot(ctx, 0, 0, 13);
  ctx.shadowBlur = 0; ctx.strokeStyle = `hsla(48,100%,70%,${0.4 + pulse * 0.4})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 18 + pulse * 3, 0, TAU); ctx.stroke();
}

export function drawFire(ctx, clock) {
  ctx.shadowColor = 'hsl(18,100%,56%)'; ctx.shadowBlur = 18;
  ctx.fillStyle = 'hsl(14,100%,54%)';
  ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, -12, 26 + Math.sin(clock * 30) * 5, 0); ctx.quadraticCurveTo(0, 12, -11, 0); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = 'hsl(48,100%,74%)'; oval(ctx, -3, 0, 6, 4.4);
}

// --- Scenery painters. The renderer paints these once into cached layers, never per frame.

/** A seokdeung (stone lantern) with a lit window; its finial sits at (cx, y). 40 x 64. */
export function paintLantern(lc, cx, y, glow) {
  lc.fillStyle = hsl([190, 12, 34]);
  lc.beginPath(); lc.moveTo(cx - 17, y + 15); lc.lineTo(cx - 8, y + 4); lc.lineTo(cx + 8, y + 4); lc.lineTo(cx + 17, y + 15); lc.fill();
  dot(lc, cx, y + 3, 3);
  lc.fillRect(cx - 10, y + 15, 20, 18);
  lc.fillRect(cx - 13, y + 33, 26, 5);
  lc.fillRect(cx - 4, y + 38, 8, 20);
  lc.fillRect(cx - 10, y + 58, 20, 6);
  lc.shadowColor = hsl(glow); lc.shadowBlur = 14; lc.fillStyle = hsl(glow, 1, 14);
  lc.fillRect(cx - 5, y + 19, 10, 10);
}

/** A seamless tile w wide of soft mist blobs ({ x, rx, ry, dy }) around y = 40. */
export function paintMist(lc, blobs, col, w) {
  for (const b of blobs) {
    for (const dx of [-w, 0, w]) {
      const g = lc.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, hsl(col, 0.4)); g.addColorStop(1, hsl(col, 0));
      lc.save(); lc.translate(b.x + dx, 40 + b.dy); lc.scale(b.rx, b.ry);
      lc.fillStyle = g; lc.fillRect(-1, -1, 2, 2);
      lc.restore();
    }
  }
}

/**
 * A seamless tile w x h of cloud billows ({ x, r, dy }) heaped on the line y = base, solid below,
 * lit from above: a shadowed outline, a lighter body and soft highlights near the tops.
 */
export function paintClouds(lc, puffs, col, dl, w, h, base) {
  for (const [shade, a, grow, lift] of [[-6, 1, 1, 0], [1, 1, 0.8, 0.26], [7, 0.55, 0.46, 0.56]]) {
    lc.fillStyle = hsl(col, a, dl + shade);
    for (const p of puffs) for (const dx of [-w, 0, w]) dot(lc, p.x + dx - p.r * lift * 0.3, base + p.dy - p.r * lift, p.r * grow);
    if (shade < 0) lc.fillRect(0, base, w, h - base);
  }
}

/** Hallasan: a broad shield volcano with the flat crater rim of Baengnokdam. w x h. */
export function paintHalla(lc, col, rim, w, h) {
  lc.fillStyle = hsl(col);
  lc.beginPath(); lc.moveTo(0, h);
  lc.bezierCurveTo(170, h - 14, 250, 74, 318, 46);
  lc.lineTo(338, 40); lc.quadraticCurveTo(370, 50, 402, 40); lc.lineTo(424, 46);
  lc.bezierCurveTo(500, 76, 600, h - 22, w, h);
  lc.fill();
  lc.fillStyle = hsl(col, 1, -4);
  for (const [x, cw, ch] of [[120, 120, 40], [560, 150, 52]]) { // oreum: small side cones
    lc.beginPath(); lc.moveTo(x, h); lc.quadraticCurveTo(x + cw / 2, h - ch * 2, x + cw, h); lc.fill();
  }
  lc.strokeStyle = hsl(rim, 0.35); lc.lineWidth = 2;
  lc.beginPath(); lc.moveTo(262, 76); lc.bezierCurveTo(286, 60, 300, 52, 318, 46); lc.lineTo(338, 40);
  lc.quadraticCurveTo(370, 50, 402, 40); lc.lineTo(424, 46); lc.bezierCurveTo(446, 54, 462, 62, 478, 76); lc.stroke();
}

/** Cheonmun, the gate of heaven: a two-storey gate with light behind it, 420 x 300 before scaling. */
export function paintCheonmun(lc, sil) {
  const glow = lc.createRadialGradient(210, 180, 10, 210, 180, 210);
  glow.addColorStop(0, 'hsla(48,100%,97%,.9)');
  glow.addColorStop(0.35, 'hsla(46,100%,86%,.4)');
  glow.addColorStop(1, 'hsla(46,100%,80%,0)');
  lc.fillStyle = glow; lc.fillRect(0, 0, 420, 300);
  lc.fillStyle = sil;
  lc.fillRect(40, 272, 340, 28); lc.fillRect(62, 254, 296, 18);
  for (const x of [96, 150, 256, 310]) lc.fillRect(x, 124, 14, 130);
  lc.fillRect(84, 112, 252, 14);
  lc.beginPath();
  lc.moveTo(36, 108); lc.quadraticCurveTo(60, 106, 82, 88); lc.lineTo(338, 88); lc.quadraticCurveTo(360, 106, 384, 108);
  lc.quadraticCurveTo(364, 116, 350, 116); lc.lineTo(70, 116); lc.quadraticCurveTo(56, 116, 36, 108);
  lc.fill();
  lc.fillRect(130, 60, 160, 30);
  lc.beginPath();
  lc.moveTo(96, 64); lc.quadraticCurveTo(118, 62, 136, 42); lc.lineTo(284, 42); lc.quadraticCurveTo(302, 62, 324, 64);
  lc.quadraticCurveTo(306, 70, 296, 70); lc.lineTo(124, 70); lc.quadraticCurveTo(114, 70, 96, 64);
  lc.fill();
  lc.fillRect(140, 36, 140, 6);
  lc.fillStyle = 'hsla(44,90%,64%,.9)'; lc.fillRect(196, 66, 28, 16);
}

const CHARMS = {
  // bujeok: a yellow paper talisman with red brushwork
  shield(ctx) {
    ctx.fillStyle = 'hsl(48,92%,62%)'; ctx.fillRect(-8, -13, 16, 26);
    ctx.strokeStyle = 'hsl(4,84%,46%)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.moveTo(0, -8); ctx.lineTo(0, 8);
    ctx.moveTo(-4, -1); ctx.lineTo(4, 3); ctx.moveTo(4, -1); ctx.lineTo(-4, 3); ctx.stroke();
  },
  // norigae: a knot with a tassel
  magnet(ctx) {
    ctx.strokeStyle = 'hsl(4,84%,56%)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -8, 5, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'hsl(150,70%,48%)'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(6, 3); ctx.lineTo(0, 9); ctx.lineTo(-6, 3); ctx.fill();
    ctx.strokeStyle = 'hsl(44,96%,60%)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 1.6, 9); ctx.lineTo(i * 2.4, 16); } ctx.stroke();
  },
  // moonlight: a crescent
  slow(ctx) {
    ctx.fillStyle = 'hsl(52,100%,84%)';
    ctx.beginPath(); ctx.arc(0, 0, 11, 1.1, -1.1); ctx.arc(6, 0, 9.85, -1.674, 1.674, true); ctx.fill();
  },
  // bokjumeoni: a lucky pouch
  double(ctx) {
    ctx.fillStyle = 'hsl(4,80%,52%)';
    ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(-15, 12, 0, 12); ctx.quadraticCurveTo(15, 12, 6, -7); ctx.fill();
    ctx.fillStyle = 'hsl(44,96%,60%)'; ctx.fillRect(-7, -9, 14, 3.4);
    ctx.fillStyle = 'hsl(150,70%,48%)'; ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(0, -15); ctx.lineTo(7, -9); ctx.fill();
  },
};

export const POWER_COLORS = Object.freeze({
  shield: [48, 92, 62], magnet: [150, 70, 52], slow: [52, 100, 80], double: [4, 80, 58], pearl: [160, 90, 70],
});

/** Draw a charm pickup by kind: shield | magnet | slow | double | pearl. */
export function drawCharm(ctx, kind, clock) {
  if (kind === 'pearl') { drawPearl(ctx, clock); return; }
  const col = POWER_COLORS[kind];
  ctx.shadowColor = hsl(col); ctx.shadowBlur = 16;
  ctx.fillStyle = hsl(col, 0.16); dot(ctx, 0, 0, 18);
  ctx.shadowBlur = 0; ctx.strokeStyle = hsl(col, 0.8); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 18, clock * 2, clock * 2 + 4.6); ctx.stroke();
  CHARMS[kind](ctx);
}
