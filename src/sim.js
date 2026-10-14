// Headless game simulation. Deterministic for a given seed + input sequence at a fixed step,
// which is what makes the daily course identical for everyone and lets tests fly a bot through it.
// The run state is mutated in place by step(): it is a hot loop running 120 times a second.
import { bossEvery, bossLane, isArenaGate, makeArena, shotInterval, spawnBoss } from './boss.js';
import { BOSS, DEFAULT_UNIT, DRONE, FEVER, GATE, GROUND, METER, PHYS, POWER, POWER_KINDS, REVIVE, STORY, UNITS } from './config.js';
import {
  clearance, droneY, gateCenter, gateGap, judgePass, makeDrone, makeGate, makeOrbs, makePower,
  multiplier, passPoints, speedAt, zoneOf, loopOf,
} from './logic.js';
import { mulberry32 } from './rng.js';

const R = PHYS.birdR;

const SIDE_SALT = 0x9e3779b9;
const GIFT_SALT = 0x85ebca6b;
const unitById = id => UNITS.find(u => u.id === id) || UNITS.find(u => u.id === DEFAULT_UNIT);

/**
 * @param {{ seed: number, mode?: 'classic' | 'daily' | 'trial' | 'tutorial' | 'story', unit?: string, night?: number }} opts
 */
export function createGame({ seed, mode = 'classic', unit = DEFAULT_UNIT, night = 1 }) {
  const def = unitById(unit);
  const story = mode === 'story' ? STORY.nights.find(n => n.n === night) || STORY.nights[0] : null;
  const g = {
    mode, seed, rng: mulberry32(seed), phase: 'play', t: 0, dist: 0, deadT: 0, timeScale: 1,
    // Arenas and unit gifts each roll on their own stream, never the course rng: the daily
    // course, pearls included, is the same for every unit.
    sideRng: mulberry32((seed ^ SIDE_SALT) >>> 0), giftRng: mulberry32((seed ^ GIFT_SALT) >>> 0), unit: def.id, trait: def.trait, safe: mode === 'tutorial',
    arenas: [], arenaCount: 0, boss: null, shots: [], bossHits: 0, bossKills: 0, ascended: false, pearls: 0,
    gliding: false, fireWard: 0,
    night: story ? story.n : 0, diffShift: story ? story.diffShift : 0,
    bossHp: story ? story.bossHp : BOSS.hp, tierBase: story ? story.tier : 0,
    bird: { y: PHYS.startY, vy: 0, rot: 0, wing: 0 },
    gates: [], orbs: [], drones: [], events: [], lastGate: null, spawned: 0,
    score: 0, passed: 0, combo: 0, maxCombo: 0, perfects: 0, orbCount: 0, dashGates: 0, droneKills: 0,
    dashMeter: 0, dashT: 0, invuln: 0, shield: false, magnetT: 0, slowT: 0, doubleT: 0, feverT: 0,
    revived: false,
  };
  g.shield = Boolean(def.trait.startShield);
  ensureSpawn(g);
  return g;
}

const emit = (g, type, data) => g.events.push({ type, ...data });
// A trait as it stands now: an awakened spirit's `awake` values replace the base ones.
const trait = (g, key) => (g.ascended && g.trait.awake && key in g.trait.awake ? g.trait.awake[key] : g.trait[key]);
const mult = g => multiplier({ fever: g.feverT > 0, double: g.doubleT > 0 });
const overlapsX = (g, o) => g.dist + R > o.wx && g.dist - R < o.wx + o.w;
const inGateColumn = g => g.gates.some(gt => overlapsX(g, gt));

