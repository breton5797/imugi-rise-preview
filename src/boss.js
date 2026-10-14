// Gangcheori, the drought dragon: pure helpers for the boss arena. The arena is a stretch of
// open sky between two gates; the fight itself is stepped by sim.js.
import { BOSS, GROUND, STORY } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Gates between arenas for a mode; the tutorial never meets the boss. */
export function bossEvery(mode) {
  if (mode === 'tutorial') return Infinity;
  if (mode === 'story') return STORY.gates;
  return mode === 'trial' ? BOSS.trialEvery : BOSS.every;
}

/** True when open sky (the arena) lies in front of the gate with this index. */
export const isArenaGate = (index, mode) => index > 0 && index % bossEvery(mode) === 0;

export const shotInterval = tier => Math.max(BOSS.shotMin, BOSS.shotEvery - tier * 0.15);

export const bossLane = y => clamp(y, 90, GROUND - 90);

/**
 * @param {() => number} rng side stream, never the course rng
 * @param {{ wx: number, w: number }} prev gate before the arena
 * @param {{ wx: number }} gate gate after the arena
 * @param {number} tier how many arenas came before this one
 * @param {number} hp the boss's health: there is always one pearl more than hits needed
 */
export function makeArena(rng, prev, gate, tier, hp = BOSS.hp) {
  const start = prev.wx + prev.w + 160;
  const end = gate.wx - 260;
  const count = Math.max(BOSS.pearls.length, hp + 1);
  const spots = count === BOSS.pearls.length ? BOSS.pearls
    : Array.from({ length: count }, (_, i) => BOSS.pearls[0] + (i * (BOSS.pearls[BOSS.pearls.length - 1] - BOSS.pearls[0])) / (count - 1));
  const pearls = spots.map(f => ({
    wx: start + (end - start) * f, y: 150 + rng() * 280, k: 'pearl', t: 0, gate: null,
  }));
  return { start, end, tier, pearls };
}

export function spawnBoss(arena, birdY, hp = BOSS.hp) {
  return {
    end: arena.end, tier: arena.tier, hp, maxHp: hp, y: bossLane(birdY), lead: BOSS.enterLead,
    hurtT: 0, fireT: shotInterval(arena.tier),
  };
}
