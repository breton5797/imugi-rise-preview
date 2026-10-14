// DOM overlays: menu panels and the result card. Builds nodes with textContent only,
// so nothing read from storage or a locale file is ever interpreted as markup.
import { BOARD_SIZE, BOSS, CARD_BONUS, DRONE, FEVER, LOCALES, REVIVE, UNITS } from './config.js';
import { TABLES, getLocale, t } from './i18n.js';
import { rankOf } from './logic.js';
import { CARD_IDS, unlockedCards } from './progress.js';
import { drawBoss, drawCharm, drawCoin, drawUnit, drawWisp } from './sprites.js';

export const $ = id => document.getElementById(id);

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  const { text, cls, style, ...attrs } = props;
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = String(text);
  if (style) Object.assign(node.style, style);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const stat = (label, value, cls = '') => el('div', { cls: `stat ${cls}` }, [el('span', { text: label }), el('strong', { text: value })]);
const unitById = id => UNITS.find(u => u.id === id);
const missionText = item => t(`mission.${item.id}`, { n: item.goal });
const traitText = unit => t(`unit.${unit.id}.trait`, {
  score: unit.trait.ascendScore, n: unit.trait.giftEvery || unit.trait.shieldEvery,
});

// World cards borrow the sprite of the thing they describe.
const CARD_ART = {
  dancheong(ctx) {
    [[150, 62, 36], [44, 92, 58], [212, 70, 44], [0, 0, 94], [4, 78, 46]].forEach(([h, s, l], i) => {
      ctx.fillStyle = `hsl(${h},${s}%,${l}%)`; ctx.fillRect(-20, -17 + i * 7, 40, 7);
    });
  },
  yeopjeon(ctx) { ctx.scale(1.8, 1.8); drawCoin(ctx, 0); },
  dokkaebibul(ctx) { ctx.translate(0, 6); drawWisp(ctx, 0.4, 0); },
  yeouiju(ctx) { ctx.scale(0.9, 0.9); drawCharm(ctx, 'pearl', 0.3); },
  gangcheori(ctx) { ctx.translate(-4, 2); ctx.scale(0.42, 0.42); drawBoss(ctx, { clock: 0.5, charge: 0.6, hurt: false, hpFrac: 1 }); },
};

