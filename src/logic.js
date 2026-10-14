// Pure rules: course generation, difficulty curve, judging, scoring. No state, no DOM.
import { DRONE, GATE, GROUND, PHYS, POWER_KINDS, RANKS, ZONES } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const difficulty = (index, ramp = GATE.rampGates) => clamp(index / ramp, 0, 1);
export const zoneOf = passed => Math.floor(passed / GATE.gatesPerZone) % ZONES.length;
export const loopOf = passed => Math.floor(passed / (GATE.gatesPerZone * ZONES.length));
export const spacingAt = index => 250 - difficulty(index, GATE.speedRamp) * 30;

export function speedAt(passed) {
  const loopBonus = Math.min(loopOf(passed), PHYS.maxLoopBonus) * PHYS.loopSpeed;
  return PHYS.baseSpeed + difficulty(passed, GATE.speedRamp) * PHYS.speedGain + loopBonus;
}

function pickType(rng, index, d) {
  if (index <= 3) return 'static';
  const r = rng();
  if (r < GATE.moveBase + d * GATE.moveGain) return 'move';
  if (r < GATE.pulseBase + d * GATE.pulseGain) return 'pulse';
  return 'static';
}

// prev is the previously generated gate (or null). The order of rng() calls is part of the
// daily-course contract: changing it changes every daily seed. `lead` is extra open sky
// before this gate (the boss arena); `shift` starts the shape curve that many gates in
// (later story nights).
export function makeGate(rng, index, prev, lead = 0, shift = 0) {
  const d = difficulty(index + shift);
  const gap = GATE.gapMax - d * GATE.gapShrink + (rng() * 14 - 7);
  const type = pickType(rng, index, d);
  const amp = type === 'move' ? GATE.ampBase + d * GATE.ampGain : 0;
  const margin = 70 + amp + gap / 2;
  const prevBase = prev ? prev.base : 300;
  const maxJump = GATE.jumpBase + d * GATE.jumpGain;
  const rolled = margin + rng() * (GROUND - 2 * margin);
  const base = clamp(clamp(rolled, prevBase - maxJump, prevBase + maxJump), margin, GROUND - margin);
  const wx = prev ? prev.wx + spacingAt(index) + lead : GATE.firstX;
  return { index, wx, w: GATE.w, base, gap, type, amp, ph: rng() * 6.28, scored: false, dashed: false, minClear: Infinity };
}

export const gateCenter = (g, t) => g.base + (g.type === 'move' ? Math.sin(t * 1.7 + g.ph) * g.amp : 0);
export const gateGap = (g, t) => g.gap + (g.type === 'pulse' ? Math.sin(t * 2.3 + g.ph) * GATE.pulseAmp : 0);

// Arc of orbs leading into a gate.
export function makeOrbs(rng, gate) {
  if (gate.index === 0) return [];
  const n = 3 + Math.floor(rng() * 3);
  // Start clear of the previous gate's column, which closes in as spacing tightens.
  const sx = Math.max(gate.wx - 170, gate.wx - spacingAt(gate.index) + gate.w + 24);
  return Array.from({ length: n }, (_, i) => ({
    wx: sx + i * 28,
    y: gate.base - Math.sin((i / (n - 1)) * Math.PI) * 26,
    k: 'orb',
    t: rng() * 6,
    gate: null,
  }));
}

// Power-up sitting in the middle of a gate gap.
export function makePower(rng, gate) {
  const roll = rng();
  const kind = POWER_KINDS[Math.floor(rng() * POWER_KINDS.length)];
  if (gate.index <= 2 || roll >= 0.14) return null;
  return { wx: gate.wx + gate.w / 2, y: gate.base, k: kind, t: 0, gate };
}

// Patrol drone hovering in the open stretch before a gate.
export function makeDrone(rng, gate, prev) {
  const roll = rng();
  const baseRoll = rng();
  const ampRoll = rng();
  const ph = rng() * 6.28;
  if (!prev || gate.index < DRONE.fromGate || roll >= 0.16 + difficulty(gate.index) * 0.16) return null;
  // Patrol beside the straight line between the two gaps, never across it: a clean line is
  // always open, a sloppy one is punished.
  const amp = 30 + ampRoll * 34;
  const line = (prev.base + gate.base) / 2;
  const offset = DRONE.lineGap + amp;
  const fits = y => y >= 80 + amp && y <= GROUND - 80 - amp;
  const first = baseRoll < 0.5 ? -1 : 1;
  const side = [first, -first].find(s => fits(line + s * offset));
  if (!side) return null;
  return { wx: (prev.wx + prev.w + gate.wx) / 2, base: line + side * offset, amp, freq: 1.5, ph, dead: false };
}

export const droneY = (dr, t) => dr.base + Math.sin(t * dr.freq + dr.ph) * dr.amp;

export function judgePass({ dashed, minClear }, perfectPx = GATE.perfectPx) {
  if (dashed) return 'phase';
  if (minClear < perfectPx && minClear > -5) return 'perfect';
  return 'normal';
}

export const multiplier = ({ fever, double }) => 1 + (fever ? 1 : 0) + (double ? 1 : 0);

// combo is the combo count *after* this pass was applied.
export function passPoints(kind, combo) {
  if (kind === 'perfect') return 1 + combo;
  if (kind === 'phase') return 2;
  return 1;
}

export const rankOf = score => RANKS.find(([, min]) => score >= min)[0];

// Clearance to the nearer wall edge; negative means the bird overlaps a wall.
export const clearance = (y, r, top, bot) => Math.min(y - r - top, bot - (y + r));
