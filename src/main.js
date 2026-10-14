// Entry point: owns the app state machine (menu → play ⇄ paused → revive? → over) and wires
// input, simulation, feedback, rendering, the save file and the online services together.
import { createAudio } from './audio.js';
import { PHYS, REVIVE, SAVE_KEY, STORY, TUTORIAL, UNITS, ZONES } from './config.js';
import { createFeedback } from './feedback.js';
import { createFx } from './fx.js';
import { pickLocale, setLocale, t } from './i18n.js';
import { createLeaderboard } from './leaderboard.js';
import { activeUnit, applyRun, buyUnit, ensureToday, shareText, spend, storyForm, touchSeen, withSetting } from './progress.js';
import { createRenderer } from './render.js';
import { dailySeed, dateKey, randomSeed } from './rng.js';
import { canRevive, createGame, drainEvents, fillDash, revive, step, summarize } from './sim.js';
import { loadSave, persistSave } from './storage.js';
import { createTelemetry } from './telemetry.js';
import { solarTermIndex } from './terms.js';
import { advanceTutorial, startTutorial } from './tutorial.js';
import { $, applyStaticText, renderMenu, renderOver, renderPanel, setBoardLine, show } from './ui.js';

const STEP = PHYS.step;
const NO_INPUT = Object.freeze({ flap: false, dash: false });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('c');
const renderer = createRenderer(canvas);
const fx = createFx();

// A host page may point the game at its backend; without it everything stays on the device.
const httpsUrl = v => (typeof v === 'string' && v.startsWith('https://') ? v : '');
const env = typeof globalThis.__IMUGI_ENV__ === 'object' && globalThis.__IMUGI_ENV__ !== null ? globalThis.__IMUGI_ENV__ : {};

function newDeviceId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // The id only tells devices apart on a leaderboard; without Web Crypto a weaker one will do.
  const bytes = globalThis.crypto
    ? crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch (err) { return null; }
}

function boot() {
  const today = dateKey();
  const loaded = ensureToday(loadSave(), today);
  const seen = touchSeen(loaded.device ? loaded : { ...loaded, device: newDeviceId() }, today);
  persistSave(seen.save);
  return seen;
}

const booted = boot();
let save = booted.save;
const preferred = () => navigator.languages || [navigator.language];
setLocale(pickLocale(save.settings.locale, preferred()));

const telemetry = createTelemetry({
  storage: safeStorage(), endpoint: httpsUrl(env.telemetryUrl), device: save.device,
  send: (url, body) => Boolean(navigator.sendBeacon && navigator.sendBeacon(url, body)),
});
const leaderboard = createLeaderboard({ url: httpsUrl(env.leaderboardUrl), device: save.device });
for (const name of booted.events) telemetry.track(name);
telemetry.flush();

