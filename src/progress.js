// Meta progression: save data, daily missions, units, lore cards, records. Pure and immutable —
// every function returns a new save instead of touching the one it was given.
import {
  BOARD_SIZE, CARD_BONUS, DEFAULT_UNIT, LOCALES, MISSION_COUNT, MISSIONS, SAVE_VERSION, SEED_NS, STORY, UNITS,
} from './config.js';
import { rankOf } from './logic.js';
import { hashString, mulberry32 } from './rng.js';

const STAT_KEYS = ['runs', 'gates', 'perfects', 'orbs', 'dashGates', 'droneKills', 'maxCombo', 'bossHits', 'bossKills', 'pearls'];
const SUM_STATS = STAT_KEYS.filter(k => k !== 'runs' && k !== 'maxCombo');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE_RE = /^[A-Za-z0-9-]{8,64}$/;
const DAY_MS = 86400000;

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = v => typeof v === 'string' && DATE_RE.test(v);
const unitById = id => UNITS.find(u => u.id === id);
const missionDef = id => MISSIONS.find(m => m.id === id);

// Lore cards: one per unit (unlocked by owning it) plus the things met along the way.
const WORLD_CARDS = Object.freeze([
  { id: 'dancheong', unlocked: save => save.stats.gates > 0 },
  { id: 'yeopjeon', unlocked: save => save.stats.orbs > 0 },
  { id: 'dokkaebibul', unlocked: save => save.stats.droneKills > 0 },
  { id: 'yeouiju', unlocked: save => save.stats.pearls > 0 },
  { id: 'gangcheori', unlocked: save => save.stats.bossHits > 0 },
]);
export const CARD_IDS = Object.freeze([...UNITS.map(u => u.id), ...WORLD_CARDS.map(c => c.id)]);

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    shards: 0,
    best: 0,
    daily: { date: '', best: 0, tries: 0 },
    unit: DEFAULT_UNIT,
    owned: [DEFAULT_UNIT],
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
    missions: { date: '', items: [] },
    board: [],
    settings: { sfx: true, music: true, haptic: true, locale: '' },
    tutorialDone: false,
    seen: { first: '', last: '', d1: false, d7: false },
    device: '',
    story: { night: 1, cleared: 0, ending: false },
  };
}

const LAST_NIGHT = STORY.nights.length;

// The night to play is always the one after the last cleared, so storage cannot skip ahead.
function normalizeStory(raw) {
  const cleared = isObj(raw) ? Math.min(LAST_NIGHT, int(raw.cleared)) : 0;
  const ending = isObj(raw) && raw.ending === true && cleared === LAST_NIGHT;
  return { night: Math.min(LAST_NIGHT, cleared + 1), cleared, ending };
}

/** The imugi's form (0..5) reached in the story: one per cleared night. */
export const storyForm = save => save.story.cleared;

// What a story run did to the story: { night, cleared, from, to, ending } or null.
function storyStep(story, run) {
  if (run.mode !== 'story') return { story, step: null };
  const night = Math.min(LAST_NIGHT, Math.max(1, int(run.night, 1)));
  const cleared = int(run.bossKills) > 0 && night <= story.cleared + 1;
  const ending = cleared && night === LAST_NIGHT && !story.ending;
  const next = cleared ? normalizeStory({ cleared: Math.max(story.cleared, night), ending: story.ending || night === LAST_NIGHT }) : story;
  return { story: next, step: { night, cleared, from: night - 1, to: cleared ? night : night - 1, ending } };
}

// Goals and rewards always come from the day's own roll; only progress is taken from storage.
function normalizeMissions(raw) {
  if (!isObj(raw) || !isDate(raw.date) || !Array.isArray(raw.items)) return { date: '', items: [] };
  const stored = raw.items.filter(isObj);
  const items = pickMissions(raw.date).map(item => {
    const match = stored.find(it => it.id === item.id);
    const progress = Math.min(item.goal, int(match && match.progress));
    return { ...item, progress, done: progress >= item.goal };
  });
  return { date: raw.date, items };
}

