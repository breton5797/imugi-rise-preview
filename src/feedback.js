// Turns simulation events into juice: sound, particles, floating text, shake, haptics.
import { ZONES } from './config.js';
import { t } from './i18n.js';
import { POWER_COLORS } from './sprites.js';

const GOLD = [44, 100, 65];
const FIRE = [14, 100, 60];
const JADE = [160, 90, 70];

/**
 * @param {{ fx: object, audio: object, haptic: (ms: number | number[]) => void, palette: () => object }} deps
 * @returns {(event: object, ctx: { g: object, birdX: number }) => void}
 */
export function createFeedback({ fx, audio, haptic, palette }) {
  const sfx = audio.sfx;
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

  function onPass(e, x, y, pal) {
    if (e.kind === 'perfect') {
      sfx.perfect(e.combo);
      haptic(15);
      fx.kick({ flash: 0.18, hitstop: 0.06, shake: 4 });
      fx.pop(e.combo > 1 ? t('pop.perfectCombo', { n: e.combo, pts: e.pts }) : t('pop.perfect', { pts: e.pts }), x + 10, y - 30, pal.a, true);
      for (let i = 0; i < 16; i++) fx.part(x + 20, y, rnd(60, 260), rnd(-130, 130), 0.6, pal.a, 2.5);
    } else if (e.kind === 'phase') {
      sfx.phase();
      fx.pop(t('pop.phase', { pts: e.pts }), x, y - 30, pal.b);
    } else {
      sfx.pass();
    }
  }

  function gain(kind, x, y) {
    sfx.power();
    haptic(20);
    fx.pop(t(`power.${kind}`), x, y - 34, POWER_COLORS[kind], true);
  }

  const handlers = {
    flap(e, x, y, pal) {
      sfx.flap();
      for (let i = 0; i < 5; i++) fx.part(x - 6, y + 6, rnd(-140, -60), rnd(40, 120), 0.35, pal.b, 2);
    },
    dash(e, x, y, pal) {
      sfx.dash();
      haptic(30);
      fx.kick({ shake: 8, flash: 0.35 });
      for (let i = 0; i < 24; i++) fx.part(x, y, rnd(-500, -200), rnd(-100, 100), 0.5, pal.b, 3);
    },
    pass: onPass,
    comboBreak(e, x, y) { fx.pop(t('pop.comboBreak'), x, y + 36, [0, 0, 70]); },
    orb(e, x, y, pal, ox) {
      sfx.orb();
      fx.burst(ox, e.y, 6, 110, 0.35, GOLD, 2);
    },
    power(e, x, y) { gain(e.kind, x, y); },
    gift(e, x, y) {
      sfx.gift();
      haptic(20);
      fx.pop(t('pop.gift', { name: t(`power.${e.kind}`) }), x, y - 34, POWER_COLORS[e.kind], true);
      fx.burst(x, y, 14, 200, 0.5, POWER_COLORS[e.kind], 2.5);
    },
    bump(e, x, y) {
      sfx.bump();
      fx.kick({ shake: 5 });
      fx.burst(x, y, 10, 160, 0.35, [0, 0, 80], 2);
    },
    shieldBreak(e, x, y) {
      sfx.shield();
      haptic(40);
      fx.kick({ shake: 10, flash: 0.3 });
      fx.pop(t('pop.shieldBreak'), x, y - 34, POWER_COLORS.shield);
      fx.burst(x, y, 20, 240, 0.5, POWER_COLORS.shield, 2.5);
    },
    droneKill(e, x, y, pal, ox) {
      sfx.kill();
      haptic(25);
      fx.kick({ shake: 7, hitstop: 0.04 });
      fx.pop(t('pop.wisp', { pts: e.pts }), ox, e.y - 26, [196, 100, 72], true);
      fx.burst(ox, e.y, 26, 300, 0.6, [196, 100, 66], 3);
    },
    fever(e, x, y) {
      sfx.fever();
      haptic([20, 30, 20]);
      fx.kick({ flash: 0.4, shake: 6 });
      fx.showBanner(t('banner.feverKicker'), t('banner.feverTitle'), GOLD);
      audio.setMusic({ fever: true });
      fx.burst(x, y, 30, 320, 0.7, GOLD, 3);
    },
    feverEnd() { audio.setMusic({ fever: false }); },
    zone(e) {
      sfx.zone();
      audio.setMusic({ zone: e.zone });
      const kicker = e.loop > 0 ? t('banner.loop', { loop: e.loop + 1, n: e.zone + 1 }) : t('banner.watch', { n: e.zone + 1 });
      fx.showBanner(kicker, t(`zone.${ZONES[e.zone].id}`), null);
    },
    // The game's signature moment: freeze, a shock ring of gold and cinnabar, then the dragon flies on.
    ascend(e, x, y) {
      sfx.ascend();
      haptic([30, 40, 60, 40, 120]);
      fx.kick({ flash: 0.9, shake: 12, hitstop: 0.28 });
      // The imugi becomes a dragon; every other spirit takes its awakened name.
      const other = e.unit && e.unit !== 'imugi';
      fx.showBanner(
        other ? t('banner.awakenKicker', { name: t(`unit.${e.unit}.name`) }) : t('banner.ascendKicker'),
        other ? t(`awaken.${e.unit}.name`) : t('banner.ascendTitle'), GOLD,
      );
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        fx.part(x, y, Math.cos(a) * 340, Math.sin(a) * 340, 1.1, i % 2 ? GOLD : [6, 90, 58], 4);
        fx.part(x, y, Math.cos(a) * 170, Math.sin(a) * 170, 0.9, [48, 100, 82], 2.5);
      }
      fx.burst(x, y, 60, 420, 1.2, GOLD, 3.5);
      fx.aura = 1.6;
    },
    bossEnter() {
      sfx.gong();
      haptic([60, 40, 60]);
      fx.kick({ shake: 12, flash: 0.3 });
      fx.showBanner(t('banner.bossKicker'), t('banner.bossTitle'), FIRE);
    },
    bossFire(e, x, y, pal, ox) {
      sfx.roar();
      fx.burst(ox, e.y, 12, 220, 0.4, FIRE, 3);
    },
    shotBreak(e, x, y, pal, ox) {
      sfx.kill();
      fx.burst(ox, e.y, 16, 260, 0.45, FIRE, 3);
    },
    bossHit(e, x, y) {
      sfx.bossHit();
      haptic(45);
      fx.kick({ shake: 14, flash: 0.45, hitstop: 0.1 });
      fx.pop(t('pop.bossHit', { pts: e.pts }), x + 60, y - 40, FIRE, true);
      fx.burst(x + 50, y, 34, 360, 0.7, FIRE, 3.5);
    },
    bossDown(e, x, y) {
      sfx.ascend();
      haptic([60, 40, 120]);
      fx.kick({ shake: 18, flash: 0.7, hitstop: 0.16 });
      fx.showBanner(t('banner.bossDownKicker'), t('banner.bossDownTitle'), JADE);
      fx.pop(t('pop.bossDown', { pts: e.pts }), x + 40, y - 46, JADE, true);
      fx.burst(x + 60, y, 60, 460, 1.1, JADE, 4);
    },
    bossFlee() {
      sfx.zone();
      fx.showBanner(t('banner.bossFleeKicker'), t('banner.bossFleeTitle'), [0, 0, 80]);
    },
    die(e, x, y, pal) {
      sfx.die();
      haptic([40, 40, 80]);
      fx.kick({ shake: 18, flash: 0.6, hitstop: 0.12 });
      audio.setMusic({ playing: false, fever: false });
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.28, s = rnd(80, 440);
        fx.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.9, 1.5), Math.random() < 0.5 ? pal.a : pal.b, rnd(2, 5));
      }
    },
    revive(e, x, y) {
      sfx.revive();
      haptic(30);
      fx.kick({ flash: 0.5 });
      audio.setMusic({ playing: true });
      fx.pop(t('pop.revive'), x + 20, y - 36, JADE, true);
      fx.burst(x, y, 28, 260, 0.7, JADE, 3);
    },
  };

  return (e, { g, birdX }) => {
    const handler = handlers[e.type];
    if (!handler) return;
    const ox = e.wx === undefined ? birdX : e.wx - g.dist + birdX;
    handler(e, birdX, g.bird.y, palette(), ox);
  };
}