function ensureSpawn(g) {
  while (!g.lastGate || g.lastGate.wx < g.dist + GATE.spawnAhead) {
    const prev = g.lastGate;
    const arena = isArenaGate(g.spawned, g.mode);
    const open = BOSS.arena + Math.max(0, g.bossHp - BOSS.hp) * BOSS.arenaPerHp;
    const gate = makeGate(g.rng, g.spawned, prev, arena ? open : 0, g.diffShift);
    g.gates.push(gate);
    g.orbs.push(...makeOrbs(g.rng, gate));
    const power = makePower(g.rng, gate);
    if (power) g.orbs.push(power);
    const drone = makeDrone(g.rng, gate, prev);
    if (drone && !arena) g.drones.push(drone);
    if (arena) {
      const made = makeArena(g.sideRng, prev, gate, g.tierBase + g.arenaCount++, g.bossHp);
      g.arenas.push(made);
      g.orbs.push(...made.pearls);
    }
    g.lastGate = gate;
    g.spawned++;
  }
}

function cull(g) {
  const edge = g.dist - GATE.cullBehind;
  if (g.gates.length && g.gates[0].wx < edge) g.gates = g.gates.filter(o => o.wx >= edge);
  if (g.orbs.some(o => o.got || o.wx < edge)) g.orbs = g.orbs.filter(o => !o.got && o.wx >= edge);
  if (g.drones.some(o => o.dead || o.wx < edge)) g.drones = g.drones.filter(o => !o.dead && o.wx >= edge);
}

function applyInput(g, input) {
  if (input.dash && g.dashMeter >= 1 && g.dashT <= 0) {
    g.dashMeter = 0;
    g.dashT = PHYS.dashTime;
    g.bird.vy = 0;
    emit(g, 'dash');
  }
  if (input.flap && g.dashT <= 0) {
    g.bird.vy = PHYS.flapVy * (g.trait.flap || 1);
    g.bird.wing = 1;
    emit(g, 'flap');
  }
}

// Dash and invulnerability never run out while the bird is inside a gate column,
// so neither can strand the player inside a wall.
function holdInColumn(g, value) {
  return value <= 0 && inGateColumn(g) ? 0.001 : Math.max(0, value);
}

function tickTimers(g, dt, rdt) {
  if (g.dashT > 0) {
    g.dashT = holdInColumn(g, g.dashT - dt);
    if (g.dashT === 0) g.invuln = Math.max(g.invuln, 0.15);
  }
  if (g.invuln > 0) g.invuln = holdInColumn(g, g.invuln - dt);
  g.magnetT = Math.max(0, g.magnetT - dt);
  g.doubleT = Math.max(0, g.doubleT - dt);
  g.slowT = Math.max(0, g.slowT - rdt);
  if (g.feverT > 0) {
    g.feverT = Math.max(0, g.feverT - dt);
    if (g.feverT === 0) emit(g, 'feverEnd');
  }
}

function breakShield(g) {
  g.shield = false;
  g.invuln = 1.1;
  emit(g, 'shieldBreak');
}

function kill(g) {
  g.phase = 'dying';
  g.deadT = 0;
  emit(g, 'die');
}

// Returns false when the hit was fatal. The tutorial only bumps.
function takeHit(g) {
  if (g.invuln > 0) return true;
  if (g.safe) { g.invuln = 1; emit(g, 'bump'); return true; }
  if (g.shield) { breakShield(g); return true; }
  kill(g);
  return false;
}

function moveBird(g, dt, input) {
  const b = g.bird;
  const dashing = g.dashT > 0;
  const tr = g.trait;
  // A gliding crane (hold) falls no faster than its glide speed.
  g.gliding = Boolean(input.hold && tr.glideVy);
  const maxVy = g.gliding ? tr.glideVy : PHYS.maxVy * (tr.maxVy || 1);
  if (dashing) b.vy *= 0.85; else b.vy = Math.min(b.vy + PHYS.gravity * (trait(g, 'gravity') || 1) * dt, maxVy);
  b.y += b.vy * dt;
  const lean = dashing ? 0 : Math.max(-0.55, Math.min(1.3, b.vy / 560));
  b.rot += (lean - b.rot) * Math.min(1, dt * 10);
  b.wing = Math.max(0, b.wing - dt * 5);
  if (b.y < R) { b.y = R; b.vy = Math.max(0, b.vy); }
  if (b.y <= GROUND - R) return true;
  b.y = GROUND - R;
  if (g.invuln > 0 || g.shield || g.safe) {
    if (g.invuln <= 0 && g.shield) breakShield(g);
    b.vy = -520;
    return true;
  }
  kill(g);
  return false;
}

