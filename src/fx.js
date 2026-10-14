// Cosmetic layer: particles, floating text, trail, screen shake. Purely visual, so it is free
// to use Math.random — nothing here feeds back into the simulation.
const MAX_PARTS = 400;
const TRAIL_LEN = 22;

export function createFx() {
  // aura: seconds left of the ascension glow around the player
  const fx = { parts: [], pops: [], trail: [], shake: 0, flash: 0, hitstop: 0, banner: null, aura: 0 };

  fx.reset = () => {
    fx.parts = []; fx.pops = []; fx.trail = [];
    fx.shake = 0; fx.flash = 0; fx.hitstop = 0; fx.banner = null; fx.aura = 0;
  };

  fx.part = (x, y, vx, vy, life, col, size) => {
    if (fx.parts.length < MAX_PARTS) fx.parts.push({ x, y, vx, vy, life, max: life, col, size });
  };

  fx.burst = (x, y, n, speed, life, col, size) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = speed * (0.3 + Math.random() * 0.7);
      fx.part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), col, size);
    }
  };

  fx.pop = (text, x, y, col, big = false) => fx.pops.push({ text, x, y, col, t: 0, big });

  fx.showBanner = (kicker, title, col) => { fx.banner = { kicker, title, col, t: 0, dur: 2.4 }; };

  fx.kick = ({ shake = 0, flash = 0, hitstop = 0 }) => {
    fx.shake = Math.max(fx.shake, shake);
    fx.flash = Math.max(fx.flash, flash);
    fx.hitstop = Math.max(fx.hitstop, hitstop);
  };

  // dt is game time (slows with slow-mo), rdt is wall time.
  fx.update = (dt, rdt, bird) => {
    for (const p of fx.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 300 * dt; p.vx *= 0.98; p.life -= rdt;
    }
    fx.parts = fx.parts.filter(p => p.life > 0);
    for (const p of fx.pops) { p.t += rdt; p.y -= 40 * rdt; }
    fx.pops = fx.pops.filter(p => p.t < 1.1);
    fx.shake = Math.max(0, fx.shake - rdt * 40);
    fx.flash = Math.max(0, fx.flash - rdt * 1.8);
    fx.aura = Math.max(0, fx.aura - rdt);
    if (fx.banner) { fx.banner.t += rdt; if (fx.banner.t > fx.banner.dur) fx.banner = null; }
    if (bird) {
      fx.trail.push({ wx: bird.wx, y: bird.y });
      if (fx.trail.length > TRAIL_LEN) fx.trail.shift();
    }
  };

  return fx;
}
