// Tunable constants. Everything gameplay-relevant lives here so the sim stays free of magic numbers.

export const LH = 640;
export const GROUND = 584;

export const PHYS = Object.freeze({
  step: 1 / 120,
  gravity: 1500,
  flapVy: -470,
  maxVy: 720,
  birdR: 13,
  baseSpeed: 190,
  speedGain: 120,
  loopSpeed: 12,
  maxLoopBonus: 4,
  dashTime: 0.55,
  dashMul: 2.6,
  startY: 280,
});

export const GATE = Object.freeze({
  w: 68,
  firstX: 520,
  perfectPx: 16,
  gatesPerZone: 8,
  // Two curves: speed and spacing ramp over speedRamp gates (unchanged), the pillar shapes over
  // the gentler rampGates (docs/STORY.md §4).
  speedRamp: 45,
  rampGates: 70,
  gapMax: 214,
  gapShrink: 44,
  moveBase: 0.14,
  moveGain: 0.18,
  pulseBase: 0.24,
  pulseGain: 0.2,
  ampBase: 26,
  ampGain: 30,
  jumpBase: 140,
  jumpGain: 45,
  spawnAhead: 1500,
  cullBehind: 400,
  pulseAmp: 22,
});

export const METER = Object.freeze({ perfect: 0.34, pass: 0.08, orb: 0.05, drone: 0.2 });
export const POWER = Object.freeze({ magnet: 7, slow: 4.5, double: 8 });
export const POWER_KINDS = Object.freeze(['shield', 'magnet', 'slow', 'double']);
export const FEVER = Object.freeze({ combo: 5, time: 6 });
export const DRONE = Object.freeze({ r: 11, fromGate: 8, points: 3, lineGap: 72 });
export const REVIVE = Object.freeze({ cost: 30, minScore: 5, invuln: 2.2, window: 4 });

// One stage, "Moonlit Palace", told as three night watches (gyeong) of the Joseon clock.
// `root` is the drone note of the soundtrack for that watch.
export const ZONES = Object.freeze([
  { id: 'chogyeong', sky: [[232, 55, 9], [268, 48, 22]], a: [42, 96, 62], b: [172, 78, 56], gate: [6, 78, 50], root: 98 },
  { id: 'samgyeong', sky: [[226, 62, 5], [214, 58, 17]], a: [196, 92, 66], b: [48, 96, 64], gate: [4, 74, 46], root: 87.31 },
  { id: 'ogyeong', sky: [[258, 44, 10], [16, 62, 30]], a: [28, 100, 66], b: [150, 62, 58], gate: [8, 82, 52], root: 110 },
]);

// Story stages (docs/STORY.md). Each has three watch palettes in the ZONES shape, a backdrop
// kind for the renderer, and a pillar colour. 'palace' is the original stage.
const stage = (id, backdrop, pillar, zones) => Object.freeze({ id, backdrop, pillar, zones: Object.freeze(zones) });
export const STAGES = Object.freeze([
  stage('palace', 'palace', [6, 70, 34], ZONES),
  stage('underworld', 'underworld', [190, 30, 26], [
    { id: 'chogyeong', sky: [[200, 40, 6], [184, 46, 16]], a: [176, 80, 60], b: [46, 90, 62], gate: [176, 70, 50], root: 92.5 },
    { id: 'samgyeong', sky: [[214, 46, 4], [196, 40, 12]], a: [160, 70, 58], b: [30, 100, 60], gate: [160, 60, 46], root: 82.41 },
    { id: 'ogyeong', sky: [[232, 34, 8], [270, 30, 20]], a: [280, 70, 70], b: [46, 90, 62], gate: [280, 50, 56], root: 87.31 },
  ]),
  stage('gyeongbok', 'palace', [2, 74, 38], [
    { id: 'chogyeong', sky: [[218, 60, 12], [246, 50, 26]], a: [48, 100, 64], b: [200, 80, 64], gate: [2, 80, 52], root: 98 },
    { id: 'samgyeong', sky: [[222, 70, 8], [230, 60, 18]], a: [200, 90, 70], b: [48, 100, 64], gate: [2, 76, 48], root: 87.31 },
    { id: 'ogyeong', sky: [[250, 46, 12], [10, 70, 34]], a: [24, 100, 66], b: [200, 80, 64], gate: [6, 82, 54], root: 110 },
  ]),
  stage('halla', 'clouds', [28, 30, 46], [
    { id: 'chogyeong', sky: [[214, 60, 22], [200, 60, 46]], a: [44, 100, 70], b: [190, 80, 74], gate: [28, 50, 60], root: 110 },
    { id: 'samgyeong', sky: [[222, 56, 16], [210, 50, 36]], a: [190, 90, 76], b: [44, 100, 70], gate: [24, 46, 56], root: 98 },
    { id: 'ogyeong', sky: [[24, 80, 50], [44, 90, 70]], a: [8, 90, 64], b: [190, 80, 74], gate: [20, 60, 60], root: 123.47 },
  ]),
  stage('heaven', 'heaven', [44, 80, 52], [
    { id: 'chogyeong', sky: [[240, 40, 30], [44, 70, 66]], a: [44, 100, 76], b: [160, 80, 74], gate: [44, 90, 66], root: 130.81 },
    { id: 'samgyeong', sky: [[220, 50, 40], [190, 60, 74]], a: [190, 90, 80], b: [44, 100, 76], gate: [40, 90, 62], root: 123.47 },
    { id: 'ogyeong', sky: [[44, 80, 70], [48, 100, 90]], a: [12, 90, 66], b: [190, 90, 70], gate: [36, 90, 60], root: 146.83 },
  ]),
]);