function addMeter(g, amount) {
  g.dashMeter = Math.min(1, g.dashMeter + amount * (g.ascended ? g.trait.ascendMeter || 1 : 1));
}

// What each spirit gains the moment it awakens.
function onAwaken(g) {
  const awake = g.trait.awake || {};
  if (awake.shieldNow) g.shield = true;
  if (awake.fireWard) g.fireWard = awake.fireWard;
}

// Every point goes through here so the imugi's ascension cannot be missed.
function addScore(g, pts) {
  g.score += pts;
  if (g.trait.ascendScore && !g.ascended && g.score >= g.trait.ascendScore) {
    g.ascended = true;
    onAwaken(g);
    emit(g, 'ascend', { unit: g.unit });
  }
}

function applyPower(g, kind) {
  if (kind === 'shield') g.shield = true;
  else if (kind === 'magnet') g.magnetT = POWER.magnet;
  else if (kind === 'slow') g.slowT = POWER.slow;
  else if (kind === 'double') g.doubleT = POWER.double;
  else if (kind === 'pearl') { g.dashMeter = 1; g.pearls++; }
}

// Unit gifts tied to the gate count: the swallow's gourd seed, the haechi's regrown horn.
function unitGifts(g) {
  const giftEvery = trait(g, 'giftEvery'), shieldEvery = trait(g, 'shieldEvery');
  if (giftEvery && g.passed % giftEvery === 0) {
    const kind = POWER_KINDS[Math.floor(g.giftRng() * POWER_KINDS.length)];
    applyPower(g, kind);
    emit(g, 'gift', { kind });
  }
  if (shieldEvery && g.passed % shieldEvery === 0 && !g.shield) {
    g.shield = true;
    emit(g, 'gift', { kind: 'shield' });
  }
}

function scoreGate(g, gate) {
  gate.scored = true;
  g.passed++;
  const awake = g.ascended ? g.trait.awake || {} : {};
  const bonusPx = (g.ascended ? g.trait.ascendPerfectPx || 0 : 0) + (g.gliding ? awake.glidePerfectPx || 0 : 0);
  const kind = judgePass(gate, GATE.perfectPx + bonusPx);
  if (kind === 'perfect') {
    g.combo++;
    g.perfects++;
    g.orbCount += trait(g, 'perfectCoins') || 0;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    addMeter(g, METER.perfect);
    if (g.combo % FEVER.combo === 0) { g.feverT = FEVER.time; emit(g, 'fever'); }
  } else if (kind === 'phase') {
    g.dashGates++;
  } else {
    if (g.combo > 1) emit(g, 'comboBreak');
    g.combo = 0;
    addMeter(g, METER.pass);
  }
  const pts = passPoints(kind, g.combo) * mult(g);
  addScore(g, pts);
  emit(g, 'pass', { kind, pts, combo: g.combo, wx: gate.wx + gate.w });
  unitGifts(g);
  const zone = zoneOf(g.passed);
  if (zone !== zoneOf(g.passed - 1)) emit(g, 'zone', { zone, loop: loopOf(g.passed) });
}

function stepGates(g) {
  const y = g.bird.y;
  for (const gate of g.gates) {
    if (gate.scored) continue;
    if (overlapsX(g, gate)) {
      if (g.dashT > 0) {
        gate.dashed = true;
      } else {
        const half = gateGap(gate, g.t) / 2;
        const cy = gateCenter(gate, g.t);
        const clear = clearance(y, R, cy - half, cy + half);
        gate.minClear = Math.min(gate.minClear, clear);
        if (clear < 0 && !takeHit(g)) return false;
      }
    }
    if (g.dist - R > gate.wx + gate.w) scoreGate(g, gate);
  }
  return true;
}

