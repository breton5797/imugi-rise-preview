// Story cutscenes, drawn over the frozen scene (docs/STORY.md §5.1 and §5.3). Gameplay is paused
// while they play, so they may build a gradient or two per frame; everything that moves is a pure
// function of the cutscene clock, so a skipped or replayed frame never leaves state behind.
import { hsl } from './color.js';
import { GROUND } from './config.js';
import { drawUnit } from './sprites.js';

const TAU = Math.PI * 2;
const GOLD = [44, 100, 62];
const CINNABAR = [8, 90, 56];
const clamp01 = x => Math.max(0, Math.min(1, x));
const span = (t, a, b) => clamp01((t - a) / (b - a));
const ease = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
// A stable pseudo-random 0…1 per index, so particles keep their paths from frame to frame.
const rnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** The ending swaps the scene to the palace courtyard at this moment, under the brightest veil. */
export const ENDING_SWAP = 5;
const FLASH_AT = 1.9;

function sprite(ctx, unit, { x, y, s, rot = 0, flip = false, form, clock, glow = 18, alpha = 1 }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip ? -s : s, s);
  ctx.shadowColor = hsl(GOLD); ctx.shadowBlur = glow;
  drawUnit(ctx, unit, { flap: 0.35 + Math.sin(clock * 3) * 0.3, clock, form });
  ctx.restore();
}

function halo(ctx, x, y, r, col, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hsl(col, a));
  g.addColorStop(1, hsl(col, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Twelve golden beams fanning out from the centre, turning slowly.
function beams(ctx, x, y, len, turn, a) {
  if (a <= 0 || len <= 0) return;
  const g = ctx.createRadialGradient(x, y, 10, x, y, len);
  g.addColorStop(0, hsl([48, 100, 80], 0.7 * a));
  g.addColorStop(0.5, hsl(GOLD, 0.3 * a));
  g.addColorStop(1, hsl(GOLD, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const ang = turn + (i * TAU) / 12, w = 0.075;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang - w) * len, y + Math.sin(ang - w) * len);
    ctx.lineTo(x + Math.cos(ang + w) * len, y + Math.sin(ang + w) * len);
    ctx.closePath();
  }
  ctx.fill();
}

// Motes drawn in along a spiral toward the body, each on its own loop.
function spiral(ctx, x, y, t, a) {
  if (a <= 0) return;
  for (let i = 0; i < 72; i++) {
    const p = ((t - 0.6) / 0.85 + rnd(i)) % 1;
    const r = (50 + rnd(i + 99) * 230) * (1 - p) + 16, ang = rnd(i + 7) * TAU + p * 5;
    ctx.fillStyle = i % 3 ? hsl(GOLD, a * (0.3 + p * 0.7)) : `rgba(255,255,255,${a * p})`;
    const s = 1.5 + p * 2;
    ctx.fillRect(x + Math.cos(ang) * r - s / 2, y + Math.sin(ang) * r - s / 2, s, s);
  }
}

// Three shockwave rings and a spray of gold and cinnabar shards, launched by the flash.
function burst(ctx, x, y, t, LW) {
  for (let i = 0; i < 3; i++) {
    const k = span(t, 1.95 + i * 0.14, 2.7 + i * 0.14);
    if (k <= 0 || k >= 1) continue;
    ctx.strokeStyle = hsl([GOLD, CINNABAR, [48, 100, 92]][i], (1 - k) * 0.9);
    ctx.lineWidth = (6 - i * 1.5) * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(x, y, 30 + ease(k) * LW * 0.62, 0, TAU); ctx.stroke();
  }
  const k = span(t, FLASH_AT, FLASH_AT + 1);
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < 40; i++) {
    const ang = rnd(i + 40) * TAU, v = 160 + rnd(i + 80) * 260;
    const px = x + Math.cos(ang) * v * k, py = y + Math.sin(ang) * v * k + 160 * k * k;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(ang + k * 8 * (rnd(i) - 0.5));
    ctx.fillStyle = hsl(i % 2 ? GOLD : CINNABAR, 1 - k);
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -2.2); ctx.lineTo(6, 0); ctx.lineTo(0, 2.2); ctx.fill();
    ctx.restore();
  }
}