function normalizeBoard(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(e => isObj(e) && Number.isFinite(e.score) && isDate(e.date))
    .map(e => ({ score: int(e.score), date: e.date, unit: unitById(e.unit) ? e.unit : DEFAULT_UNIT }))
    .sort((a, b) => b.score - a.score)
    .slice(0, BOARD_SIZE);
}

function normalizeSeen(raw) {
  if (!isObj(raw) || !isDate(raw.first)) return { first: '', last: '', d1: false, d7: false };
  return { first: raw.first, last: isDate(raw.last) ? raw.last : raw.first, d1: bool(raw.d1, false), d7: bool(raw.d7, false) };
}

/** Anything read from localStorage is untrusted: coerce it into a well-formed save. */
export function normalizeSave(raw) {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const owned = Array.isArray(raw.owned) ? raw.owned.filter(id => unitById(id)) : [];
  const ownedSet = [...new Set([DEFAULT_UNIT, ...owned])];
  const daily = isObj(raw.daily) && isDate(raw.daily.date)
    ? { date: raw.daily.date, best: int(raw.daily.best), tries: int(raw.daily.tries) }
    : d.daily;
  const stats = isObj(raw.stats) ? raw.stats : {};
  const settings = isObj(raw.settings) ? raw.settings : {};
  return {
    v: SAVE_VERSION,
    shards: int(raw.shards),
    best: int(raw.best),
    daily,
    unit: ownedSet.includes(raw.unit) ? raw.unit : DEFAULT_UNIT,
    owned: ownedSet,
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, int(stats[k])])),
    missions: normalizeMissions(raw.missions),
    board: normalizeBoard(raw.board),
    settings: {
      sfx: bool(settings.sfx, true), music: bool(settings.music, true), haptic: bool(settings.haptic, true),
      locale: LOCALES.includes(settings.locale) ? settings.locale : '',
    },
    tutorialDone: bool(raw.tutorialDone, false),
    seen: normalizeSeen(raw.seen),
    device: typeof raw.device === 'string' && DEVICE_RE.test(raw.device) ? raw.device : '',
    story: normalizeStory(raw.story),
  };
}

/** Three missions per day, the same for everyone on that date. */
export function pickMissions(dateKey) {
  const rng = mulberry32(hashString(`${SEED_NS}:missions:${dateKey}`));
  const pool = MISSIONS.map(m => ({ m, key: rng() })).sort((a, b) => a.key - b.key).slice(0, MISSION_COUNT);
  return pool.map(({ m }) => {
    const tier = Math.floor(rng() * m.goals.length);
    return { id: m.id, goal: m.goals[tier], reward: 20 + tier * 10, progress: 0, done: false };
  });
}

/** Roll the mission list and the daily record over when the date changes. */
export function ensureToday(save, dateKey) {
  const missions = save.missions.date === dateKey ? save.missions : { date: dateKey, items: pickMissions(dateKey) };
  const daily = save.daily.date === dateKey ? save.daily : { date: dateKey, best: 0, tries: 0 };
  return { ...save, missions, daily };
}

function advanceMission(item, run) {
  if (item.done) return item;
  const def = missionDef(item.id);
  const value = int(run[def.stat]);
  const progress = Math.min(item.goal, def.kind === 'sum' ? item.progress + value : Math.max(item.progress, value));
  return { ...item, progress, done: progress >= item.goal };
}

/** Ids of the lore cards this save has unlocked, in collection order. */
export function unlockedCards(save) {
  const world = WORLD_CARDS.filter(c => c.unlocked(save)).map(c => c.id);
  return CARD_IDS.filter(id => save.owned.includes(id) || world.includes(id));
}

/** Coin bonus from the collection: every card adds CARD_BONUS. */
export const cardBonus = save => unlockedCards(save).length * CARD_BONUS;

export const runShards = (run, bonus = 0) => Math.round((int(run.orbs) + Math.floor(int(run.score) / 10)) * (1 + bonus));

/**
 * Fold a finished run into the save. Trial runs pay out and count towards missions and the
 * collection, but never touch a record.
 * @returns {{ save: object, earned: number, completed: object[], newBest: boolean, rank: number, newCards: string[], story: object | null }}
 */