const audio = createAudio(save.settings);
const haptic = pattern => {
  if (!save.settings.haptic || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch (err) { /* vibration is best-effort */ }
};
const feedback = createFeedback({ fx, audio, haptic, palette: renderer.palette });

let state = 'menu';
let game = idleGame();
let input = NO_INPUT;
let holding = false;
let runDate = dateKey();
let lastRun = null;
let openPanel = null;
let tutorial = null;
let acc = 0, scroll = 0, clock = 0, overAt = 0, reviveT = 0;
let playT = 0, endAt = 0; // endAt is measured in play time, which only advances while flying
let hintUntil = 0; // a one-off coaching line shown mid-run, also in play time
let cutscene = null; // { kind: 'transform' | 'ending', t, from, to, night } while a story scene plays
let cutQueue = [];
let pendingOver = null; // the result card waiting behind the cutscenes
let fledRun = false;
let last = performance.now();

const birdX = () => Math.min(renderer.width() * 0.3, 150);
const dateLabel = key => key.slice(5).replace('-', '.');

function idleGame() {
  const g = createGame({ seed: 1, unit: save.unit });
  return { ...g, gates: [], orbs: [], drones: [], arenas: [], bird: { ...g.bird, y: 300 } };
}

function refreshMenu() {
  const key = save.daily.date || dateKey();
  renderMenu({ save, dateLabel: dateLabel(key), term: t(`term.${solarTermIndex(key)}`) });
}

function commit(next) {
  save = next;
  persistSave(save);
  refreshMenu();
}

function setScreen(next) {
  state = next;
  show('menu', next === 'menu' && !openPanel);
  show('panel', next === 'menu' && Boolean(openPanel));
  show('pauseScr', next === 'paused');
  show('reviveScr', next === 'revive');
  show('over', next === 'over');
  show('pauseBtn', next === 'play');
  show('shardPill', next !== 'play' && next !== 'paused');
  show('dashBtn', next === 'play');
  show('coach', next === 'play' && (Boolean(tutorial) || hintUntil > 0));
  show('tutorialSkip', next === 'play' && Boolean(tutorial));
  show('caption', next === 'cutscene');
}

function setTutorial(next) {
  tutorial = next;
  $('coach').textContent = t(`tutorial.${next.step}`, { coins: save.tutorialDone ? 0 : TUTORIAL.reward });
  if (next.step === 'done') endAt = playT + 1.8;
}

const nightDef = n => STORY.nights.find(x => x.n === n) || STORY.nights[0];

function openingBanner(mode) {
  if (mode === 'story') return [t(`night.${game.night}.name`), t(`zone.${ZONES[0].id}`)];
  if (mode === 'daily') return [t('banner.daily', { date: dateLabel(runDate) }), t(`zone.${ZONES[0].id}`)];
  if (mode === 'trial') return [t('banner.trial'), t('banner.bossTitle')];
  return [t('banner.stage'), t(`zone.${ZONES[0].id}`)];
}

function startRun(requested, night = save.story.night) {
  const mode = (requested === 'classic' || requested === 'story') && !save.tutorialDone ? 'tutorial' : requested;
  audio.init();
  runDate = dateKey();
  commit(ensureToday(save, runDate));
  const seed = mode === 'daily' ? dailySeed(runDate) : mode === 'tutorial' ? TUTORIAL.seed : randomSeed();
  // The Ascension is the imugi's story, whichever spirit is equipped elsewhere.
  game = createGame({ seed, mode, unit: mode === 'story' ? 'imugi' : save.unit, night });
  fx.reset();
  if (mode !== 'tutorial') fx.showBanner(...openingBanner(mode), null);
  input = { flap: true, dash: false };
  holding = false;
  acc = 0;
  playT = 0;
  endAt = 0;
  hintUntil = 0;
  openPanel = null;
  tutorial = null;
  if (mode === 'tutorial') setTutorial(startTutorial());
  if (mode === 'story') showHint(t(`night.${game.night}.line`), 4.5);
  audio.setMusic({ playing: true, zone: 0, fever: false });
  setScreen('play');
}

// Fold the current run into the save. Every way out of a run goes through here exactly once.
function bankRun() {
  lastRun = summarize(game);
  const result = applyRun(save, lastRun, runDate);
  commit(result.save);
  telemetry.track('run_end', {
    mode: lastRun.mode, unit: lastRun.unit, score: lastRun.score, gates: lastRun.gates, perfects: lastRun.perfects,
    boss_hits: lastRun.bossHits, boss_kills: lastRun.bossKills, revived: lastRun.revived, ascended: lastRun.ascended, night: lastRun.night,
    seconds: Math.round(playT), // active flying time: pauses and the revive screen do not count
  });
  telemetry.flush();
  return result;
}

// Scores go online only when they beat the player's own record, which keeps traffic tiny.
async function submitScore(run, date) {
  if (!leaderboard.configured) return;
  const board = run.mode === 'daily' ? `daily:${date}` : 'classic';
  const sent = await leaderboard.submit({ board, score: run.score, unit: run.unit, seed: run.seed, gates: run.gates });
  if (lastRun !== run || state !== 'over') return; // the player has already moved on
  setBoardLine(sent.ok && sent.rank ? t('over.boardOnline', { rank: sent.rank }) : t('over.boardOffline'));
}

function finishRun() {
  const result = bankRun();
  endAt = 0;
  // Still flying when the run ends means the fight ran out, not the player.
  fledRun = game.mode === 'story' && game.phase === 'play' && game.bossKills === 0;
  audio.setMusic({ playing: false, fever: false });
  // A cleared night first plays its transformation, and the last one the ending.
  const step = result.story;
  cutQueue = step && step.cleared
    ? [{ kind: 'transform', from: step.from, to: step.to, night: step.night }, ...(step.ending ? [{ kind: 'ending' }] : [])]
    : [];
  pendingOver = result;
  if (cutQueue.length) nextCutscene(); else showOver();
}

function nextCutscene() {
  cutscene = cutQueue.length ? { ...cutQueue.shift(), t: 0 } : null;
  if (!cutscene) { showOver(); return; }
  const ending = cutscene.kind === 'ending';
  $('capKicker').textContent = ending ? t('ending.kicker') : t(`night.${cutscene.night}.name`);
  $('capTitle').textContent = ending ? t('ending.title') : t(`transform.${cutscene.to}`);
  $('capTitle').hidden = true;
  if (ending) audio.sfx.ascend(); else audio.sfx.gong();
  haptic(ending ? [60, 60, 200] : [40, 40, 120]);
  setScreen('cutscene');
}

function tickCutscene(rdt) {
  cutscene.t += rdt;
  const length = cutscene.kind === 'ending' ? STORY.endingTime : STORY.transformTime;
  $('capTitle').hidden = cutscene.t < length * (cutscene.kind === 'ending' ? 0.7 : 0.65);
  if (cutscene.t >= length) nextCutscene();
}

function showOver() {
  const result = pendingOver;
  cutscene = null;
  renderOver({ run: lastRun, result, best: lastRun.mode === 'daily' ? save.daily.best : save.best, dateLabel: dateLabel(runDate), fled: fledRun });
  if (result.completed.length || result.newCards.length) audio.sfx.reward();
  if (result.newBest) submitScore(lastRun, runDate);
  overAt = clock;
  setScreen('over');
  const button = $('retryBtn');
  button.disabled = true;
  setTimeout(() => {
    button.disabled = false;
    if (state === 'over') button.focus({ preventScroll: true });
  }, 650);
}

function completeTutorial(skipped) {
  const first = !save.tutorialDone; // a replay from the help panel pays and reports nothing
  if (first) {
    telemetry.track('tutorial_complete', { skipped });
    commit({ ...save, tutorialDone: true, shards: save.shards + (skipped ? 0 : TUTORIAL.reward) });
    if (!skipped) audio.sfx.reward();
  }
  toMenu();
}

function offerRevive() {
  // No revive once a trial has been decided: the run is about to end anyway.
  if (endAt || !canRevive(game) || save.shards < REVIVE.cost) { finishRun(); return; }
  reviveT = REVIVE.window;
  $('reviveCost').textContent = String(REVIVE.cost);
  setScreen('revive');
}

function acceptRevive() {
  if (state !== 'revive') return;
  const paid = spend(save, REVIVE.cost);
  if (!paid || !revive(game)) { finishRun(); return; }
  commit(paid);
  acc = 0;
  setScreen('play');
}

function toMenu() {
  // A story night already won must not lose its transformation (or the ending) to a quit.
  if ((state === 'play' || state === 'paused') && game.mode === 'story' && game.bossKills > 0) { finishRun(); return; }
  // Quitting mid-run still keeps what was earned; the tutorial is never banked.
  if ((state === 'play' || state === 'paused') && game.mode !== 'tutorial') bankRun();
  audio.setMusic({ playing: false, fever: false });
  game = idleGame();
  fx.reset();
  openPanel = null;
  tutorial = null;
  endAt = 0;
  hintUntil = 0;
  holding = false;
  setScreen('menu');
  $('playBtn').focus({ preventScroll: true });
}

function togglePause() {
  if (state === 'play' && game.phase === 'play') setScreen('paused');
  else if (state === 'paused') { last = performance.now(); setScreen('play'); }
}

function flapIntent() {
  audio.init();
  if (state === 'play') input = { ...input, flap: true };
  else if (state === 'cutscene') { if (cutscene && cutscene.t > 0.4) nextCutscene(); }
  else if (state === 'paused') togglePause();
  else if (state === 'over') retry();
  else if (state === 'menu' && !openPanel) startRun('story');
}

// A short lockout so a player still mashing flap (or skipping a cutscene) sees the result card
// before restarting. The button itself is disabled for that time, so it never eats a press.
function retry() {
  if (!(state === 'over' && lastRun && clock - overAt > 0.6)) return;
  // A cleared night moves on to the next; a lost one is flown again.
  if (lastRun.mode === 'story') startRun('story', pendingOver && pendingOver.story && pendingOver.story.cleared ? save.story.night : lastRun.night);
  else startRun(lastRun.mode);
}

function dashIntent() {
  audio.init();
  if (state === 'play') input = { ...input, dash: true };
}

function toggleSetting(key) {
  audio.init();
  const value = !save.settings[key];
  commit(withSetting(save, key, value));
  if (key !== 'haptic') audio.setEnabled({ [key]: value });
  if (value) audio.sfx.ui();
  if (openPanel) renderPanel(openPanel, save);
}

function setLanguage(code) {
  commit(withSetting(save, 'locale', code));
  setLocale(pickLocale(code, preferred()));
  applyStaticText();
  refreshMenu();
  if (openPanel) renderPanel(openPanel, save);
}

function showPanel(name) {
  openPanel = renderPanel(name, save) ? name : null;
  setScreen('menu');
}

function onUnitClick(id) {
  const result = buyUnit(save, id);
  if (result.ok) { commit(result.save); audio.sfx.power(); game = idleGame(); } else { audio.sfx.shield(); }
  renderPanel('units', save);
}

function replayTutorial() {
  startRun('tutorial');
}

async function shareRun() {
  if (!lastRun) return;
  const text = shareText(lastRun, runDate, t);
  const label = key => { $('shareBtn').textContent = t(key); };
  if (navigator.share) {
    try { await navigator.share({ text }); label('over.shared'); return; } catch (err) {
      if (err && err.name === 'AbortError') return; // the player closed the share sheet
    }
  }
  // No share sheet (desktop, embedded viewers): fall back to the clipboard.
  try { await navigator.clipboard.writeText(text); label('over.copied'); } catch (err) { label('over.copyFailed'); }
}

/* ---------- input wiring ---------- */
const FLAP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyD', 'KeyE'];

function onKey(e) {
  if (e.repeat) return;
  const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement;
  if (FLAP_KEYS.includes(e.code) || (e.code === 'Enter' && !onControl)) {
    if (onControl && state !== 'play' && state !== 'paused') return; // let the focused control activate natively
    e.preventDefault();
    holding = true;
    flapIntent();
  } else if (DASH_KEYS.includes(e.code)) {
    e.preventDefault();
    dashIntent();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (openPanel) showPanel(null); else togglePause();
  }
}

// Another tab wrote the save: adopt it rather than overwrite it with a stale copy.
function onStorage(e) {
  if (e.key !== SAVE_KEY || !e.newValue) return;
  save = ensureToday(loadSave(), dateKey());
  refreshMenu();
  if (openPanel) renderPanel(openPanel, save);
}

function click(id, handler) {
  $(id).addEventListener('click', e => {
    e.stopPropagation();
    e.currentTarget.blur();
    audio.init();
    handler(e);
  });
}

function onPanelClick(e) {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const unit = target.closest('[data-unit]');
  const setting = target.closest('[data-setting]');
  const action = target.closest('[data-action]');
  if (unit) onUnitClick(unit.dataset.unit);
  else if (setting) toggleSetting(setting.dataset.setting);
  else if (action && action.dataset.action === 'tutorial') replayTutorial();
}

function wire() {
  const release = () => { holding = false; };
  addEventListener('keydown', onKey);
  addEventListener('keyup', e => { if (FLAP_KEYS.includes(e.code) || e.code === 'Enter') release(); });
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('blur', release);
  addEventListener('resize', renderer.resize);
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); holding = true; flapIntent(); });
  $('dashBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dashIntent(); });
  $('over').addEventListener('pointerdown', e => { if (e.target === $('over')) flapIntent(); });
  click('playBtn', () => startRun('story'));
  click('endlessBtn', () => startRun('classic'));
  click('dailyBtn', () => startRun('daily'));
  click('trialBtn', () => startRun('trial'));
  click('retryBtn', retry);
  click('menuBtn', toMenu);
  click('quitBtn', toMenu);
  click('shareBtn', shareRun);
  click('resumeBtn', togglePause);
  click('pauseBtn', togglePause);
  click('reviveBtn', acceptRevive);
  click('skipBtn', finishRun);
  click('tutorialSkip', () => completeTutorial(true));
  click('panelClose', () => showPanel(null));
  click('sfxBtn', () => toggleSetting('sfx'));
  click('musicBtn', () => toggleSetting('music'));
  for (const tab of document.querySelectorAll('.tab[data-panel]')) {
    tab.addEventListener('click', () => { audio.init(); audio.sfx.ui(); showPanel(tab.dataset.panel); });
  }
  $('panelBody').addEventListener('click', onPanelClick);
  $('panelBody').addEventListener('change', e => {
    if (e.target instanceof HTMLSelectElement && 'locale' in e.target.dataset) setLanguage(e.target.value);
  });
  addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
}