// §5.1: the imugi rises to the centre, gathers light, flashes white and comes out one form on.
function transform(ctx, v, LW, VH, h) {
  const { t, from, to } = v.cutscene, rm = v.reducedMotion, unit = v.unit;
  const cx = LW / 2 + 25, cy = VH * 0.55; // the head is the origin; the tail trails left
  const rise = ease(span(t, 0, 0.6));
  ctx.fillStyle = `rgba(6,4,16,${0.78 * rise})`;
  ctx.fillRect(0, 0, LW, VH);
  if (rm) {
    // Fades only: the old form gives way to the new one in place, under a still glow.
    const k = ease(span(t, 1.5, 2.4));
    halo(ctx, cx, cy, 170, GOLD, 0.35 * rise);
    sprite(ctx, unit, { x: cx, y: cy, s: 3, form: from, clock: 0.3, alpha: rise * (1 - k) });
    sprite(ctx, unit, { x: cx, y: cy, s: 3, form: to, clock: 0.3, alpha: k });
    return;
  }
  const shake = t > FLASH_AT && t < 2.35 ? (1 - span(t, FLASH_AT, 2.35)) * 7 : 0;
  ctx.save();
  ctx.translate((rnd(Math.floor(t * 60)) - 0.5) * shake, (rnd(Math.floor(t * 60) + 5) - 0.5) * shake);
  const x = h.start.x + (cx - h.start.x) * rise, y = h.start.y + (cy - h.start.y) * rise;
  const grow = ease(span(t, 0.6, 1.8)), fade = 1 - span(t, 2.2, 3);
  beams(ctx, x, y, 80 + grow * Math.max(LW, VH) * 0.7, t * 0.45, grow * fade);
  spiral(ctx, x, y, t, span(t, 0.6, 0.9) * (1 - span(t, 1.75, 1.9)));
  const after = t >= FLASH_AT, pulse = 0.5 + 0.5 * Math.sin(t * 14);
  const charge = span(t, 0.6, 1.8) * (after ? 0 : 1);
  halo(ctx, x, y, 90 + charge * 50, GOLD, (0.25 + charge * pulse * 0.4) * rise);
  if (after) halo(ctx, x, y, 210, [48, 100, 86], 0.5 * (1 - span(t, 2, 3.4)) + 0.18);
  const reveal = ease(span(t, 2, 3.2));
  const s = after ? 2.7 + reveal * 0.4 : 1 + 2 * rise + charge * pulse * 0.08;
  const rot = after ? -0.55 * (1 - reveal) : 0;
  sprite(ctx, unit, { x, y, s, rot, form: after ? to : from, clock: t, glow: 18 + charge * pulse * 30 });
  if (charge > 0) { // the body throbbing with light
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, unit, { x, y, s, form: from, clock: t, glow: 0, alpha: charge * pulse * 0.45 });
    ctx.restore();
  }
  burst(ctx, x, y, t, LW);
  ctx.restore();
  const flash = t < FLASH_AT ? span(t, 1.8, FLASH_AT) : 1 - span(t, FLASH_AT, 2.4);
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, LW, VH); }
}

// Where the rising dragon is at progress p (0…1) of its climb.
function climb(p, LW, VH, straight) {
  const y = VH * 0.86 - Math.pow(p, 1.25) * (VH * 0.86 + 220);
  const x = straight ? LW / 2 : LW / 2 + Math.sin(p * TAU * 1.25) * LW * 0.27 * (1 - p * 0.35);
  return { x, y };
}

// Light pouring through the opened gate of heaven, as a widening column from the top.
function heavenLight(ctx, LW, VH, t) {
  const open = ease(span(t, 0.2, 2)) * (1 - span(t, 4.4, 5.4));
  if (open <= 0) return;
  const w = LW * (0.12 + 0.55 * open), g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, hsl([48, 100, 94], 0.9 * open));
  g.addColorStop(0.7, hsl([46, 100, 80], 0.25 * open));
  g.addColorStop(1, hsl([46, 100, 80], 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(LW / 2 - w * 0.25, 0); ctx.lineTo(LW / 2 + w * 0.25, 0);
  ctx.lineTo(LW / 2 + w * 0.6, VH); ctx.lineTo(LW / 2 - w * 0.6, VH);
  ctx.fill();
  halo(ctx, LW / 2, -40, LW * 0.7, [48, 100, 96], 0.85 * open);
}

function rain(ctx, LW, VH, t, a) {
  if (a <= 0) return;
  ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (const [band, top, bot] of [[0.3, 0, VH * 0.3], [1, VH * 0.3, VH + 30]]) {
    ctx.strokeStyle = `hsla(205,60%,88%,${0.45 * a * band})`;
    ctx.beginPath();
    for (let i = 0; i < 130; i++) {
      const y = ((rnd(i + 3) * (VH + 60) + t * (620 + rnd(i) * 260)) % (VH + 60)) - 30;
      if (y < top || y >= bot) continue;
      const x = ((rnd(i + 11) * (LW + 80) - (y + 30) * 0.12) % (LW + 80) + LW + 80) % (LW + 80) - 40;
      ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 16);
    }
    ctx.stroke();
  }
}