// A small canvas showing a unit or card sprite.
function thumb(id, locked = false) {
  const canvas = el('canvas', { cls: `thumb${locked ? ' locked' : ''}`, width: '144', height: '96', 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(2, 2);
  ctx.translate(40, 25);
  const unit = unitById(id);
  if (unit) drawUnit(ctx, unit, { flap: 0.5, clock: 0.6, ascended: false }); else CARD_ART[id](ctx);
  return canvas;
}

function missionRow(item) {
  const pct = `${Math.round((item.progress / item.goal) * 100)}%`;
  return el('div', { cls: `mission${item.done ? ' done' : ''}` }, [
    el('div', { cls: 'top' }, [el('span', { text: missionText(item) }), el('span', { cls: 'reward', text: `◎ ${item.reward}` })]),
    el('div', { cls: 'bar' }, [el('b', { style: { width: pct } })]),
    el('div', { cls: 'prog', text: item.done ? t('missions.done') : `${item.progress} / ${item.goal}` }),
  ]);
}

function missionsPanel(save) {
  return [
    el('div', { cls: 'list' }, save.missions.items.map(missionRow)),
    el('p', { cls: 'note', text: t('missions.note') }),
  ];
}

function unitCard(unit, save) {
  const owned = save.owned.includes(unit.id), on = save.unit === unit.id;
  const label = on ? t('units.equipped') : owned ? t('units.owned') : `◎ ${unit.cost}`;
  return el('button', { cls: `unit${on ? ' on' : ''}${owned ? '' : ' locked'}`, 'data-unit': unit.id, 'aria-pressed': String(on) }, [
    thumb(unit.id),
    el('span', { cls: 'name', text: t(`unit.${unit.id}.name`) }),
    el('span', { cls: 'trait', text: traitText(unit) }),
    ...(unit.trait.awake ? [el('span', { cls: 'awake', text: t(`awaken.${unit.id}.trait`) })] : []),
    el('span', { cls: 'cost', text: label }),
  ]);
}

function unitsPanel(save) {
  return [
    el('div', { cls: 'units' }, UNITS.map(u => unitCard(u, save))),
    el('p', { cls: 'note', text: t('units.note', { coins: save.shards }) }),
  ];
}

function loreCard(id, have) {
  return el('div', { cls: `lore${have ? '' : ' locked'}` }, [
    thumb(id, !have),
    el('div', {}, [
      el('strong', { text: have ? t(`card.${id}.name`) : '？？？' }),
      el('p', { text: have ? t(`card.${id}.lore`) : t('lore.locked') }),
    ]),
  ]);
}

function lorePanel(save) {
  const have = unlockedCards(save);
  const pct = Math.round(have.length * CARD_BONUS * 100);
  return [
    el('p', { cls: 'note', text: t('lore.note', { have: have.length, total: CARD_IDS.length, pct }) }),
    el('div', { cls: 'list' }, CARD_IDS.map(id => loreCard(id, have.includes(id)))),
  ];
}

function recordsPanel(save) {
  const rows = save.board.flatMap((e, i) => [
    el('span', { cls: 'n', text: `#${i + 1}` }), el('span', { cls: 's', text: e.score }),
    el('span', { cls: 'd', text: `${t(`unit.${e.unit}.name`)} · ${e.date}` }),
  ]);
  const st = save.stats;
  return [
    el('div', { cls: 'stats' }, [
      stat(t('stat.best'), save.best), stat(t('stat.daily'), save.daily.best), stat(t('stat.runs'), st.runs),
      stat(t('stat.gates'), st.gates), stat(t('stat.perfect'), st.perfects), stat(t('stat.combo'), st.maxCombo),
      stat(t('stat.wisps'), st.droneKills), stat(t('stat.bossHits'), st.bossHits), stat(t('stat.bossKills'), st.bossKills),
    ]),
    el('p', { cls: 'note', text: t('records.local', { n: BOARD_SIZE }) }),
    rows.length ? el('div', { cls: 'board' }, rows) : el('p', { cls: 'note', text: t('records.empty') }),
  ];
}

function helpPanel() {
  const params = { combo: FEVER.combo, time: FEVER.time, pts: DRONE.points, n: BOSS.every, hp: BOSS.hp, cost: REVIVE.cost };
  const rows = ['flap', 'dash', 'pause', 'perfect', 'fever', 'wisp', 'power', 'boss', 'revive', 'daily'];
  return [
    el('div', { cls: 'keys' }, rows.flatMap(r => [el('b', { text: t(`help.${r}.k`) }), el('span', { text: t(`help.${r}.v`, params) })])),
    el('button', { cls: 'btn alt small', 'data-action': 'tutorial', text: t('help.replay') }),
  ];
}

function toggleRow(key, save) {
  const on = save.settings[key];
  return el('div', { cls: 'setting' }, [
    el('span', { text: t(`settings.${key}`) }),
    el('button', { cls: `tab${on ? ' on' : ''}`, 'data-setting': key, 'aria-pressed': String(on), text: t(on ? 'settings.on' : 'settings.off') }),
  ]);
}

function settingsPanel(save) {
  const options = ['', ...LOCALES].map(code => {
    const opt = el('option', { value: code, text: code ? TABLES[code]['lang.name'] : t('settings.auto') });
    if (code === save.settings.locale) opt.selected = true;
    return opt;
  });
  return [
    el('label', { cls: 'setting' }, [el('span', { text: t('settings.language') }), el('select', { 'data-locale': '' }, options)]),
    toggleRow('sfx', save), toggleRow('music', save), toggleRow('haptic', save),
    el('p', { cls: 'note', text: t('settings.note') }),
  ];
}

const PANELS = {
  missions: { title: 'missions.title', build: missionsPanel },
  units: { title: 'units.title', build: unitsPanel },
  lore: { title: 'lore.title', build: lorePanel },
  records: { title: 'records.title', build: recordsPanel },
  help: { title: 'help.title', build: helpPanel },
  settings: { title: 'settings.title', build: settingsPanel },
};

export function renderPanel(name, save) {
  const panel = PANELS[name];
  if (!panel) return false;
  $('panelTitle').textContent = t(panel.title);
  $('panelBody').replaceChildren(...panel.build(save));
  return true;
}

/** Fill every element that carries a data-i18n / data-i18n-aria key. */
export function applyStaticText() {
  document.documentElement.lang = getLocale();
  document.title = `${t('meta.title')} — ${t('meta.subtitle')}`;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
  // The round dash button fits about four letters at full size; longer words get a smaller face.
  $('dashBtn').classList.toggle('long', [...t('hud.dashBtn')].length > 4);
}

/** @param {{ save: object, dateLabel: string, term: string }} data */
export function renderMenu({ save, dateLabel, term }) {
  $('shardCount').textContent = String(save.shards);
  $('dailyInfo').textContent = t('menu.dailyInfo', { date: dateLabel, term, best: save.daily.best });
  $('menuBest').textContent = save.best > 0 ? t('menu.best', { best: save.best }) : t('menu.start');
  $('missionDot').hidden = save.missions.items.every(it => it.done);
  $('trialBtn').hidden = !save.tutorialDone;
  $('endlessBtn').hidden = !save.tutorialDone;
  $('playBtn').textContent = save.story.ending ? t('menu.storyReplay') : t('menu.story', { n: save.story.night });
  $('sfxBtn').setAttribute('aria-pressed', String(save.settings.sfx));
  $('musicBtn').setAttribute('aria-pressed', String(save.settings.music));
}

export function setBoardLine(text) {
  $('oBoard').textContent = text;
  $('oBoard').hidden = !text;
}

/** @param {{ run: object, result: object, best: number, dateLabel: string, fled?: boolean }} data */
export function renderOver({ run, result, best, dateLabel, fled = false }) {
  const step = result.story;
  const cleared = (run.mode === 'trial' && run.bossKills > 0) || Boolean(step && step.cleared);
  const title = step && step.ending ? t('over.storyEnd')
    : step && step.cleared ? t('over.nightClear', { n: step.night })
      : fled ? t('over.nightFled') : t(cleared ? 'over.cleared' : 'over.title');
  $('oTitle').textContent = title;
  $('oTitle').classList.toggle('cool', cleared);
  $('oMode').textContent = run.mode === 'story' ? t(`night.${run.night}.name`) : t(`over.${run.mode}`, { date: dateLabel });
  $('retryBtn').textContent = step && step.cleared && !step.ending ? t('over.next') : t('over.retry');
  $('oScore').textContent = String(run.score);
  $('oRank').textContent = t('over.rank', { rank: rankOf(run.score) });
  $('oNew').hidden = !result.newBest || run.score === 0;
  $('oStats').replaceChildren(
    stat(t('stat.best'), best), stat(t('stat.gates'), run.gates), stat(t('stat.perfect'), run.perfects),
    stat(t('stat.combo'), run.maxCombo), stat(t('stat.bossHits'), run.bossHits), stat(t('stat.coins'), `+${result.earned}`, 'gold'),
  );
  const line = (text, reward) => el('div', { cls: 'mission done' }, [
    el('div', { cls: 'top' }, [el('span', { text }), el('span', { cls: 'reward', text: reward })]),
  ]);
  $('oMissions').replaceChildren(
    ...result.completed.map(it => line(t('over.missionDone', { text: missionText(it) }), `◎ ${it.reward}`)),
    ...result.newCards.map(id => line(t('over.newCard', { name: t(`card.${id}.name`) }), '✦')),
    ...(step && step.cleared ? [line(t('over.formNow', { form: t(`form.${step.to}`) }), '🐉')] : []),
    ...(step && step.ending ? [line(t('ending.unlock'), '✦')] : []),
  );
  setBoardLine(result.rank ? t('over.boardLocal', { rank: result.rank }) : '');
  $('shareBtn').textContent = t('over.share');
}

export function show(id, visible) { $(id).hidden = !visible; }