function stepDrones(g) {
  for (const dr of g.drones) {
    if (dr.dead) continue;
    const dy = droneY(dr, g.t);
    if (Math.hypot(g.dist - dr.wx, g.bird.y - dy) >= R + DRONE.r) continue;
    if (g.dashT > 0) {
      dr.dead = true;
      g.droneKills++;
      const pts = DRONE.points * mult(g);
      addScore(g, pts);
      addMeter(g, METER.drone);
      emit(g, 'droneKill', { pts, wx: dr.wx, y: dy });
    } else if (!takeHit(g)) {
      return false;
    }
  }
  return true;
}

function collect(g, o) {
  o.got = true;
  if (o.k === 'orb') {
    g.orbCount++;
    addMeter(g, METER.orb);
  } else {
    applyPower(g, o.k);
  }
  emit(g, o.k === 'orb' ? 'orb' : 'power', { kind: o.k, wx: o.wx, y: o.y });
}

function stepOrbs(g, dt) {
  for (const o of g.orbs) {
    if (o.got) continue;
    o.t += dt;
    if (o.gate) { o.wx = o.gate.wx + o.gate.w / 2; o.y = gateCenter(o.gate, g.t); }
    const dx = g.dist - o.wx;
    const dy = g.bird.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    // A yeouiju calls to the imugi: it drifts to any player who comes near, magnet or not.
    const reach = o.k === 'pearl' ? BOSS.pearlPull : g.magnetT > 0 && o.k === 'orb' ? 190 : 0;
    if (d < reach) {
      const pull = Math.min(d, 520 * dt);
      o.wx += (dx / d) * pull;
      o.y += (dy / d) * pull;
    }
    if (d < R + (o.k === 'orb' ? 10 : 16)) collect(g, o);
  }
}

function hitBoss(g, bs) {
  bs.hp--;
  bs.hurtT = 1;
  bs.lead += BOSS.knock;
  bs.fireT = Math.max(bs.fireT, 1);
  g.bossHits++;
  const pts = BOSS.hitPoints * mult(g);
  addScore(g, pts);
  emit(g, 'bossHit', { hp: bs.hp, pts });
  if (bs.hp > 0) return;
  const bonus = BOSS.bonus * mult(g);
  g.bossKills++;
  addScore(g, bonus);
  g.shield = true;
  g.boss = null;
  g.shots = [];
  emit(g, 'bossDown', { pts: bonus });
}

// The boss keeps `lead` px ahead of the player and tracks their height; only a dash closes
// the distance. Its body is harmless — the danger is the fire it breathes down the lane.
function stepBoss(g, dt) {
  if (!g.boss) {
    const arena = g.arenas[0];
    if (!arena || g.dist < arena.start) return;
    g.arenas.shift();
    g.boss = spawnBoss(arena, g.bird.y, g.bossHp);
    emit(g, 'bossEnter', { tier: arena.tier });
    return;
  }
  const bs = g.boss;
  if (g.dist >= bs.end) {
    g.boss = null;
    g.shots = [];
    emit(g, 'bossFlee');
    return;
  }
  bs.hurtT = Math.max(0, bs.hurtT - dt);
  if (g.dashT > 0) bs.lead = Math.max(-80, bs.lead - speedAt(g.passed) * (PHYS.dashMul - 1) * dt);
  else bs.lead += (BOSS.lead - bs.lead) * Math.min(1, dt * 1.6);
  if (bs.fireT > BOSS.telegraph) bs.y += (bossLane(g.bird.y) - bs.y) * Math.min(1, dt * BOSS.track);
  bs.fireT -= dt;
  if (bs.fireT <= 0) {
    bs.fireT = shotInterval(bs.tier);
    if (bs.lead > 120 && bs.hurtT <= 0) {
      g.shots.push({ wx: g.dist + bs.lead - BOSS.r, y: bs.y });
      emit(g, 'bossFire', { wx: g.dist + bs.lead, y: bs.y });
    }
  }
  if (g.dashT > 0 && bs.hurtT <= 0 && Math.hypot(bs.lead, g.bird.y - bs.y) < R + BOSS.r) hitBoss(g, bs);
}