export function applyRun(save, run, dateKey) {
  const today = ensureToday(save, dateKey);
  const items = today.missions.items.map(it => advanceMission(it, run));
  const completed = items.filter((it, i) => it.done && !today.missions.items[i].done);
  const earned = runShards(run, cardBonus(today)) + completed.reduce((sum, it) => sum + it.reward, 0);
  const isDaily = run.mode === 'daily', ranked = run.mode === 'classic';
  const prevBest = isDaily ? today.daily.best : today.best;
  const newBest = (isDaily || ranked) && run.score > prevBest;
  const stats = {
    ...today.stats,
    ...Object.fromEntries(SUM_STATS.map(k => [k, today.stats[k] + int(run[k])])),
    runs: today.stats.runs + 1,
    maxCombo: Math.max(today.stats.maxCombo, int(run.maxCombo)),
  };
  const entry = { score: run.score, date: dateKey, unit: run.unit || DEFAULT_UNIT };
  const board = ranked ? normalizeBoard([...today.board, entry]) : today.board;
  const story = storyStep(today.story, run);
  const next = {
    ...today,
    shards: today.shards + earned,
    best: ranked ? Math.max(today.best, run.score) : today.best,
    daily: isDaily ? { ...today.daily, best: Math.max(today.daily.best, run.score), tries: today.daily.tries + 1 } : today.daily,
    stats,
    missions: { ...today.missions, items },
    board,
    story: story.story,
  };
  const before = unlockedCards(today);
  const newCards = unlockedCards(next).filter(id => !before.includes(id));
  // Ties keep the older entry first, so a tied run ranks below the ones it tied with —
  // and falls off a full board.
  const place = today.board.filter(e => e.score >= run.score).length + 1;
  const rank = ranked && run.score > 0 && place <= BOARD_SIZE ? place : 0;
  return { save: next, earned, completed, newBest, rank, newCards, story: story.step };
}

/** @returns {object | null} the new save, or null when the balance is too low */
export function spend(save, amount) {
  return save.shards >= amount ? { ...save, shards: save.shards - amount } : null;
}

/** Units are sold at a fixed price: no random boxes anywhere in the game. */
export function buyUnit(save, id) {
  const unit = unitById(id);
  if (!unit) return { ok: false, save, reason: 'unknown' };
  if (save.owned.includes(id)) return { ok: true, save: { ...save, unit: id } };
  const paid = spend(save, unit.cost);
  if (!paid) return { ok: false, save, reason: 'shards' };
  return { ok: true, save: { ...paid, owned: [...paid.owned, id], unit: id } };
}

export const withSetting = (save, key, value) => ({ ...save, settings: { ...save.settings, [key]: value } });

export const activeUnit = save => unitById(save.unit) || unitById(DEFAULT_UNIT);

const dayNumber = key => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

/**
 * Record that the game was opened on `dateKey`.
 * @returns {{ save: object, events: string[] }} events: 'first_open' once, then 'd1_return' and
 *   'd7_return' once each, on the first and seventh calendar day after the first open
 */
export function touchSeen(save, dateKey) {
  const seen = save.seen;
  if (!seen.first) return { save: { ...save, seen: { first: dateKey, last: dateKey, d1: false, d7: false } }, events: ['first_open'] };
  const day = dayNumber(dateKey) - dayNumber(seen.first);
  const d1 = !seen.d1 && day === 1, d7 = !seen.d7 && day === 7;
  const events = [...(d1 ? ['d1_return'] : []), ...(d7 ? ['d7_return'] : [])];
  return { save: { ...save, seen: { ...seen, last: dateKey, d1: seen.d1 || d1, d7: seen.d7 || d7 } }, events };
}

/** @param {(key: string, params?: object) => string} t */
export function shareText(run, dateKey, t) {
  const head = run.mode === 'daily' ? t('share.daily', { date: dateKey }) : t('share.title');
  return [
    head,
    t('share.score', { score: run.score, rank: rankOf(run.score) }),
    t('share.stats', { gates: run.gates, perfects: run.perfects, combo: run.maxCombo }),
    t(run.mode === 'daily' ? 'share.dareDaily' : 'share.dare', { score: run.score }),
  ].join('\n');
}