// Rain rings on the wet courtyard stones.
function puddles(ctx, LW, VH, t, a) {
  if (a <= 0) return;
  ctx.fillStyle = `hsla(205,40%,70%,${0.1 * a})`;
  ctx.fillRect(0, GROUND, LW, VH - GROUND);
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const k = ((t + rnd(i + 50) * 0.8) % 0.8) / 0.8, depth = rnd(i + 60);
    const x = rnd(i + 70) * LW, y = GROUND + 8 + depth * (VH - GROUND - 16), r = (3 + k * 14) * (0.6 + depth * 0.7);
    ctx.strokeStyle = `hsla(200,60%,90%,${(1 - k) * 0.5 * a})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.3, 0, 0, TAU); ctx.stroke();
  }
}

// §5.3: heaven's light pours down, the dragon spirals up out of sight holding the pearl, then the
// screen brightens and rain falls on the palace courtyard.
function ending(ctx, v, LW, VH) {
  const t = v.cutscene.t, rm = v.reducedMotion;
  ctx.fillStyle = `rgba(8,6,18,${0.5 * ease(span(t, 0, 0.8)) * (1 - span(t, 4.4, ENDING_SWAP))})`;
  ctx.fillRect(0, 0, LW, VH);
  heavenLight(ctx, LW, VH, t);
  const p = span(t, 1.2, 5.3);
  if (p > 0 && p < 1) {
    const at = climb(p, LW, VH, rm), ahead = climb(Math.min(1, p + 0.01), LW, VH, rm);
    for (let i = 14; i >= 1; i--) { // a trail of sparks along the path just flown
      const q = p - i * 0.012;
      if (q <= 0) continue;
      const pt = climb(q, LW, VH, rm), r = 2.4 * (1 - i / 15) * (2.4 - q);
      ctx.fillStyle = hsl(i % 2 ? GOLD : [48, 100, 90], 0.8 * (1 - i / 15));
      ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
    }
    const dx = ahead.x - at.x, dy = ahead.y - at.y, flip = dx < 0;
    const rot = rm ? -1.1 : Math.atan2(dy, Math.abs(dx)) * (flip ? -1 : 1);
    halo(ctx, at.x, at.y, 110, [48, 100, 80], 0.45);
    sprite(ctx, v.unit, { x: at.x, y: at.y, s: 2.4 - p * 0.9, rot, flip: flip && !rm, form: 5, clock: t, glow: 26, alpha: span(t, 1.2, 1.7) });
  }
  const veil = t < ENDING_SWAP ? 0.9 * ease(span(t, 4.3, ENDING_SWAP)) : 0.22 + 0.68 * (1 - ease(span(t, ENDING_SWAP, 6.3)));
  if (veil > 0) { ctx.fillStyle = `hsla(48,60%,94%,${veil})`; ctx.fillRect(0, 0, LW, VH); }
  if (t >= ENDING_SWAP) {
    const wet = ease(span(t, ENDING_SWAP, 6));
    puddles(ctx, LW, VH, t, wet);
    rain(ctx, LW, VH, t, wet);
  }
}

/**
 * Draw the active cutscene over the scene. Coordinates are logical (LW x VH).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ cutscene: { kind: 'transform' | 'ending', t: number, from?: number, to?: number }, unit: object, reducedMotion?: boolean }} v
 * @param {{ start: { x: number, y: number } }} helpers  start is where the player was on screen
 */
export function drawCutscene(ctx, v, LW, VH, helpers) {
  const cut = v.cutscene;
  if (!cut) return;
  ctx.save();
  if (cut.kind === 'transform') transform(ctx, v, LW, VH, helpers);
  else if (cut.kind === 'ending') ending(ctx, v, LW, VH);
  ctx.restore();
}