// The five nights of the story. diffShift starts the pillar curve that many gates in.
const night = (n, stageId, bossHp, tier) => Object.freeze({ n, stage: stageId, bossHp, tier, diffShift: (n - 1) * 10 });
export const STORY = Object.freeze({
  nights: Object.freeze([
    night(1, 'palace', 3, 0), night(2, 'underworld', 3, 1), night(3, 'gyeongbok', 4, 2),
    night(4, 'halla', 4, 3), night(5, 'heaven', 5, 4),
  ]),
  gates: 24, transformTime: 4, endingTime: 8,
});
// Imugi forms 0..5: imugi, horns, whiskers and mane, claws, pearl, dragon.
export const FORMS = Object.freeze(['imugi', 'horns', 'mane', 'claws', 'pearl', 'dragon']);

// Playable folklore units. Traits are plain numbers/flags read by the sim; names, trait text
// and lore live in the locale files under `unit.<id>` and `card.<id>`.
const unit = (id, cost, body, wing, trait) => Object.freeze({ id, cost, body, wing, trait: Object.freeze(trait) });
export const UNITS = Object.freeze([
  unit('imugi', 0, [168, 62, 46], [48, 96, 62], { ascendScore: 40, ascendMeter: 1.5, ascendPerfectPx: 6 }),
  // `awake` overrides traits once the spirit awakens at ascendScore (docs/STORY.md §6).
  unit('kkachi', 120, [222, 30, 16], [0, 0, 96], { perfectCoins: 1, ascendScore: 40, awake: { perfectCoins: 2 } }),
  unit('sotdae', 120, [28, 46, 44], [38, 60, 62], {
    gravity: 0.86, flap: 0.93, maxVy: 0.85, ascendScore: 40, awake: { gravity: 0.78, shieldNow: true },
  }),
  unit('jebi', 300, [224, 52, 24], [8, 82, 56], { giftEvery: 8, ascendScore: 40, awake: { giftEvery: 5 } }),
  unit('hak', 500, [0, 0, 96], [0, 82, 52], { glideVy: 190, ascendScore: 40, awake: { glidePerfectPx: 6 } }),
  unit('haechi', 800, [202, 62, 54], [44, 92, 60], {
    startShield: true, shieldEvery: 12, ascendScore: 40, awake: { shieldEvery: 8, fireWard: 1 },
  }),
]);
export const DEFAULT_UNIT = 'imugi';

// Gangcheori, the drought dragon. An open stretch of sky (the arena) follows every
// `every` gates; the boss leaves on its own when the arena runs out, so it never blocks a run.
export const BOSS = Object.freeze({
  // arenaPerHp: extra open sky for every hit point above `hp`, so a tougher boss can be beaten in time
  every: 24, trialEvery: 3, arena: 3200, arenaPerHp: 1100, hp: 3, r: 40, lead: 185, enterLead: 520, knock: 240,
  shotEvery: 1.6, shotMin: 1, telegraph: 0.7, shotSpeed: 70, shotR: 10,
  hitPoints: 5, bonus: 30, pearlPull: 170, pearls: [0.07, 0.29, 0.51, 0.73], track: 1.3,
});

// Supported UI languages; the first match of the device's preferences wins, English otherwise.
export const LOCALES = Object.freeze(['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt-BR', 'fr', 'id', 'vi']);
export const FALLBACK_LOCALE = 'en';

export const TUTORIAL =Object.freeze({ seed: 20270101, flaps: 3, gates: 2, perfectGrace: 5, reward: 50 });
export const CARD_BONUS = 0.02;

// kind 'sum' accumulates across runs for the day, 'max' needs it within a single run.
export const MISSIONS = Object.freeze([
  { id: 'perfects', kind: 'sum', stat: 'perfects', goals: [8, 12, 18] },
  { id: 'gates', kind: 'sum', stat: 'gates', goals: [40, 60, 90] },
  { id: 'orbs', kind: 'sum', stat: 'orbs', goals: [50, 80, 120] },
  { id: 'dashGates', kind: 'sum', stat: 'dashGates', goals: [4, 6, 10] },
  { id: 'droneKills', kind: 'sum', stat: 'droneKills', goals: [2, 3, 5] },
  { id: 'combo', kind: 'max', stat: 'maxCombo', goals: [4, 6, 8] },
  { id: 'score', kind: 'max', stat: 'score', goals: [40, 70, 110] },
  { id: 'bossHits', kind: 'sum', stat: 'bossHits', goals: [1, 2, 3] },
]);

export const MISSION_COUNT = 3;
export const BOARD_SIZE = 5;
export const RANKS = Object.freeze([['S', 150], ['A', 80], ['B', 35], ['C', 0]]);
export const SAVE_KEY = 'imugi_save';
export const EVENTS_KEY = 'imugi_events';
export const SEED_NS = 'imugi';
export const SAVE_VERSION = 1;