/* ---------- frame loop ---------- */
function showHint(text, seconds) {
  $('coach').textContent = text;
  hintUntil = playT + seconds;
  show('coach', true);
}

function onEvent(e) {
  feedback(e, { g: game, birdX: birdX() });
  // Until the player has beaten Gangcheori once, every first meeting explains the fight.
  if (e.type === 'bossEnter' && !tutorial && save.stats.bossKills === 0) showHint(t('hint.boss'), 5);
  if (tutorial) {
    const next = advanceTutorial(tutorial, e);
    if (next !== tutorial) setTutorial(next);
  }
  // The boss trial is a single fight: it ends shortly after the dragon falls or flees.
  // Trials and story nights are single fights: the run ends shortly after the dragon falls or flees.
  if ((game.mode === 'trial' || game.mode === 'story') && (e.type === 'bossDown' || e.type === 'bossFlee')) endAt = playT + 1.6;
}

function advance(rdt) {
  if (fx.hitstop > 0) { fx.hitstop -= rdt; return; }
  const before = game.dist;
  playT += rdt;
  acc = Math.min(acc + rdt, STEP * 8);
  while (acc >= STEP && game.phase !== 'over') {
    if (tutorial && tutorial.step === 'dash') fillDash(game);
    step(game, STEP, { ...input, hold: holding });
    input = NO_INPUT;
    acc -= STEP;
    for (const e of drainEvents(game)) onEvent(e);
  }
  scroll += game.dist - before;
  if (game.phase !== 'play') show('dashBtn', false);
  if (hintUntil && playT >= hintUntil) { hintUntil = 0; if (!tutorial) show('coach', false); }
  if (game.phase === 'over') offerRevive();
  else if (endAt && playT >= endAt) { if (tutorial) completeTutorial(false); else finishRun(); }
}