function stepShots(g, dt) {
  for (const shot of g.shots) {
    shot.wx -= BOSS.shotSpeed * dt;
    if (shot.wx < g.dist - 200) { shot.dead = true; continue; }
    if (Math.hypot(g.dist - shot.wx, g.bird.y - shot.y) >= R + BOSS.shotR) continue;
    shot.dead = true;
    if (g.dashT > 0 || g.fireWard > 0) {
      // A dash burns through fire; the awakened haechi swallows one burst.
      if (g.dashT <= 0) g.fireWard--;
      emit(g, 'shotBreak', { wx: shot.wx, y: shot.y });
    } else if (!takeHit(g)) return false;
  }
  if (g.shots.some(sh => sh.dead)) g.shots = g.shots.filter(sh => !sh.dead);
  return true;
}

function stepDying(g, rdt) {
  const dt = rdt * 0.35;
  const b = g.bird;
  g.deadT += rdt;
  b.vy += 1600 * dt;
  b.y = Math.min(GROUND - R, b.y + b.vy * dt);
  b.rot += 8 * dt;
  g.dist += 30 * dt;
  if (g.deadT > 1.1) g.phase = 'over';
}

/**
 * Advance the run by one tick. `input` is read, never modified.
 * @param {ReturnType<typeof createGame>} g
 * @param {number} rdt real seconds for this tick (use PHYS.step)
 * @param {{ flap?: boolean, dash?: boolean, hold?: boolean }} input
 */
export function step(g, rdt, input = {}) {
  if (g.phase === 'over') return;
  if (g.phase === 'dying') { stepDying(g, rdt); return; }
  g.timeScale += ((g.slowT > 0 ? 0.6 : 1) - g.timeScale) * Math.min(1, rdt * 6);
  const dt = rdt * g.timeScale;
  g.t += dt;
  applyInput(g, input);
  tickTimers(g, dt, rdt);
  g.dist += currentSpeed(g) * dt;
  if (!moveBird(g, dt, input)) return;
  ensureSpawn(g);
  if (!stepGates(g)) return;
  if (!stepDrones(g)) return;
  stepBoss(g, dt);
  if (!stepShots(g, dt)) return;
  stepOrbs(g, dt);
  cull(g);
}

export const currentSpeed = g => speedAt(g.passed) * (g.dashT > 0 ? PHYS.dashMul : 1);

export const canRevive = g => g.phase === 'over' && !g.revived && g.score >= REVIVE.minScore;

/** Put a finished run back in the air, once. Returns false if the run is not revivable. */
export function revive(g) {
  if (!canRevive(g)) return false;
  const next = g.gates.find(gt => !gt.scored);
  g.revived = true;
  g.phase = 'play';
  g.deadT = 0;
  g.bird = { y: next ? gateCenter(next, g.t) : PHYS.startY, vy: PHYS.flapVy * 0.6, rot: 0, wing: 1 };
  g.combo = 0;
  g.dashT = 0;
  g.invuln = REVIVE.invuln;
  g.drones = g.drones.filter(dr => dr.wx < g.dist - 40 || dr.wx > g.dist + 420);
  g.shots = [];
  emit(g, 'revive');
  return true;
}

/** Immutable snapshot of the numbers the meta layer cares about. */
export function summarize(g) {
  return Object.freeze({
    mode: g.mode, seed: g.seed, score: g.score, gates: g.passed, perfects: g.perfects, maxCombo: g.maxCombo,
    orbs: g.orbCount, dashGates: g.dashGates, droneKills: g.droneKills, zone: zoneOf(g.passed), revived: g.revived,
    unit: g.unit, ascended: g.ascended, bossHits: g.bossHits, bossKills: g.bossKills, pearls: g.pearls, night: g.night,
  });
}

/** Tutorial helper: hand the player a full dash gauge. */
export function fillDash(g) {
  g.dashMeter = 1;
}

export function drainEvents(g) {
  const out = g.events;
  g.events = [];
  return out;
}