function idle(rdt) {
  const bird = { ...game.bird, y: 300 + Math.sin(clock * 2.4) * 18, rot: Math.sin(clock * 2.4) * 0.15, wing: (Math.sin(clock * 12) + 1) / 2 };
  game = { ...game, bird, dist: game.dist + 120 * rdt };
  scroll += 120 * rdt;
}

function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  clock += rdt;
  if (state === 'play') { advance(rdt); audio.tick(); }
  else if (state === 'cutscene') tickCutscene(rdt);
  else if (state === 'menu') idle(rdt);
  else if (state === 'revive') {
    reviveT -= rdt;
    $('reviveCount').textContent = String(Math.max(1, Math.ceil(reviveT)));
    if (reviveT <= 0) finishRun();
  }
  if (state !== 'paused' && state !== 'cutscene') {
    const flying = (state === 'play' || state === 'menu') && game.phase === 'play';
    fx.update(rdt * game.timeScale, rdt, flying ? { wx: game.dist, y: game.bird.y } : null);
  }
  const unit = UNITS.find(u => u.id === game.unit) || activeUnit(save);
  const won = state === 'over' && game.mode === 'story' && pendingOver && pendingOver.story && pendingOver.story.cleared;
  renderer.draw({
    g: game, fx, unit, birdX: birdX(), scroll, clock, reducedMotion,
    hud: state === 'play' || state === 'paused', mode: game.mode, dateLabel: dateLabel(runDate),
    // Story nights show their own stage and the form reached before that night; elsewhere the
    // imugi flies in the best form the story has given it.
    stage: game.mode === 'story' ? nightDef(game.night).stage : 'palace',
    form: unit.id !== 'imugi' ? 0 : won ? pendingOver.story.to : game.mode === 'story' ? game.night - 1 : storyForm(save),
    cutscene: state === 'cutscene' ? cutscene : null,
  }, rdt);
  $('dashBtn').classList.toggle('ready', state === 'play' && game.dashMeter >= 1);
  requestAnimationFrame(frame);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  // The password-protected build ships no manifest and no worker: nothing may be cached there.
  if (!document.querySelector('link[rel="manifest"]')) return;
  // Offline support is a bonus: a failed registration must never block the game.
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// `?debug` exposes a read-only peek at the live state for automated play-testing.
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.__imugi = Object.freeze({ peek: () => ({ state, game, save, lastRun, tutorial, pending: telemetry.pending() }) });
}

renderer.resize();
wire();
applyStaticText();
refreshMenu();
setScreen('menu');
registerServiceWorker();
requestAnimationFrame(frame);
